FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CASESYSTEM_SOURCE_ROOT=/workspace

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY backend /app/backend
COPY docker /app/docker
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

RUN chmod +x /app/docker/*.sh \
    && python -m pip install --upgrade pip \
    && python -m pip install .

RUN mkdir -p /app/.runtime/report-storage /workspace

EXPOSE 8010

CMD ["/app/docker/api-entrypoint.sh"]
