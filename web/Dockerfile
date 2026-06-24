# Vite SPA — static assets served by nginx.
# Build: docker build --build-arg VITE_BFF_BASE_URL=http://localhost:8090 -t website-profiling-web .

FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_BFF_BASE_URL=http://localhost:8090
ARG VITE_BASE_PATH=
ENV VITE_BFF_BASE_URL=$VITE_BFF_BASE_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK CMD wget -qO- http://127.0.0.1/home | grep -q '<div id="root">' || exit 1
