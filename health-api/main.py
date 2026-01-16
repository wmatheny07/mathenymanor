from minio import Minio
from minio.error import S3Error
from fastapi import FastAPI, Request, Header, File, UploadFile, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from typing import Literal
import base64
import uvicorn
import json
import csv
from io import BytesIO
import datetime
import os
import logging

def build_minio_client():
    endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000").strip()
    ak = os.getenv("MINIO_ACCESS_KEY", "").strip()
    sk = os.getenv("MINIO_SECRET_KEY", "").strip()
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"

    if not ak or not sk:
        raise RuntimeError("MINIO_ACCESS_KEY / MINIO_SECERT_KEY not set")

    print(f"[MinIO] endpoint={endpoint}, secure={secure}, user={ak}")

    return Minio(endpoint, access_key=ak, secret_key=sk, secure=secure)

app = FastAPI()

# Configure Minio clien
minio_client = build_minio_client()

# Create a bucket if it doesn't exist
bucket_name = "health-data"
if not minio_client.bucket_exists(bucket_name):
    minio_client.make_bucket(bucket_name)

# ---------- Auth ----------
X_API_KEY = APIKeyHeader(name="X-API-Key")

def api_key_auth(x_api_key: str = Depends(X_API_KEY)):
    if x_api_key != os.getenv("HEALTH_API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return True

# Only allow known categories
Category = Literal["workouts", "metrics"]

def build_object_name(category: Category, ext: str) -> str:
    ts = datetime.datetime.now().strftime("%Y_%m_%d_%H_%M_%S")
    # e.g. workouts/json/auto_health_workouts_2026_01_14_13_45_00.json
    return f"{category}/{ext}/auto_health_{category}_{ts}.{ext}"


# ---------- JSON endpoint ----------
@app.post("/health/{category}/json")
async def upload_to_minio_json(
    category: Category,
    request: Request,
    key_valid: bool = Depends(api_key_auth),
):
    try:
        raw_data = await request.json()
        json_str = request.headers.get("content-type")  # just to show it’s accessible

        json_data_str = request.app.json_encoder(raw_data) if hasattr(
            request.app, "json_encoder"
        ) else __import__("json").dumps(raw_data)

        json_bytes = BytesIO(json_data_str.encode("utf-8"))
        object_name = build_object_name(category, "json")

        minio_client.put_object(
            bucket_name,
            object_name,
            json_bytes,
            length=len(json_data_str),
            content_type="application/json",
        )

        return {"status": "ok", "category": category, "object": object_name}

    except S3Error as exc:
        raise HTTPException(status_code=500, detail=f"Minio error: {str(exc)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ---------- CSV endpoint ----------
@app.post("/health/{category}/csv")
async def upload_to_minio_csv(
    category: Category,
    request: Request,
    key_valid: bool = Depends(api_key_auth),
):
    try:
        data = await request.body()
        # keep your slicing logic as-is if AutoExportHealth has those header/footer lines
        records = data.split(b"\n")
        num_recs = len(records)
        csv_data = b"\n".join(records[4 : num_recs - 3])
        csv_buffer = BytesIO(csv_data)

        ctype = request.headers.get("content-type", "text/csv")
        object_name = build_object_name(category, "csv")

        minio_client.put_object(
            bucket_name,
            object_name,
            csv_buffer,
            length=len(csv_data),
            content_type=ctype,
        )

        return {"status": "ok", "category": category, "object": object_name}

    except S3Error as exc:
        raise HTTPException(status_code=500, detail=f"Minio error: {str(exc)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    
# Run the API
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)