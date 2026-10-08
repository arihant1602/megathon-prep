FROM node:24-alpine
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/platform/package.json packages/platform/
COPY apps/kestrel/package.json apps/kestrel/
COPY apps/boli/package.json apps/boli/
COPY apps/onboard/package.json apps/onboard/
COPY apps/margin/package.json apps/margin/
COPY services/collab/package.json services/collab/
RUN npm ci -w services/collab --omit=dev --no-audit --no-fund
COPY services/collab/src services/collab/src
WORKDIR /repo/services/collab
ENV NODE_ENV=production PORT=8004
USER node
EXPOSE 8004
CMD ["node", "src/server.ts"]
