FROM node:22-alpine AS build
WORKDIR /app
# npm ci builds from the lockfile; npm install would resolve versions at build time.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The module the container mounts (ADR-007); demo by default (micro plan D-CSH-03), production: --build-arg PORTAL_BUILD=module.
ARG PORTAL_BUILD=module:demo
RUN npm run build:${PORTAL_BUILD}

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# Served under the names the container's manifest loads; mount-entry asks for the CSS next to the module.
COPY --from=build /app/dist/portal.js /usr/share/nginx/html/cash-reporting-portal.js
COPY --from=build /app/dist/portal.css /usr/share/nginx/html/cash-reporting-portal.css
