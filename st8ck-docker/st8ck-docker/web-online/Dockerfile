# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# คัดลอกทั้ง package.json และ lockfile (ถ้ามี)
COPY package.json package-lock.json* ./

# มี lockfile -> ใช้ npm ci, ถ้าไม่มี -> ใช้ npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# คัดลอกซอร์สที่เหลือ และ build
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
