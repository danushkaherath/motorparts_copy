# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig*.json vite.config.ts ./
RUN npm ci
COPY src ./src
COPY index.html ./
RUN npm run build

# Stage 2: Nginx Static Server
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
