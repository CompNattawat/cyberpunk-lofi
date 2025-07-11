FROM node:20-slim

# ติดตั้ง ffmpeg และทำให้ image เบาลง
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ตั้ง working directory
WORKDIR /app

# Copy package files ก่อน เพื่อใช้ cache install
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install

# Copy source code ที่เหลือ
COPY . .

# เปิด port
EXPOSE 3000

# รันแอป
CMD ["node", "index.js"]
