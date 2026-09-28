# Dev image for web: the Vite dev server. The source is bind-mounted over /app
# by compose.yaml; node_modules stays in the image.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npx", "vite", "--host"]
