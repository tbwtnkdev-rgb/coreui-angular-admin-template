# Build stage: needs the full toolchain (Angular CLI, TypeScript, …) to
# produce a static bundle. None of that belongs in what actually ships.
FROM node:24.15.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# See ci.yml for why this is npm install rather than npm ci: the committed
# lockfile was generated on Windows and Linux resolves a different listr2
# patch version for the same @angular/cli dependency. Tracked in #16.
RUN npm install --no-audit --no-fund

COPY . .
RUN npx ng build --configuration production

# Runtime stage: nginx serving the static bundle and reverse-proxying /api to
# the API container, so the browser talks to one origin — the same shape the
# dev proxy (src/proxy.conf.json) gives ng serve, and the reason neither
# service needs CORS configuration.
FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/coreui-free-angular-admin-template/browser /usr/share/nginx/html

# 127.0.0.1, not localhost: nginx's `listen 80` binds IPv4 only, and this
# image's DNS resolution tries the ::1 (IPv6) entry in /etc/hosts first —
# wget then reports connection refused before ever trying IPv4.
HEALTHCHECK --interval=5s --timeout=3s --retries=10 --start-period=5s \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1

EXPOSE 80
