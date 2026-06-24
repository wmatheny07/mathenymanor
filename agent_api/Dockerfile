# ---- Base image ----
FROM python:3.11-slim

# ---- Environment setup ----
WORKDIR /app

# Prevent Python from writing .pyc files and force unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ---- Install system dependencies ----
# Upgrade libssl3t64/openssl first to pick up CVE-2025-15467 fix (>= 3.5.4-1~deb13u2)
# before installing other deps so both layers land patched packages.
RUN apt-get update && \
    apt-get install -y --no-install-recommends libssl3t64 openssl && \
    apt-get install -y --no-install-recommends build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# ---- Copy requirements and install ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# ---- Copy app source ----
COPY . .

# ---- Expose port ----
EXPOSE 8000

# ---- Gunicorn command ----
# Use a single worker for small apps; scale as needed later
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app", "--workers", "1", "--timeout", "120"]