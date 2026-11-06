#!/usr/bin/env bash
# Starts the backend, the website and the proxy in one container. If any of them stops, the container exits
# so the host restarts it cleanly.
set -euo pipefail

cd /app/backend
alembic upgrade head

uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1 --workers 1 &
(cd /app/web && PORT=3000 HOSTNAME=127.0.0.1 exec node server.js) &
caddy run --config /app/deploy/Caddyfile --adapter caddyfile &

wait -n
echo "A CampusPool process stopped; exiting so the service restarts." >&2
exit 1
