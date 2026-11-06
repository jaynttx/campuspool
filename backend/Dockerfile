# CampusPool API
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home appuser && mkdir -p /app/uploads && chown -R appuser /app
USER appuser
EXPOSE 8000
# Production applies database migrations first. One worker only: live updates use an in-process hub (see README).
CMD ["sh", "-c", "if [ \"$ENVIRONMENT\" = production ]; then alembic upgrade head; fi && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
