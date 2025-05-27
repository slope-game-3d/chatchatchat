#!/bin/bash

# Script này sẽ được Heroku sử dụng thay vì npm ci
echo "Running custom build script"

# Đảm bảo rằng Node.js được cài đặt
export PATH="$PATH:$HOME/vendor/node/bin"

# Chạy npm install thay vì npm ci
echo "Running npm install instead of npm ci"
npm install --no-package-lock

# Hiển thị thông báo thành công
echo "Custom build script completed successfully" 