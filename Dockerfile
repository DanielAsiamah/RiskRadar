FROM node:22-alpine AS web-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY app.json index.ts App.tsx tsconfig.json types.ts ./
COPY api ./api
COPY assets ./assets
COPY components ./components
COPY types ./types

RUN npx expo export --platform web --output-dir dist

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    WEB_DIST_DIR=/app/dist

COPY --chown=node:node backend ./backend
COPY --from=web-builder --chown=node:node /app/dist ./dist

RUN mkdir -p /app/backend/cache && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "backend/server.mjs"]
