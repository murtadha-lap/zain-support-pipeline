FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATABASE_URL=sqlite:////data/zsp.db \
    DATA_DIR=/app/data

WORKDIR /app/backend

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8000

# Tables are created at startup. Seed once with: docker exec <container> python -m app.seed
# For `python -m app.seed --demo`, mount the repo's data/ folder at /app/data (-v ../data:/app/data:ro).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
