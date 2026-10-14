# The SPA plus the Caddy gateway that serves it and proxies /api and /websocket to the services.
# Behind a TLS-intercepting proxy, pass the CA bundle as a secret: --secret id=ca,src=$CA_BUNDLE
FROM node:24.21.0-alpine3.24 AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2.11.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /build/build /srv/build
WORKDIR /srv
ENV CADDY_PORT=80
EXPOSE 80
