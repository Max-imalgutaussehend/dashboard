# Dashboard: static page + JSON API (Node, no dependencies), non-root, state in /data.
FROM node:22-alpine
WORKDIR /app
COPY server.mjs schema.mjs ./
COPY public ./public
COPY seed ./seed
ENV PORT=8080 DASHBOARD_DATA=/data NODE_ENV=production
EXPOSE 8080
USER 10002:10002
CMD ["node", "server.mjs"]
