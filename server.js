const express = require('express');
const { Server } = require('ws');
const path = require('path');
const twilio = require('twilio');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// For Heroku Eco Dynos - enable compression to reduce bandwidth usage
const compression = require('compression');
app.use(compression());

// Phục vụ static files
app.use(express.static(path.join(__dirname, './'), {
  maxAge: '1d' // Cache static files for 1 day to reduce server load
}));
app.use('/videos', express.static(path.join(__dirname, 'videos'))); // Serve video files explicitly

// Add a ping route for Heroku to keep the dyno awake
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Tạo HTTP server
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Tạo WebSocket server
const wss = new Server({ server });

// Lưu trữ các người dùng đang chờ ghép cặp
let waitingUsers = [];
// Lưu trữ các cặp chat đang hoạt động
const activeConnections = new Map();
// Lưu trữ ID của người dùng
const userIds = new Map();

// Hệ thống cache người dùng đã xem video
const userVideoCache = new Map(); // Map lưu trữ IP/userId -> Set of watched video IDs
const USER_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 ngày tính bằng milliseconds

// Thêm biến để theo dõi số người online thực tế
let baseOnlineCount = 5000; // Số người online mặc định
let onlineUsers = new Set(); // Dùng Set để tránh trùng lặp

// For memory management on Heroku Eco Dynos
const memoryMonitoring = {
  checkInterval: 60000, // Check every minute
  memoryLimit: 512, // Eco Dynos memory limit in MB
  lastCleanup: Date.now()
};

// Tạo ID ngẫu nhiên
function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

// Hàm kiểm tra trạng thái kết nối
function isSocketAlive(socket) {
    return socket.readyState === 1; // WebSocket.OPEN
}

// Hàm gửi tin nhắn an toàn
function safeSend(socket, message) {
    if (isSocketAlive(socket)) {
        try {
            socket.send(JSON.stringify(message));
        } catch (e) {
            console.error('Error sending message:', e);
        }
    }
}

// Hàm dọn dẹp các kết nối không hợp lệ
function cleanupConnections() {
    waitingUsers = waitingUsers.filter(socket => isSocketAlive(socket));
    for (const [socket, partner] of activeConnections.entries()) {
        if (!isSocketAlive(socket) || !isSocketAlive(partner)) {
            if (isSocketAlive(partner)) {
                safeSend(partner, { 
                    type: 'system', 
                    text: 'Stranger has disconnected' 
                });
            }
            activeConnections.delete(socket);
            activeConnections.delete(partner);
        }
    }
}

// Hàm dọn dẹp cache người dùng đã hết hạn
function cleanupUserVideoCache() {
    const now = Date.now();
    for (const [key, cacheData] of userVideoCache.entries()) {
        if (now - cacheData.lastAccess > USER_CACHE_EXPIRY) {
            userVideoCache.delete(key);
        }
    }
}

// Memory management function for Heroku Eco Dynos
function checkMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  const memoryUsedMB = Math.round(memoryUsage.rss / 1024 / 1024);
  console.log(`Memory usage: ${memoryUsedMB}MB / ${memoryMonitoring.memoryLimit}MB`);
  
  // If memory usage is getting close to the limit, perform garbage collection
  if (memoryUsedMB > memoryMonitoring.memoryLimit * 0.8) {
    console.log('High memory usage detected, performing cleanup');
    if (global.gc) {
      global.gc();
      console.log('Garbage collection completed');
    }
    
    // If memory is still high, implement more aggressive cleanup
    if (Date.now() - memoryMonitoring.lastCleanup > 300000) { // 5 minutes
      cleanupConnections();
      cleanupUserVideoCache(); // Dọn dẹp cache người dùng khi bộ nhớ cao
      memoryMonitoring.lastCleanup = Date.now();
    }
  }
}

// Hàm lấy IP của client
function getClientIP(socket) {
    // Lấy IP từ headers X-Forwarded-For hoặc từ socket
    const forwarded = socket.upgradeReq?.headers['x-forwarded-for'] || 
                     (socket._socket?.remoteAddress && { 'x-forwarded-for': socket._socket.remoteAddress });
    const remoteAddress = forwarded?.['x-forwarded-for'] || 
                         socket._socket?.remoteAddress || 
                         'unknown';
    return (typeof remoteAddress === 'string' ? remoteAddress : 'unknown').split(',')[0];
}

// Hàm gửi số người online cho tất cả clients
function broadcastOnlineCount() {
    const totalOnlineCount = Math.max(5000, baseOnlineCount + onlineUsers.size);
    wss.clients.forEach(client => {
        if (isSocketAlive(client)) {
            safeSend(client, {
                type: 'online_count',
                count: totalOnlineCount
            });
        }
    });
}

// Thêm hàm để đánh dấu video đã xem cho người dùng
function markVideoWatched(userIdentifier, videoPath) {
    if (!userIdentifier || !videoPath) return;
    
    if (!userVideoCache.has(userIdentifier)) {
        userVideoCache.set(userIdentifier, {
            watchedVideos: new Set(),
            lastAccess: Date.now()
        });
    }
    
    const userData = userVideoCache.get(userIdentifier);
    userData.watchedVideos.add(videoPath);
    userData.lastAccess = Date.now();
}

// Thêm hàm để kiểm tra xem người dùng đã xem video chưa
function hasUserWatchedVideo(userIdentifier, videoPath) {
    if (!userIdentifier || !videoPath) return false;
    
    if (!userVideoCache.has(userIdentifier)) {
        return false;
    }
    
    const userData = userVideoCache.get(userIdentifier);
    userData.lastAccess = Date.now(); // Cập nhật thời gian truy cập
    return userData.watchedVideos.has(videoPath);
}

// Thêm hàm để lấy danh sách video người dùng chưa xem
function getUnwatchedVideos(userIdentifier, videoList) {
    if (!userIdentifier || !videoList || videoList.length === 0) {
        return videoList; // Trả về danh sách đầy đủ nếu không có userIdentifier hoặc danh sách rỗng
    }
    
    // Nếu người dùng chưa có trong cache, trả về toàn bộ danh sách
    if (!userVideoCache.has(userIdentifier)) {
        return videoList;
    }
    
    const userData = userVideoCache.get(userIdentifier);
    userData.lastAccess = Date.now(); // Cập nhật thời gian truy cập
    
    // Lọc ra các video chưa xem
    const unwatchedVideos = videoList.filter(video => !userData.watchedVideos.has(video));
    
    // Nếu đã xem hết, reset lại cache và trả về toàn bộ danh sách
    if (unwatchedVideos.length === 0) {
        userData.watchedVideos.clear();
        return videoList;
    }
    
    return unwatchedVideos;
}

// Heroku Eco Dynos can sleep after 30 minutes of inactivity
// Setup a keepalive ping to prevent sleeping
setInterval(() => {
  fetch(`https://${process.env.HEROKU_APP_NAME}.herokuapp.com/ping`)
    .catch(err => console.log('Keepalive ping error:', err));
}, 1500000); // 25 minutes

wss.on('connection', (socket, req) => {
    console.log('New user connected');
    
    // Lấy IP của client
    const ip = getClientIP(socket);
    
    // Thêm user vào danh sách online
    onlineUsers.add(ip);
    
    // Gửi số người online ngay khi có kết nối mới
    broadcastOnlineCount();

    // Tạo ID cho người dùng mới
    const userId = generateUserId();
    userIds.set(socket, userId);
    
    // Tạo định danh người dùng độc nhất bằng cách kết hợp IP và userId
    const userIdentifier = `${ip}_${userId}`;
    
    // Lưu userIdentifier vào socket để sử dụng sau này
    socket.userIdentifier = userIdentifier;
    
    // Gửi ID cho người dùng ngay khi kết nối
    safeSend(socket, {
        type: 'userId',
        userId: userId
    });

    // Setup WebSocket ping/pong for Heroku (avoid 55s timeout)
    const pingInterval = setInterval(() => {
      if (isSocketAlive(socket)) {
        socket.ping(() => {});
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Xử lý khi người dùng muốn tìm người chat
    function findPartner(targetId = null) {
        cleanupConnections();

        if (activeConnections.has(socket)) {
            return;
        }

        if (targetId) {
            // Tìm socket của người dùng với ID cụ thể
            const targetSocket = Array.from(userIds.entries())
                .find(([sock, id]) => id === targetId && isSocketAlive(sock))?.[0];

            if (targetSocket && !activeConnections.has(targetSocket)) {
                // Thiết lập kết nối hai chiều
                activeConnections.set(socket, targetSocket);
                activeConnections.set(targetSocket, socket);

                // Thông báo cho cả hai người dùng
                const connectionMessage = {
                    type: 'system',
                    text: 'Connected with a stranger!'
                };
                safeSend(socket, connectionMessage);
                safeSend(targetSocket, connectionMessage);
            } else {
                safeSend(socket, {
                    type: 'system',
                    text: 'User not found or is busy'
                });
            }
            return;
        }

        // Tìm người ngẫu nhiên
        if (waitingUsers.length > 0) {
            // Lấy người đầu tiên trong hàng đợi
            const partner = waitingUsers.shift();
            
            if (isSocketAlive(partner) && !activeConnections.has(partner)) {
                // Thiết lập kết nối hai chiều
                activeConnections.set(socket, partner);
                activeConnections.set(partner, socket);

                // Thông báo cho cả hai người dùng
                const connectionMessage = {
                    type: 'system',
                    text: 'Connected with a stranger!'
                };
                safeSend(socket, connectionMessage);
                safeSend(partner, connectionMessage);
            } else {
                // Nếu partner không hợp lệ, thử tìm lại
                findPartner();
            }
        } else {
            // Thêm vào danh sách chờ
            waitingUsers.push(socket);
            safeSend(socket, {
                type: 'system',
                text: 'Waiting for a stranger...'
            });
        }
    }

    // Xử lý tin nhắn
    socket.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            
            if (parsedMessage.type === 'connectTo') {
                findPartner(parsedMessage.targetId);
                return;
            }
            
            // Xử lý yêu cầu đánh dấu video đã xem
            if (parsedMessage.type === 'videoWatched') {
                if (parsedMessage.videoPath) {
                    markVideoWatched(socket.userIdentifier, parsedMessage.videoPath);
                }
                return;
            }
            
            // Xử lý yêu cầu lấy danh sách video chưa xem
            if (parsedMessage.type === 'getUnwatchedVideos') {
                // Lấy danh sách video
                const videosDir = path.join(__dirname, 'videos');
                let videoList = [];
                
                if (fs.existsSync(videosDir)) {
                    try {
                        const files = fs.readdirSync(videosDir);
                        videoList = files
                            .filter(file => {
                                const extension = path.extname(file).toLowerCase();
                                return ['.mp4', '.webm', '.mov', '.avi'].includes(extension);
                            })
                            .map(file => `/videos/${file}`);
                    } catch (error) {
                        console.error('Error listing videos:', error);
                    }
                }
                
                // Lọc ra các video người dùng chưa xem
                const unwatchedVideos = getUnwatchedVideos(socket.userIdentifier, videoList);
                
                // Gửi danh sách video chưa xem cho người dùng
                safeSend(socket, {
                    type: 'unwatchedVideos',
                    videos: unwatchedVideos
                });
                
                return;
            }

            const partner = activeConnections.get(socket);
            if (partner && isSocketAlive(partner)) {
                safeSend(partner, parsedMessage);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    // Xử lý ngắt kết nối
    socket.on('close', () => {
        clearInterval(pingInterval);
        
        const partner = activeConnections.get(socket);
        if (partner && isSocketAlive(partner)) {
            safeSend(partner, {
                type: 'system',
                text: 'Stranger has disconnected'
            });
        }

        // Dọn dẹp các kết nối
        activeConnections.delete(socket);
        if (partner) {
            activeConnections.delete(partner);
        }
        waitingUsers = waitingUsers.filter(user => user !== socket);
        userIds.delete(socket);

        cleanupConnections();

        // Xóa user khỏi danh sách
        onlineUsers.delete(ip);
        
        // Gửi lại số người online mới
        broadcastOnlineCount();
    });

    // Tìm người chat ngay khi kết nối
    findPartner();
});

// Định kỳ dọn dẹp các kết nối không hợp lệ và kiểm tra sử dụng bộ nhớ
setInterval(() => {
  cleanupConnections();
  checkMemoryUsage();
}, 30000);

// Định kỳ dọn dẹp cache người dùng hết hạn
setInterval(cleanupUserVideoCache, 3600000); // Mỗi giờ

// Gửi số người online định kỳ
setInterval(broadcastOnlineCount, 60000);

// Heroku graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Notify all connected clients
  wss.clients.forEach(client => {
    if (isSocketAlive(client)) {
      safeSend(client, {
        type: 'system',
        text: 'Server is shutting down for maintenance. Please reconnect in a few minutes.'
      });
    }
  });
  
  // Close the WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
    
    // Close the HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Xử lý lỗi process
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Thêm route để lấy thông tin TURN server
app.get('/get-turn-credentials', (req, res) => {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    client.tokens.create().then(token => {
        res.json(token.iceServers);
    }).catch(err => {
        console.error('Error getting TURN server info:', err);
        res.status(500).json({ error: 'Unable to get TURN server info' });
    });
});

// Thêm endpoint để liệt kê videos
app.get('/list-videos', (req, res) => {
    const videosDir = path.join(__dirname, 'videos');
    
    // Kiểm tra nếu thư mục videos tồn tại
    if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
        console.log('Created videos directory');
    }
    
    try {
        const files = fs.readdirSync(videosDir);
        const videoFiles = files.filter(file => {
            const extension = path.extname(file).toLowerCase();
            return ['.mp4', '.webm', '.mov', '.avi'].includes(extension);
        }).map(file => `/videos/${file}`);
        
        // Lấy IP của client từ request để có thể lọc video chưa xem
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const clientIp = ip.split(',')[0];
        
        // Kiểm tra xem client có gửi kèm userId không
        const userId = req.query.userId;
        const userIdentifier = userId ? `${clientIp}_${userId}` : clientIp;
        
        // Lọc ra các video người dùng chưa xem
        const unwatchedVideos = getUnwatchedVideos(userIdentifier, videoFiles);
        
        res.json(unwatchedVideos);
    } catch (error) {
        console.error('Error listing videos:', error);
        res.status(500).json({ error: 'Failed to list videos' });
    }
}); 