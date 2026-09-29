# mock-payments, run with tsx straight from source. No secrets are baked in:
# MOCK_PAYMENTS_API_KEY comes from the environment (compose.yaml).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
CMD ["npx", "tsx", "src/server.ts"]
