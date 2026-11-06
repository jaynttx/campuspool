# CampusPool as ONE service (website + API + live chat on one address), for free hosts such as Render.
# For separate frontend and backend containers, use frontend/Dockerfile and backend/Dockerfile instead.

FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# The browser talks to the API on the same site, under /api.
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_GIPHY_API_KEY=""
ARG NEXT_PUBLIC_OSRM_URL="https://router.project-osrm.org"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_GIPHY_API_KEY=$NEXT_PUBLIC_GIPHY_API_KEY NEXT_PUBLIC_OSRM_URL=$NEXT_PUBLIC_OSRM_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=200
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node:20-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
RUN rm -f .env && rm -rf uploads/* tests

COPY --from=web /web/.next/standalone /app/web
COPY --from=web /web/.next/static /app/web/.next/static
COPY --from=web /web/public /app/web/public
COPY deploy/ /app/deploy/

RUN useradd --create-home app && mkdir -p /app/backend/uploads && chown -R app /app
USER app
ENV PORT=10000
EXPOSE 10000
CMD ["/app/deploy/start.sh"]
