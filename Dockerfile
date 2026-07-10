FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

COPY backend ./backend
COPY package.json ./package.json
COPY INSTALL.md ./INSTALL.md

EXPOSE 3001

CMD ["node", "backend/server.mjs"]
