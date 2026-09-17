# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/data/grocery_pos.sqlite

VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
