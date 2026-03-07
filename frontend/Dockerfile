# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Allows configuring the API URL at build time.
ARG NEXT_PUBLIC_API_URL=auto
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_AUTH_MODE
ENV NEXT_PUBLIC_AUTH_MODE=${NEXT_PUBLIC_AUTH_MODE}

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG NEXT_PUBLIC_AUTH_MODE

# If provided at runtime, Next will expose NEXT_PUBLIC_* to the browser as well
# (but note some values may be baked at build time).
ENV NEXT_PUBLIC_API_URL=auto
ENV NEXT_PUBLIC_AUTH_MODE=${NEXT_PUBLIC_AUTH_MODE}
# Standalone server binds to hostname by default; bind to all interfaces in Docker.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Create non-root user before COPY so --chown can reference it.
# Using COPY --chown avoids a slow recursive chown on overlay2 (docker/for-linux#388).
RUN addgroup -S appgroup && adduser -S -G appgroup appuser

# Next.js standalone output bundles only the required node_modules (~50 MB vs
# ~500 MB+), eliminating the need to copy the full node_modules tree.
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
# `public/` is optional in Next.js apps; repo may not have it.
# Uncomment the next line if a public/ directory exists:
# COPY --from=builder --chown=appuser:appgroup /app/public ./public

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
