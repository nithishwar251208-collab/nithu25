# Production Dockerfile for Nithu25 Backend
FROM node:24-alpine AS base

WORKDIR /app

# Install system dependencies if required
RUN apk add --no-cache curl

# Copy package files
COPY package.json tsconfig.json ./

# Copy Prisma schema
COPY prisma ./prisma/

# Copy application source code
COPY src ./src/

# Expose server port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start production server
CMD ["node", "--experimental-strip-types", "src/server.ts"]
