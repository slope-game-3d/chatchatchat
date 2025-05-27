const DEBUG = true;

function log(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

let socket;
let userId; // Lưu trữ ID của người dùng hiện tại
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const nextButton = document.getElementById('nextButton');
let localStream;
let peerConnection;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const statusIndicator = document.querySelector('.status-indicator');
const statusText = document.querySelector('.status-text');
const chatMode = localStorage.getItem('chatMode') || 'text';
const videoContainer = document.querySelector('.video-container');

// Thêm biến toàn cục
let autoConnectInterval;
let isAutoConnecting = false;

// Thêm biến để theo dõi thời gian kết nối
let lastConnectionTime = 0;

// Thêm biến để theo dõi thời gian cuối cùng nhấn nút
let lastTap = 0;

// Thêm các biến cho nút fullscreen
const fullscreenLocalBtn = document.getElementById('fullscreenLocal');
const fullscreenRemoteBtn = document.getElementById('fullscreenRemote');

// Thêm biến để theo dõi trạng thái kết nối
let isConnected = false;

// Thêm biến để theo dõi trạng thái WebSocket
let isClosingSocket = false;

// Thêm biến để quản lý trạng thái kết nối
let isReconnecting = false;
let reconnectTimeout = null;

// Thêm biến để theo dõi số lần thử kết nối lại
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Thêm biến để theo dõi số người online
let onlineCount = 0;

// Thêm object chứa các emoji theo category
const emojis = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘'],
    gestures: ['👋', '🤚', '✋', '🖐️', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉'],
    love: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭']
};

// Thêm biến để theo dõi thời gian đếm ngược
let autoConnectCountdown = null;
let countdownInterval = null;

// Thêm biến để quản lý timeout khi tìm người
let matchTimeoutId = null;
let videoPlayer = null;
let isPlayingRandomVideo = false;
const randomVideoTimeout = 5000; // Giảm từ 8s xuống 5s để match nhanh hơn
const randomVideoAfterNextTimeout = 6000; // Giảm từ 10s xuống 6s

// Danh sách video mẫu - sẽ được thay thế bằng danh sách thực từ server
let availableVideos = [
    'https://papasfreezeria.one/video/97671472-179909.mp4',
    'https://papasfreezeria.one/video/almiraa68_2025.01.07_16.06.42.mp4',
    'https://papasfreezeria.one/video/almiraa68_2025.01.16_14.33.07.mp4',
    'https://papasfreezeria.one/video/video_2025-04-11_22-58-20.mp4'
];

// Thêm biến để theo dõi video đã xem
let watchedVideos = new Set();

// Thêm biến để quản lý video đã xem
let currentPlayingVideo = null;

// Thêm hàm để shuffle mảng
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Cập nhật hàm fetchAvailableVideos để yêu cầu danh sách video chưa xem
async function fetchAvailableVideos() {
    try {
        // Yêu cầu danh sách video chưa xem từ server
        const url = userId ? `/list-videos?userId=${userId}` : '/list-videos';
        const response = await fetch(url);
        
        if (response.ok) {
            const serverVideos = await response.json();
            log('Fetched unwatched videos list:', serverVideos);
            
            // Nếu server trả về danh sách video không rỗng thì sử dụng danh sách đó
            if (serverVideos && serverVideos.length > 0) {
                // Shuffle kỹ hơn bằng cách thực hiện nhiều lần
                availableVideos = serverVideos;
                for (let i = 0; i < 3; i++) {
                    availableVideos = shuffleArray([...availableVideos]);
                }
            } else {
                log('Server returned empty video list, using default videos');
                // Shuffle danh sách video mặc định
                availableVideos = [
                    'https://papasfreezeria.one/video/97671472-179909.mp4',
                    'https://papasfreezeria.one/video/almiraa68_2025.01.07_16.06.42.mp4',
                    'https://papasfreezeria.one/video/almiraa68_2025.01.16_14.33.07.mp4',
                    'https://papasfreezeria.one/video/video_2025-04-11_22-58-20.mp4'
                ];
                for (let i = 0; i < 3; i++) {
                    availableVideos = shuffleArray([...availableVideos]);
                }
            }
        } else {
            log('Failed to fetch videos, using default list');
            // Shuffle danh sách video mặc định
            availableVideos = [
                'https://papasfreezeria.one/video/97671472-179909.mp4',
                'https://papasfreezeria.one/video/almiraa68_2025.01.07_16.06.42.mp4',
                'https://papasfreezeria.one/video/almiraa68_2025.01.16_14.33.07.mp4',
                'https://papasfreezeria.one/video/video_2025-04-11_22-58-20.mp4'
            ];
            for (let i = 0; i < 3; i++) {
                availableVideos = shuffleArray([...availableVideos]);
            }
        }
    } catch (error) {
        console.error('Error fetching video list:', error);
        // Shuffle danh sách video mặc định
        availableVideos = [
            'https://papasfreezeria.one/video/97671472-179909.mp4',
            'https://papasfreezeria.one/video/almiraa68_2025.01.07_16.06.42.mp4',
            'https://papasfreezeria.one/video/almiraa68_2025.01.16_14.33.07.mp4',
            'https://papasfreezeria.one/video/video_2025-04-11_22-58-20.mp4'
        ];
        for (let i = 0; i < 3; i++) {
            availableVideos = shuffleArray([...availableVideos]);
        }
    }
    
    console.log('Final video list to use (shuffled):', availableVideos);
}

// Thêm hàm để gửi báo cáo video đã xem
function reportVideoWatched(videoPath) {
    if (!videoPath || !socket || socket.readyState !== WebSocket.OPEN) return;
    
    try {
        socket.send(JSON.stringify({
            type: 'videoWatched',
            videoPath: videoPath
        }));
        log('Reported watched video:', videoPath);
    } catch (error) {
        console.error('Error reporting watched video:', error);
    }
}

// Thêm hàm để yêu cầu danh sách video chưa xem trực tiếp từ WebSocket
function requestUnwatchedVideos() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    try {
        socket.send(JSON.stringify({
            type: 'getUnwatchedVideos'
        }));
        log('Requested unwatched videos list');
    } catch (error) {
        console.error('Error requesting unwatched videos:', error);
    }
}

// Thêm hàm phát video ngẫu nhiên
function playRandomVideo() {
    if (isConnected || isPlayingRandomVideo) return;
    
    // Nếu danh sách video trống hoặc đã xem hết, yêu cầu danh sách mới
    if (!availableVideos || availableVideos.length === 0) {
        log('No videos available, requesting new list');
        
        // Yêu cầu danh sách video chưa xem trực tiếp từ WebSocket nếu đang kết nối
        if (socket && socket.readyState === WebSocket.OPEN) {
            requestUnwatchedVideos();
            
            // Đặt handler cho việc nhận danh sách video
            const videoListHandler = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'unwatchedVideos') {
                        // Cập nhật danh sách video và phát nếu có video
                        availableVideos = data.videos;
                        if (availableVideos && availableVideos.length > 0) {
                            // Shuffle danh sách
                            availableVideos = shuffleArray([...availableVideos]);
                            // Xóa handler và tiếp tục phát video
                            socket.removeEventListener('message', videoListHandler);
                            playRandomVideo();
                        }
                    }
                } catch (error) {
                    console.error('Error handling video list response:', error);
                }
            };
            
            // Thêm handler tạm thời
            socket.addEventListener('message', videoListHandler);
            
            // Đặt timeout để tránh treo nếu không nhận được phản hồi
            setTimeout(() => {
                socket.removeEventListener('message', videoListHandler);
                // Nếu vẫn không có video, sử dụng danh sách mặc định
                if (!availableVideos || availableVideos.length === 0) {
                    availableVideos = [
                        'https://papasfreezeria.one/video/97671472-179909.mp4',
                        'https://papasfreezeria.one/video/almiraa68_2025.01.07_16.06.42.mp4',
                        'https://papasfreezeria.one/video/almiraa68_2025.01.16_14.33.07.mp4',
                        'https://papasfreezeria.one/video/video_2025-04-11_22-58-20.mp4'
                    ];
                    availableVideos = shuffleArray([...availableVideos]);
                    playRandomVideo();
                }
            }, 3000);
            
            return;
        } else {
            // Nếu không kết nối WebSocket, dùng fetch API
            fetchAvailableVideos().then(() => {
                if (availableVideos && availableVideos.length > 0) {
                    playRandomVideo();
                }
            });
            return;
        }
    }
    
    isPlayingRandomVideo = true;
    
    // Chọn video ngẫu nhiên từ danh sách
    const randomIndex = Math.floor(Math.random() * availableVideos.length);
    currentPlayingVideo = availableVideos[randomIndex];
    
    // Đánh dấu video này đã xem
    reportVideoWatched(currentPlayingVideo);
    
    // Tạo element video nếu chưa có
    if (!videoPlayer) {
        videoPlayer = document.createElement('video');
        videoPlayer.style.width = '100%';
        videoPlayer.style.height = '100%';
        videoPlayer.style.objectFit = 'cover';
        videoPlayer.style.position = 'absolute';
        videoPlayer.style.top = '0';
        videoPlayer.style.left = '0';
        videoPlayer.style.zIndex = '1';
        videoPlayer.controls = false;
        videoPlayer.autoplay = true;
        videoPlayer.muted = false;
        videoPlayer.playsInline = true;
        videoPlayer.loop = false; // Tắt loop video
        videoPlayer.disablePictureInPicture = true;
        
        // Thêm event listener cho khi video kết thúc
        videoPlayer.addEventListener('ended', handleVideoEnd);
        
        // Ngăn chặn menu chuột phải
        videoPlayer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        
        const remoteWrapper = document.querySelector('.video-wrapper.remote');
        
        if (remoteVideo) {
            remoteVideo.style.display = 'none';
        }
        
        const strangerLabel = remoteWrapper.querySelector('.video-label');
        if (strangerLabel) {
            strangerLabel.style.zIndex = '2';
            strangerLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            strangerLabel.style.color = 'white';
            strangerLabel.textContent = 'Stranger';
        }
        
        remoteWrapper.appendChild(videoPlayer);
    }
    
    // Set nguồn video
    videoPlayer.src = currentPlayingVideo;
    videoPlayer.style.display = 'block';
    
    // Phát video
    playVideoSafely(videoPlayer).catch(error => {
        console.error('Error playing video:', error);
        stopRandomVideo();
        
        // Nếu không phát được video, thử video khác sau 1 giây
        setTimeout(() => {
            if (!isConnected) {
                // Xóa video hiện tại khỏi danh sách để tránh lặp lại
                availableVideos = availableVideos.filter(v => v !== currentPlayingVideo);
                currentPlayingVideo = null;
                
                // Nếu còn video trong danh sách, thử phát video khác
                if (availableVideos.length > 0) {
                    playRandomVideo();
                } else {
                    // Nếu hết video, yêu cầu danh sách mới
                    fetchAvailableVideos();
                }
            }
        }, 1000);
    });
    
    // Thay đổi trạng thái thành "đã kết nối"
    updateConnectionStatus('connected');
    addSystemMessage('Connected with a stranger!');
}

function stopRandomVideo() {
    if (!isPlayingRandomVideo) return;
    
    isPlayingRandomVideo = false;
    
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = '';
        videoPlayer.style.display = 'none';
        
        const remoteWrapper = document.querySelector('.video-wrapper.remote');
        
        if (remoteVideo) {
            remoteVideo.style.display = 'block';
        }
        
        const strangerLabel = remoteWrapper.querySelector('.video-label');
        if (strangerLabel) {
            strangerLabel.style.backgroundColor = '';
            strangerLabel.style.color = '';
        }
    }
    
    // Xóa video hiện tại khỏi danh sách để tránh lặp lại ngay lập tức
    if (currentPlayingVideo) {
        availableVideos = availableVideos.filter(v => v !== currentPlayingVideo);
        currentPlayingVideo = null;
    }
}

// Thêm hàm lấy thông tin TURN server từ Twilio
async function getTurnCredentials() {
    try {
        const response = await fetch('/get-turn-credentials');
        const credentials = await response.json();
        return credentials;
    } catch (error) {
        console.error('Lỗi khi lấy thông tin TURN server:', error);
        return null;
    }
}

// Cấu hình STUN/TURN servers
const configuration = {
    iceServers: [
        {
            urls: [
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302'
            ]
        },
        {
            urls: 'turn:your-turn-server.com:3478',
            username: 'your-username',
            credential: 'your-password'
        }
    ],
    iceCandidatePoolSize: 10
};

// Thêm nút fullscreen vào video container
function addFullscreenButton() {
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'fullscreen-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    videoContainer.appendChild(fullscreenBtn);

    // Xử lý sự kiện click
    fullscreenBtn.addEventListener('click', toggleFullscreen);
}

// Thêm các hàm xử lý fullscreen
function toggleFullscreen(element) {
    if (!document.fullscreenElement) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// Thêm event listeners cho nút fullscreen
document.addEventListener('DOMContentLoaded', () => {
    const fullscreenLocalBtn = document.getElementById('fullscreenLocal');
    const fullscreenRemoteBtn = document.getElementById('fullscreenRemote');
    const localWrapper = document.querySelector('.video-wrapper.local');
    const remoteWrapper = document.querySelector('.video-wrapper.remote');

    fullscreenLocalBtn.addEventListener('click', () => {
        const isFullscreen = localWrapper.classList.contains('fullscreen');
        
        // Remove fullscreen from both wrappers
        localWrapper.classList.remove('fullscreen');
        remoteWrapper.classList.remove('fullscreen');
        
        if (!isFullscreen) {
            localWrapper.classList.add('fullscreen');
            fullscreenLocalBtn.querySelector('i').classList.replace('fa-expand', 'fa-compress');
        } else {
            fullscreenLocalBtn.querySelector('i').classList.replace('fa-compress', 'fa-expand');
        }
    });

    fullscreenRemoteBtn.addEventListener('click', () => {
        const isFullscreen = remoteWrapper.classList.contains('fullscreen');
        
        // Remove fullscreen from both wrappers
        localWrapper.classList.remove('fullscreen');
        remoteWrapper.classList.remove('fullscreen');
        
        if (!isFullscreen) {
            remoteWrapper.classList.add('fullscreen');
            fullscreenRemoteBtn.querySelector('i').classList.replace('fa-expand', 'fa-compress');
        } else {
            fullscreenRemoteBtn.querySelector('i').classList.replace('fa-compress', 'fa-expand');
        }
    });

    // Handle ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            localWrapper.classList.remove('fullscreen');
            remoteWrapper.classList.remove('fullscreen');
            fullscreenLocalBtn.querySelector('i').classList.replace('fa-compress', 'fa-expand');
            fullscreenRemoteBtn.querySelector('i').classList.replace('fa-compress', 'fa-expand');
        }
    });
});

// Cập nhật hàm playVideoSafely
async function playVideoSafely(videoElement) {
    try {
        // Kiểm tra xem video có srcObject không
        if (!videoElement.srcObject) {
            return;
        }

        // Đợi video sẵn sàng
        if (videoElement.readyState >= 2) { // HAVE_CURRENT_DATA
            try {
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    await playPromise;
                }
            } catch (error) {
                if (error.name === 'NotAllowedError') {
                    console.log('Autoplay prevented by browser');
                } else if (error.name === 'AbortError') {
                    console.log('Play request was interrupted, will retry');
                    // Thử lại sau một khoảng thời gian ngắn
                    setTimeout(() => playVideoSafely(videoElement), 1000);
                } else {
                    console.error('Error playing video:', error);
                }
            }
        } else {
            // Đợi video load đủ dữ liệu
            videoElement.addEventListener('loadeddata', async () => {
                try {
                    await videoElement.play();
                } catch (error) {
                    console.error('Error playing video after load:', error);
                }
            }, { once: true });
        }
    } catch (error) {
        console.error('Error in playVideoSafely:', error);
    }
}

// Cập nhật hàm initializeMedia
async function initializeMedia() {
    if (chatMode === 'text') {
        videoContainer.style.display = 'none';
        return true;
    }

    try {
        // Dừng stream cũ nếu có
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        console.log('Got local stream:', localStream.getTracks());
        
        // Dừng video cũ nếu đang phát
        if (localVideo.srcObject) {
            try {
                localVideo.pause();
                const tracks = localVideo.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch (error) {
                console.error('Error stopping old video:', error);
            }
        }

        localVideo.srcObject = localStream;
        
        // Đợi một chút trước khi phát video
        setTimeout(() => {
            playVideoSafely(localVideo);
        }, 100);

        // Thêm event listeners cho các nút điều khiển
        toggleVideoBtn.addEventListener('click', toggleVideo);
        toggleAudioBtn.addEventListener('click', toggleAudio);
        
        return true;
    } catch (e) {
        console.error('Lỗi khi truy cập camera:', e);
        addSystemMessage('Không thể truy cập camera hoặc microphone. Lỗi: ' + e.message);
        return false;
    }
}

// Bật/tắt video
function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    toggleVideoBtn.textContent = videoTrack.enabled ? 'Camera off' : 'Camera on';
    toggleVideoBtn.classList.toggle('disabled');
}

// Bật/tắt audio
function toggleAudio() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    toggleAudioBtn.textContent = audioTrack.enabled ? 'Mic off' : 'Mic on';
    toggleAudioBtn.classList.toggle('disabled');
}

// Cập nhật hàm initializePeerConnection
async function initializePeerConnection() {
    try {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        peerConnection = new RTCPeerConnection(configuration);
        console.log('PeerConnection created');

        // Thêm local stream
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('Adding local track to peer connection:', track.kind);
                peerConnection.addTrack(track, localStream);
            });
        }

        // Xử lý remote stream
        peerConnection.ontrack = event => {
            console.log('Received remote track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                console.log('Setting remote stream');
                remoteVideo.srcObject = event.streams[0];
                
                // Thêm event listener để đảm bảo video được phát
                remoteVideo.onloadedmetadata = () => {
                    console.log('Remote video metadata loaded');
                    playVideoSafely(remoteVideo);
                };
            }
        };

        // Xử lý ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log('Sending ICE candidate');
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'webrtc',
                        webrtcData: {
                            type: 'candidate',
                            candidate: event.candidate
                        }
                    }));
                }
            }
        };

        // Xử lý trạng thái kết nối ICE
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
            switch(peerConnection.iceConnectionState) {
                case 'checking':
                    addSystemMessage('Checking video connection...');
                    break;
                case 'connected':
                    addSystemMessage('Video connection established');
                    break;
                case 'failed':
                    console.log('ICE connection failed, restarting...');
                    addSystemMessage('Video connection failed, trying to reconnect...');
                    restartIce();
                    break;
                case 'disconnected':
                    addSystemMessage('Video connection disconnected');
                    break;
            }
        };

        // Thêm xử lý negotiation
        peerConnection.onnegotiationneeded = async () => {
            try {
                console.log('Creating offer...');
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);
                
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'webrtc',
                        webrtcData: {
                            type: 'offer',
                            offer: peerConnection.localDescription
                        }
                    }));
                }
            } catch (e) {
                console.error('Error during negotiation:', e);
            }
        };

        return true;
    } catch (error) {
        console.error('Error initializing peer connection:', error);
        return false;
    }
}

// Thêm hàm restart ICE
async function restartIce() {
    try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.send(JSON.stringify({
            type: 'webrtc',
            webrtcData: {
                type: 'offer',
                offer: offer
            }
        }));
    } catch (e) {
        console.error('Lỗi khi restart ICE:', e);
    }
}

// Cập nhật hàm updateConnectionStatus
function updateConnectionStatus(status) {
    switch(status) {
        case 'connecting':
            statusIndicator.style.backgroundColor = '#ffd700'; // Màu vàng
            statusText.textContent = 'Connecting...';
            isConnected = false;
            break;
        case 'connected':
            statusIndicator.style.backgroundColor = '#4CAF50'; // Màu xanh
            statusText.textContent = 'Connected';
            isConnected = true; // Đánh dấu đã kết nối
            lastConnectionTime = Date.now();
            break;
        case 'disconnected':
            statusIndicator.style.backgroundColor = '#ff4444'; // Màu đỏ
            statusText.textContent = 'Disconnected';
            isConnected = false;
            break;
        case 'waiting':
            statusIndicator.style.backgroundColor = '#2196F3'; // Màu xanh dương
            statusText.textContent = 'Waiting for stranger...';
            isConnected = false;
            break;
    }
}

// Cập nhật hàm connectWebSocket để chỉnh sửa quá trình kết nối
function connectWebSocket() {
    if (isReconnecting || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached or already reconnecting');
        return;
    }

    // Đóng socket cũ một cách an toàn
    closeSocketSafely();

    isReconnecting = true;
    reconnectAttempts++;

    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname === 'localhost' ? 
            `${window.location.hostname}:3000` : 
            window.location.host;
        const wsUrl = `${protocol}//${host}`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        socket = new WebSocket(wsUrl);
        
        // Thiết lập timeout cho kết nối
        const connectionTimeout = setTimeout(() => {
            if (socket && socket.readyState !== WebSocket.OPEN) {
                console.log('Connection timeout, closing socket');
                closeSocketSafely();
                connectWebSocket(); // Thử kết nối lại
            }
        }, 5000);

        socket.onopen = async () => {
            clearTimeout(connectionTimeout);
            console.log('WebSocket connected successfully');
            isClosingSocket = false;
            isReconnecting = false;
            reconnectAttempts = 0;
            updateConnectionStatus('waiting');
            
            // Khởi tạo media trước khi tìm partner
            const mediaInitialized = await initializeMedia();
            console.log('Media initialized:', mediaInitialized);
            
            if (mediaInitialized && chatMode === 'video') {
                await initializePeerConnection();
            }
            
            // Xóa timeout cũ nếu có
            if (matchTimeoutId) {
                clearTimeout(matchTimeoutId);
            }
            
            // Đặt timeout để phát video ngẫu nhiên nếu không tìm được người
            matchTimeoutId = setTimeout(() => {
                if (!isConnected) {
                    console.log('No match found, playing random video');
                    playRandomVideo();
                }
            }, randomVideoTimeout);
        };

        socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Xử lý danh sách video chưa xem
                if (data.type === 'unwatchedVideos') {
                    availableVideos = data.videos;
                    log('Received unwatched videos list:', availableVideos);
                    // Shuffle danh sách video
                    if (availableVideos && availableVideos.length > 0) {
                        availableVideos = shuffleArray([...availableVideos]);
                    }
                    return;
                }
                
                log('Received message:', data);

                switch (data.type) {
                    case 'userId':
                        userId = data.userId;
                        log('User ID set to:', userId);
                        break;

                    case 'system':
                        // Xử lý các thông báo hệ thống
                        if (data.text === 'Connected with a stranger!') {
                            log('Connected with stranger, handling connection');
                            // Ưu tiên kết nối với người thật
                            if (isPlayingRandomVideo) {
                                stopRandomVideo();
                            }
                            handleUserConnected();
                        } else if (data.text === 'Stranger has disconnected') {
                            log('Stranger disconnected, handling disconnect');
                            handleDisconnect();
                            // Lưu ý: không cần thêm addSystemMessage ở đây vì đã được gọi trong handleDisconnect
                            break;
                        } else if (data.text === 'Waiting for a stranger...') {
                            updateConnectionStatus('waiting');
                            isConnected = false;
                            
                            // Hiển thị thông báo
                            addSystemMessage(data.text);
                            
                            // Đặt timeout để phát video ngẫu nhiên nếu không tìm được người
                            if (!isAutoConnecting && !matchTimeoutId) {
                                matchTimeoutId = setTimeout(() => {
                                    if (!isConnected) {
                                        playRandomVideo();
                                    }
                                }, randomVideoTimeout);
                            }
                            break;
                        } else {
                            // Hiển thị các thông báo hệ thống khác
                            addSystemMessage(data.text);
                        }
                        break;

                    case 'message':
                        addMessage(data.text, 'stranger');
                        break;

                    case 'webrtc':
                        handleWebRTCMessage(data);
                        break;

                    case 'online_count':
                        // Cập nhật số người online
                        if (data.count) {
                            const onlineCountElement = document.getElementById('onlineCount');
                            if (onlineCountElement) {
                                onlineCountElement.textContent = formatOnlineCount(data.count);
                        }
                        }
                        break;

                    default:
                        log('Unknown message type:', data.type);
                }
            } catch (error) {
                console.error('Error handling socket message:', error);
            }
        });
        
        socket.onclose = (event) => {
            console.log('WebSocket closed with code:', event.code);
            if (!isClosingSocket && !isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                updateConnectionStatus('disconnected');
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                reconnectTimeout = setTimeout(() => {
                    if (!isClosingSocket) {
                        console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                        connectWebSocket();
                    }
                }, delay);
            }
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (!isClosingSocket) {
                updateConnectionStatus('disconnected');
            }
        };

    } catch (error) {
        console.error('Error creating WebSocket:', error);
        updateConnectionStatus('disconnected');
        isReconnecting = false;
    }
}

// Thêm hàm đóng socket an toàn
function closeSocketSafely() {
    if (socket) {
        try {
            isClosingSocket = true;
            // Xóa tất cả event listeners
            socket.onclose = null;
            socket.onerror = null;
            socket.onmessage = null;
            socket.onopen = null;
            
            // Đóng socket nếu đang mở
            if (socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
            socket = null;
        } catch (error) {
            console.error('Error closing socket:', error);
        }
    }
}

// Thêm tin nhắn vào khung chat
function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Thêm tin nhắn hệ thống
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system');
    
    // Translate messages
    switch(text) {
        case 'Connecting...':
            text = 'Connecting...';
            break;
        case 'Connected with a stranger':
            text = 'Connected with a stranger!';
            break;
        case 'Stranger has disconnected':
            text = 'Stranger has disconnected';
            break;
        case 'ĐWaiting for a stranger...':
            text = 'Waiting for a stranger...';
            break;
        case 'Lost connection to server':
            text = 'Lost connection to server';
            break;
        case 'Connection error':
            text = 'Connection error';
            break;
        case 'Looking for a stranger...':
            text = 'Looking for a stranger...';
            break;
        case 'Video connection successful!':
            text = 'Video connection successful!';
            break;
        case 'Video connection failed. Retrying...':
            text = 'Video connection failed. Retrying...';
            break;
        case 'Setting up video connection...':
            text = 'Setting up video connection...';
            break;
    }
    
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Cập nhật hàm toggleAutoConnect
function toggleAutoConnect() {
    const autoConnectBtn = document.getElementById('autoConnectBtn');
    const statusBadge = autoConnectBtn.querySelector('.status-badge');
    
    if (isAutoConnecting) {
        // Tắt auto connect
        isAutoConnecting = false;
        statusBadge.textContent = 'Off';
        clearInterval(autoConnectInterval);
        // Xóa đếm ngược
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    } else {
        // Bật auto connect
        isAutoConnecting = true;
        statusBadge.textContent = '10s';
        autoConnectCountdown = 10;
        
        // Bắt đầu đếm ngược
        countdownInterval = setInterval(() => {
            autoConnectCountdown--;
            if (autoConnectCountdown >= 0) {
                statusBadge.textContent = `${autoConnectCountdown}s`;
            }
            if (autoConnectCountdown === 0) {
                autoConnectCountdown = 10;
            }
        }, 1000);

        // Tự động next sau mỗi 10 giây
        autoConnectInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                findNewPartner();
            }
        }, 10000);
    }
}

// Thêm event listener cho nút auto connect
document.addEventListener('DOMContentLoaded', () => {
    // Kiểm tra xem người dùng đã đồng ý điều khoản chưa
    if (localStorage.getItem('termsAccepted') !== 'true') {
        window.location.href = './index.html';
        return;
    }

    // Kết nối WebSocket
    connectWebSocket();

    // Thêm event listener cho nút auto connect
    const autoConnectBtn = document.getElementById('autoConnectBtn');
    autoConnectBtn.addEventListener('click', toggleAutoConnect);
    
    // Dừng auto connect khi rời trang
    window.addEventListener('beforeunload', () => {
        if (isAutoConnecting) {
            clearInterval(autoConnectInterval);
        }
    });

    // Prevent double-tap zoom
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        if (now - lastTap < DOUBLE_TAP_DELAY) {
            e.preventDefault();
        }
        lastTap = now;
    });

    // Improve button touch response
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('touchstart', () => {
            button.classList.add('button-active');
        });
        button.addEventListener('touchend', () => {
            button.classList.remove('button-active');
        });
    });

    // Thêm event listener cho nút gửi
    const sendButton = document.getElementById('sendButton');
    sendButton.addEventListener('click', () => {
        sendMessage();
    });

    // Thêm event listener cho phím Enter trong input
    const messageInput = document.getElementById('messageInput');
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Thêm event listener cho nút Next Stranger
    const nextButton = document.getElementById('nextButton');
    nextButton.addEventListener('click', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify({
                    type: 'disconnect'
                }));
            } catch (error) {
                console.error('Lỗi khi gửi tin nhắn ngắt kết nối:', error);
            }
        }
        findNewPartner();
    });

    // Thêm event listener cho logo
    const logoElement = document.querySelector('.logo-image');
    if (logoElement) {
        logoElement.addEventListener('click', () => {
            window.location.href = './index.html';
        });
    }

    // Xử lý emoji picker
    const emojiButton = document.getElementById('emojiButton');
    const emojiPicker = document.getElementById('emojiPicker');

    // Khởi tạo emoji picker
    initializeEmojiPicker();

    // Toggle emoji picker
    emojiButton.addEventListener('click', () => {
        emojiPicker.classList.toggle('hidden');
    });

    // Đóng emoji picker khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && !emojiButton.contains(e.target)) {
            emojiPicker.classList.add('hidden');
        }
    });

    // Đặt giá trị mặc định khi trang web mới tải
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) {
        onlineCountElement.textContent = '5000+';
    }

    // Thêm xử lý bàn phím ảo cho mobile
    document.addEventListener('DOMContentLoaded', () => {
        const messageInput = document.getElementById('messageInput');
        
        // Xử lý khi bàn phím hiện lên
        messageInput.addEventListener('focus', () => {
            document.body.classList.add('keyboard-open');
            // Scroll đến input sau một chút delay
            setTimeout(() => {
                messageInput.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        });

        // Xử lý khi bàn phím ẩn đi
        messageInput.addEventListener('blur', () => {
            document.body.classList.remove('keyboard-open');
        });
    });

    // Lấy danh sách video từ server
    fetchAvailableVideos();
    
    // Đặt timeout cho lần đầu khi tải trang
    matchTimeoutId = setTimeout(() => {
        if (!isConnected) {
            playRandomVideo();
        }
    }, randomVideoTimeout); // 8 giây
});

// Thêm vào cuối file script.js
document.addEventListener('DOMContentLoaded', () => {
    const logoElement = document.querySelector('.logo-image');
    if (logoElement) {
        logoElement.addEventListener('click', () => {
            window.location.href = './index.html';
        });
    }
});

// Cập nhật hàm findNewPartner để đảm bảo tìm đúng partner
function findNewPartner() {
    reconnectAttempts = 0;
    
    // Dừng video ngẫu nhiên nếu đang phát
    stopRandomVideo();
    
    // Xóa timeout cũ nếu có
    if (matchTimeoutId) {
        clearTimeout(matchTimeoutId);
    }
    
    // Đóng socket cũ an toàn
    closeSocketSafely();
    
    // Dọn dẹp các kết nối
    cleanupConnections();
    
    // Cập nhật trạng thái là đang chờ
    updateConnectionStatus('waiting');
    addSystemMessage('Looking for a new stranger...');
    
    // Tạo kết nối mới
    setTimeout(() => {
        connectWebSocket();
    }, 1000);

    // Reset đếm ngược nếu đang bật auto connect
    if (isAutoConnecting) {
        autoConnectCountdown = 10;
        const statusBadge = document.querySelector('#autoConnectBtn .status-badge');
        if (statusBadge) {
            statusBadge.textContent = '10s';
        }
    }
}

// Thêm hàm dọn dẹp kết nối
function cleanupConnections() {
    // Xóa timeout tìm người nếu có
    if (matchTimeoutId) {
        clearTimeout(matchTimeoutId);
        matchTimeoutId = null;
    }
    
    // Dừng video ngẫu nhiên nếu đang phát
    stopRandomVideo();
    
    // Dọn dẹp WebRTC
    if (peerConnection) {
        try {
            // Xóa tất cả event handlers
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.oniceconnectionstatechange = null;
            
            peerConnection.close();
            peerConnection = null;
        } catch (error) {
            console.error('Error closing peer connection:', error);
        }
    }

    // Dọn dẹp video streams
    if (remoteVideo.srcObject) {
        try {
            remoteVideo.pause();
            const tracks = remoteVideo.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            remoteVideo.srcObject = null;
        } catch (error) {
            console.error('Error cleaning up video streams:', error);
        }
    }

    if (localStream) {
        try {
            localStream.getTracks().forEach(track => track.stop());
        } catch (error) {
            console.error('Error cleaning up local stream:', error);
        }
    }

    // Xóa tin nhắn cũ
    chatMessages.innerHTML = '';

    // Reset trạng thái
    isClosingSocket = false;
    isConnected = false;
    isReconnecting = false;

    // Xóa đếm ngược nếu có
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// Thêm hàm xử lý yêu cầu kết nối
function handleConnectionRequest(fromId) {
    // Tạo và hiển thị popup xác nhận
    const confirmBox = document.createElement('div');
    confirmBox.className = 'confirm-connection-popup';
    confirmBox.innerHTML = `
        <div class="confirm-content">
            <h3>Connection Request</h3>
            <p>User ID: ${fromId} wants to connect with you</p>
            <div class="confirm-buttons">
                <button class="accept-btn">Accept</button>
                <button class="reject-btn">Reject</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmBox);

    // Xử lý các nút
    const acceptBtn = confirmBox.querySelector('.accept-btn');
    const rejectBtn = confirmBox.querySelector('.reject-btn');

    return new Promise((resolve) => {
        acceptBtn.onclick = () => {
            confirmBox.remove();
            resolve(true);
        };
        rejectBtn.onclick = () => {
            confirmBox.remove();
            resolve(false);
        };
    });
}

// Thêm xử lý khi rời trang
window.addEventListener('beforeunload', () => {
    isClosingSocket = true;
    if (socket) {
        socket.close();
    }
    if (peerConnection) {
        peerConnection.close();
    }
});

// Thêm hàm khởi tạo emoji picker
function initializeEmojiPicker() {
    const emojiList = document.querySelector('.emoji-list');
    const categories = document.querySelectorAll('.emoji-category');

    // Hiển thị emoji mặc định (smileys)
    showEmojisForCategory('smileys');

    // Xử lý chuyển đổi category
    categories.forEach(category => {
        category.addEventListener('click', () => {
            categories.forEach(c => c.classList.remove('active'));
            category.classList.add('active');
            showEmojisForCategory(category.dataset.category);
        });
    });
}

// Hàm hiển thị emoji theo category
function showEmojisForCategory(category) {
    const emojiList = document.querySelector('.emoji-list');
    emojiList.innerHTML = '';

    emojis[category].forEach(emoji => {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'emoji-item';
        emojiItem.textContent = emoji;
        emojiItem.addEventListener('click', () => {
            insertEmoji(emoji);
        });
        emojiList.appendChild(emojiItem);
    });
}

// Hàm chèn emoji vào input
function insertEmoji(emoji) {
    const messageInput = document.getElementById('messageInput');
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const text = messageInput.value;
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    messageInput.value = before + emoji + after;
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
    messageInput.focus();
}

// Thêm hàm để format số người online
function formatOnlineCount(count) {
    if (count >= 5000) {
        return `${count.toLocaleString()}+`;
    }
    return count.toLocaleString();
}

// Cập nhật hàm handleUserConnected để đảm bảo dừng video ngẫu nhiên khi có người thật kết nối
function handleUserConnected() {
    // Dừng video ngẫu nhiên nếu đang phát
    if (isPlayingRandomVideo) {
        stopRandomVideo();
    }
    
    isConnected = true;
    
    // Xóa timeout tìm người
    if (matchTimeoutId) {
        clearTimeout(matchTimeoutId);
        matchTimeoutId = null;
    }
    
    // Cập nhật trạng thái kết nối
    updateConnectionStatus('connected');
    
    // Khởi tạo kết nối video
    if (chatMode === 'video' && !peerConnection) {
        initializePeerConnection().then(() => {
            // Tạo và gửi offer
            peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            }).then(offer => {
                return peerConnection.setLocalDescription(offer).then(() => {
                    socket.send(JSON.stringify({
                        type: 'webrtc',
                        webrtcData: {
                            type: 'offer',
                            offer: offer
                        }
                    }));
                });
            }).catch(e => {
                console.error('Error creating offer:', e);
            });
        }).catch(e => {
            console.error('Error initializing peer connection:', e);
        });
    }
    
    addSystemMessage('Connected with a stranger!');
}

// Thêm hàm xử lý tin nhắn WebRTC
async function handleWebRTCMessage(message) {
    const webrtcData = message.webrtcData;
    try {
        if (webrtcData.type === 'offer') {
            console.log('Received offer, creating answer...');
            if (!peerConnection) {
                await initializePeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(webrtcData.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.send(JSON.stringify({
                type: 'webrtc',
                webrtcData: {
                    type: 'answer',
                    answer: answer
                }
            }));
        } else if (webrtcData.type === 'answer') {
            console.log('Received answer, setting remote description');
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(webrtcData.answer));
    }
        } else if (webrtcData.type === 'candidate' && peerConnection) {
            console.log('Received ICE candidate');
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(webrtcData.candidate));
            } catch (e) {
                console.error('Error adding received ICE candidate:', e);
            }
        }
    } catch (error) {
        console.error('Error handling WebRTC message:', error);
    }
}

// Cập nhật hàm sendMessage để hỗ trợ phản hồi tự động khi đang phát video ngẫu nhiên
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    
    if (text && socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify({
                type: 'message',
                text: text
            }));
            addMessage(text, 'sent');
            messageInput.value = '';
            
            // Thêm phản hồi tự động khi đang phát video ngẫu nhiên
            if (isPlayingRandomVideo && !isConnected) {
                // Tạo độ trễ ngẫu nhiên để giả lập người thật đang gõ
                const replyDelay = 1000 + Math.random() * 3000;
                setTimeout(() => {
                    if (isPlayingRandomVideo) {
                        const replies = [
                            "Oh, that's interesting!",
                            "I see what you mean",
                            "Tell me more about that",
                            "I'm having a good time chatting with you",
                            "That's cool! What else do you like to do?",
                            "Where are you from?",
                            "Nice to meet you 😊",
                            "Haha, that's funny!"
                        ];
                        const randomReply = replies[Math.floor(Math.random() * replies.length)];
                        addMessage(randomReply, 'stranger');
                    }
                }, replyDelay);
            }
        } catch (error) {
            console.error('Lỗi khi gửi tin nhắn:', error);
            addSystemMessage('Không thể gửi tin nhắn. Vui lòng thử lại.');
        }
    }
}

// Cập nhật hàm để xử lý disconnect
function handleDisconnect() {
    // Dọn dẹp các kết nối
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    isConnected = false;
    updateConnectionStatus('disconnected');
    addSystemMessage('Stranger has disconnected');
    
    // Nếu auto connect đang bật, tìm người mới
    if (isAutoConnecting) {
        setTimeout(findNewPartner, 1000);
    } else {
        // Đặt timeout để phát video ngẫu nhiên nếu không tìm được người
        matchTimeoutId = setTimeout(() => {
            if (!isConnected) {
                playRandomVideo();
            }
        }, randomVideoTimeout);
    }
}

// Thêm hàm xử lý khi video kết thúc
function handleVideoEnd() {
    if (isPlayingRandomVideo) {
        console.log('Video ended, disconnecting...');
        stopRandomVideo();
        handleDisconnect();
        
        // Đợi một khoảng thời gian trước khi tìm partner mới
        setTimeout(() => {
            if (!isConnected) {
                // Thử tìm người thật trước
                findNewPartner();
                
                // Nếu không tìm được người thật sau một khoảng thời gian, mới phát video ngẫu nhiên khác
                // Đảm bảo video khác với video vừa phát
                setTimeout(() => {
                    if (!isConnected && availableVideos.length > 0) {
                        playRandomVideo();
                    } else if (!isConnected) {
                        // Nếu hết video, yêu cầu danh sách mới
                        fetchAvailableVideos().then(() => {
                            if (!isConnected && availableVideos.length > 0) {
                                setTimeout(() => {
                                    if (!isConnected) {
                                        playRandomVideo();
                                    }
                                }, 1000);
                            }
                        });
                    }
                }, randomVideoTimeout);
            }
        }, 1000);
    }
} 