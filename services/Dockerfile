# One image per service: docker build --build-arg SERVICE=pets services
# Behind a TLS-intercepting proxy, pass the CA bundle as a secret: --secret id=ca,src=$CA_BUNDLE
FROM node:24.21.0-alpine3.24
ARG SERVICE
RUN test -n "$SERVICE" || (echo "Set --build-arg SERVICE=pets|adoptions|websocket" && false)
WORKDIR /app
COPY package.json package-lock.json ./
COPY lib/package.json lib/
COPY pets/package.json pets/
COPY adoptions/package.json adoptions/
COPY websocket/package.json websocket/
RUN --mount=type=secret,id=ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace "$SERVICE"
COPY lib lib
COPY ${SERVICE} ${SERVICE}
WORKDIR /app/${SERVICE}
ENV NODE_ENV=production NODE_PORT=80 DATA_BASEPATH=/data
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 80
USER node
CMD ["node", "index.js"]
