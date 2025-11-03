# Production Dockerfile for Backend
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    sqlite \
    sqlite-dev \
    python3 \
    make \
    g++ \
    curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Production dependencies
FROM base AS production-deps
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Development dependencies
FROM base AS build-deps
RUN npm ci --ignore-scripts

# Build stage
FROM build-deps AS build
COPY . .
RUN npm run lint && \
    npm run test -- --passWithNoTests && \
    npm prune --production

# Production stage
FROM base AS production

ENV NODE_ENV=production
ENV PORT=4000

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies
COPY --from=production-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create required directories
RUN mkdir -p data logs backups uploads && \
    chown -R nodejs:nodejs data logs backups uploads

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 4000

# Start application
CMD ["node", "src/server.js"]
