FROM node:20

# Install FFmpeg
RUN apt update && apt install -y ffmpeg

# Set working directory to root of project
WORKDIR /usr/src/app

# Copy package files and install dependencies first (for caching)
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "index.js"]
