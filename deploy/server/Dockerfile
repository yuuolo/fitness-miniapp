# 服务端：安装 ffmpeg（视频自动裁切用）
FROM node:20-alpine
WORKDIR /app
# ffmpeg/ffprobe 用于把超时长的视频自动裁到限制内（约 70MB 镜像增量）
RUN apk add --no-cache ffmpeg
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
