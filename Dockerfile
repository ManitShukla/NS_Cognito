# ==============================================================================
# NS COGNITO — PRODUCTION MULTI-STAGE DOCKERFILE
# Architecture: High-Density Academic Coprocessor & Plumware ERP Scraper
# Node Runtime: Node.js 24 Alpine (Minimal attack surface, non-root execution)
# ==============================================================================

# STAGE 1: Builder
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Install system utilities needed for building
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package.json package-lock.json ./

# Clean installation of all dependencies including devDependencies
RUN npm ci

# Copy entire source tree
COPY . .

# Compile TypeScript backend and Vite client SPA
RUN npm run build

# Prune devDependencies to keep production runtime footprint minimal
RUN npm prune --production

# ==============================================================================
# STAGE 2: Minimal Production Runtime
# ==============================================================================
FROM node:24-alpine AS runner

WORKDIR /usr/src/app

# Install wget for container orchestrator health checks
RUN apk add --no-cache wget

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy runtime node_modules and package manifest
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy compiled backend and frontend distribution artifacts
COPY --from=builder /usr/src/app/dist ./dist

# Copy production blueprint resources
COPY --from=builder /usr/src/app/src/resources ./src/resources

# Set file ownership to non-root node user
RUN chown -R node:node /usr/src/app

# Drop root privileges
USER node

# Expose internal API port
EXPOSE 3000

# Orchestrator Healthcheck probe against liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health/live || exit 1

# Execute production entrypoint
CMD ["node", "dist/src/index.js"]
