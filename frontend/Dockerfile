# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js frontend.
#
# Railway deployment strategy:
#   - Build with a fixed-length placeholder for NEXT_PUBLIC_API_URL
#     (Next.js bakes NEXT_PUBLIC_* into static JS at build time)
#   - At container start, entrypoint.sh sed-replaces the placeholder
#     with the real $NEXT_PUBLIC_API_URL environment variable
#   - This way the same image works for any backend URL with no rebuild

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Use a fixed-length 64-char placeholder so sed replacement is byte-safe.
# The actual URL is injected at runtime by entrypoint.sh.
ARG NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL_PLACEHOLDER_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ARG NEXT_PUBLIC_AUTH_MODE
ENV NEXT_PUBLIC_AUTH_MODE=${NEXT_PUBLIC_AUTH_MODE}

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy the standalone server bundle (requires `output: "standalone"` in next.config.ts)
COPY --from=builder /app/.next/standalone ./
# Static assets must be copied separately for standalone mode
COPY --from=builder /app/.next/static ./.next/static
# Public dir is optional — copy only if it exists
COPY --from=builder /app/public* ./public/

# Copy runtime entrypoint for NEXT_PUBLIC_API_URL injection
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

# Railway / platform health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-3000}/ > /dev/null 2>&1 || exit 1

# entrypoint.sh injects NEXT_PUBLIC_API_URL then execs `node server.js`
CMD ["/entrypoint.sh"]
