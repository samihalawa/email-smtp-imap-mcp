# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy ALL source files first (needed for TypeScript compilation)
COPY . .

# Install ALL dependencies (skip prepare script to avoid premature build)
RUN npm ci --ignore-scripts

# Build TypeScript explicitly
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies (skip prepare script)
RUN npm ci --only=production --ignore-scripts

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production

# Start the MCP server
CMD ["node", "dist/index.js"]
