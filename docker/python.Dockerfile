# Any Python service in services/ (risk | llm | bhashini). Build from the repo root:
#   docker build -f docker/python.Dockerfile --build-arg SERVICE=risk .
ARG SERVICE

FROM python:3.12-slim
ARG SERVICE
COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH" SERVICE=${SERVICE} PORT=8000 MODEL_DIR=/data/models
WORKDIR /app
COPY services/pyproject.toml services/uv.lock ./
COPY services/common common
COPY services/risk risk
COPY services/llm llm
COPY services/bhashini bhashini
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --package ${SERVICE}
EXPOSE 8000
# "::" binds IPv6 and IPv4 (Railway private networking is IPv6).
CMD ["sh", "-c", "exec uvicorn ${SERVICE}_service.main:app --host :: --port ${PORT}"]
