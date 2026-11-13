# Multi-stage Dockerfile for Next.js 14 Standalone on Google Cloud Run
# Base image: Node.js 20 Debian Slim for maximum glibc/native compatibility (argon2, sharp)

# ── Stage 1: Dependencies ──
FROM node:20-slim AS deps
WORKDIR /app

# Install native compilation dependencies for argon2/sharp if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ── Stage 2: Builder ──
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application with standalone output
RUN npm run build

# ── Stage 3: Production Runner ──
FROM node:20-slim AS runner
WORKDIR /app

# Security & runtime configuration
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Install curl for Google Cloud Run health probes
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add unprivileged user and group for container security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public static directory
COPY --from=builder /app/public ./public

# Ensure directory permissions for nextjs user cache & standalone files
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone server outputs and static assets with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

EXPOSE 8080

# Cloud Run dynamic HTTP health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "server.js"]
