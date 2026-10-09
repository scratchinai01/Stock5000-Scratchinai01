# Cloud Run 部署用：建置前端，再用 tsx 執行 server.ts
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
# 需要 devDependencies 才能建置前端（vite、tailwind 等）
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Cloud Run 會注入 PORT（預設 8080），server.ts 會讀取
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
