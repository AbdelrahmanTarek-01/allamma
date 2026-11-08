# For a VPS later (e.g. Oracle Cloud Always Free). Build from the 03-code folder:
#   docker build -f ../05-deploy/Dockerfile -t allamma .
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json /app/server/package-lock.json ./server/
COPY --from=build /app/client/dist ./client/dist
RUN npm --prefix server ci --omit=dev
EXPOSE 3000
CMD ["node", "server/dist/main.js"]
