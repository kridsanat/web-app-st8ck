FROM node:18-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm i --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:18-alpine AS api
WORKDIR /app
COPY api/package.json api/package-lock.json* ./
RUN npm i --omit=dev --no-audit --no-fund
COPY api/ ./
COPY --from=web-build /web/dist ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node","src/index.js"]
