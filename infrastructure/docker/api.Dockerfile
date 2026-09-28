# Dev image for api. The source is bind-mounted over /app by compose.yaml;
# node_modules stays in the image (an anonymous volume keeps it from being hidden).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npx", "tsx", "watch", "src/server.ts"]
