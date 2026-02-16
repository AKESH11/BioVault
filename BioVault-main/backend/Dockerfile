# ============================================================================
# Bio-Vault Backend — Production Docker Image (multi-stage)
# ============================================================================

# --- Stage 1: Build native deps ---
FROM node:20-alpine AS builder

WORKDIR /app

# OS deps for native modules (snarkjs, better-sqlite3, etc.)
RUN apk add --no-cache python3 make g++ git

COPY backend/package.json backend/package-lock.json* ./backend/
COPY shared/package.json shared/package-lock.json* ./shared/

WORKDIR /app/backend
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# --- Stage 2: Production image ---
FROM node:20-alpine AS production

# Security: dumb-init for proper signal handling, tini alternative
RUN apk add --no-cache dumb-init

# Non-root user
RUN addgroup -g 1001 -S biovault && \
    adduser -S biovault -u 1001 -G biovault

WORKDIR /app

# Copy built node_modules from builder
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Copy source
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY zkp-circuits/ ./zkp-circuits/
COPY smart-contracts/artifacts/ ./smart-contracts/artifacts/

# Create directories with correct ownership
RUN mkdir -p /app/backend/uploads /app/backend/logs /app/backend/data && \
    chown -R biovault:biovault /app

# Switch to non-root
USER biovault

WORKDIR /app/backend

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Use dumb-init to handle PID 1 properly (zombie reaping + signal forwarding)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
