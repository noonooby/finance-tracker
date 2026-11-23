FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY public ./public
COPY src ./src
COPY tailwind.config.js postcss.config.js ./
RUN CI=true npm run build

FROM node:22-slim
WORKDIR /app
COPY server ./server
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/build ./build
RUN rm -rf server/test
ENV PORT=8080 DB_PATH=/data/finance.db NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "--experimental-sqlite", "server/server.js"]
