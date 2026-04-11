# Hono API（编译后的 server，生产依赖）
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json ./
COPY server ./server
RUN npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist-server ./dist-server
EXPOSE 8787
USER node
CMD ["node", "dist-server/index.js"]
