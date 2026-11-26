FROM node:24-bookworm-slim AS base
RUN npm install --global pnpm@10.34.5
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY src/dataconnect-generated ./src/dataconnect-generated
COPY src/dataconnect-admin-generated ./src/dataconnect-admin-generated
RUN pnpm install --frozen-lockfile
COPY public ./public
COPY src ./src
COPY tsconfig.json tailwind.config.js ./
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY src/dataconnect-generated ./src/dataconnect-generated
COPY src/dataconnect-admin-generated ./src/dataconnect-admin-generated
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/build ./build
COPY server ./server
USER node
CMD ["node", "server/index.cjs"]
