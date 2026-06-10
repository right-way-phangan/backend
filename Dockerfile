# Right Way backend API (Hono + Drizzle, run via tsx). Applies migrations on boot.
FROM node:22-alpine
WORKDIR /app

# Install deps (incl. tsx — used to run the TS API directly).
COPY package.json package-lock.json* ./
RUN npm install

# App source + generated migrations (drizzle/) needed by applyMigrations().
COPY . .

ENV NODE_ENV=production
EXPOSE 8787

# DB driver is chosen by env: set DATABASE_URL (postgres-js) in compose.
CMD ["npm", "run", "api"]
