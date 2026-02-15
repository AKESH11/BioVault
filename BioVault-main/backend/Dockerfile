# ============================================================================
# Bio-Vault Backend — Production Docker Image
# ============================================================================
FROM node:20-alpine AS base

WORKDIR /app

# Install OS-level deps needed by native modules (snarkjs, etc.)
RUN apk add --no-cache python3 make g++ git

# Copy package files first (cache layer)
COPY backend/package.json backend/package-lock.json* ./backend/
COPY shared/package.json shared/package-lock.json* ./shared/

# Install backend deps
WORKDIR /app/backend
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source
WORKDIR /app
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY zkp-circuits/ ./zkp-circuits/
COPY smart-contracts/artifacts/ ./smart-contracts/artifacts/

# Create uploads directory
RUN mkdir -p /app/backend/uploads

WORKDIR /app/backend

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Start server
CMD ["node", "src/index.js"]
