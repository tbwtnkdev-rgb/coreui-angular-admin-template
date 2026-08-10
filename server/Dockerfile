# Single stage is enough here: the API has two runtime dependencies (express,
# pg), no build step, and no dev tooling to strip out afterward.
FROM node:24.15.0-alpine
WORKDIR /app

COPY package.json package-lock.json ./
# Unlike the root app's lockfile (see ci.yml), this one has no platform-
# specific entries — express and pg are pure JS — so npm ci is safe here.
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

# The base image ships a non-root "node" user already; running as it means a
# compromised dependency doesn't get root inside the container for free.
USER node

# 127.0.0.1, not localhost — see nginx.conf's Dockerfile for why: this image's
# DNS resolution tries ::1 first, and the server only listens on IPv4.
HEALTHCHECK --interval=5s --timeout=3s --retries=10 --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE 3000
CMD ["node", "src/index.js"]
