FROM python:3.9

# Upgrade packages with critical CVEs before any app layer:
#   libmariadb3/mariadb-common >= 1:11.8.6-0+deb13u1  (CVE-2026-32710)
#   libglib2.0-0t64            >= 2.84.4-3~deb13u2     (CVE-2025-14087)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libmariadb3 libmariadb-dev libmariadb-dev-compat mariadb-common \
      libglib2.0-0t64 libglib2.0-bin libglib2.0-data gir1.2-glib-2.0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ./requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]