# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/build ./build
ENV NODE_ENV=production
CMD ["node", "build/index.js"]
