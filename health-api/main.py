from minio import Minio
from minio.error import S3Error
from fastapi import FastAPI, Request, Header, File, UploadFile, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
import base64
import uvicorn
import json
import csv
from io import BytesIO
import datetime
import os
import logging

app = FastAPI()

# Configure Minio client
minio_client = Minio(
    "minios3.peakprecisiondata.com",  # Minio server URL (e.g., "localhost:9000")
    access_key="os.environ['MINIO_ACCESS_KEY]",  # Replace with your Minio access key
    secret_key=os.environ['MINIO_SECRET_KEY'],  # Replace with your Minio secret key
    secure=True  # Set to True if Minio is using HTTPS
)

# Create a bucket if it doesn't exist
bucket_name = "health-data"
if not minio_client.bucket_exists(bucket_name):
    minio_client.make_bucket(bucket_name)

# Request model to accept file_name and file_content in the body
class UploadRequest(BaseModel):
    file_name: str
    file_content: str  # Expect base64-encoded file content

class GetRequest(BaseModel):
    file_name: str

X_API_KEY = APIKeyHeader(name='X-API-Key')

def api_key_auth(x_api_key: str = Depends(X_API_KEY)):
    """ takes the X-API-Key header and validate it with the X-API-Key in the database/environment"""
    if x_api_key != os.environ['API_KEY']:
        raise HTTPException(
            status_code=401,
            detail="Invalid API Key. Please try again."
        )
    return True
    
@app.post("/json")
async def upload_to_minio_json(request: Request, key_valid: bool = Depends(api_key_auth)):
    if key_valid:
        try:
            data = await request.body()
            ctype = request.headers.get("content-type")

            if ctype == 'application/json':
                # Read the raw JSON data from the request body
                raw_data = request.json()

                # Convert JSON to a string for storage
                json_data_str = json.dumps(raw_data)

                # Convert the JSON string into bytes for upload
                json_bytes = BytesIO(json_data_str.encode("utf-8"))

                # Define a file name for the JSON file (could be passed dynamically in request)
                file_name = 'auto_health_export_' + datetime.datetime.now().strftime('%Y_%d_%m_%H_%M_%S') + '.json'

                # Upload the file to Minio
                minio_client.put_object(
                    bucket_name,
                    file_name,
                    json_bytes,
                    length=len(json_data_str),
                    content_type = ctype
                )

            else:
                raise HTTPException(status_code=500, detail="Improper content-type provided in request.")

        except S3Error as exc:
            raise HTTPException(status_code=500, detail=f"Minio error: {str(exc)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/csv")
async def upload_to_minio_csv(request: Request, key_valid: bool = Depends(api_key_auth)):
    # logger = logging.getLogger('__name__')
    if key_valid:
        try:
            data = await request.body()
            records = data.split(b'\n')
            num_recs = len(records)
            csv_data = b'\n'.join(records[4:num_recs - 3])
            csv_buffer = BytesIO(bytes(csv_data))
            ctype = request.headers.get("content-type")

            # Define a file name for the JSON file (could be passed dynamically in request)
            file_name = 'auto_health_export_' + datetime.datetime.now().strftime('%Y_%d_%m_%H_%M_%S') + '.csv'
            
            # Upload the file to Minio
            minio_client.put_object(
                bucket_name,
                file_name,
                csv_buffer,
                length=len(csv_data),
                content_type = ctype
            )

        except S3Error as exc:
            raise HTTPException(status_code=500, detail=f"Minio error: {str(exc)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
            
@app.get("/upload/")
async def get_file_from_filename(get_request: GetRequest, key_valid: bool = Depends(api_key_auth)):
    if key_valid:
        try:
            # Check if the file exists
            response = minio_client.get_object(bucket_name, get_request.file_name)

            # Stream the file content back to the client
            return StreamingResponse(response.stream(), media_type="application/octet-stream", headers={
                "Content-Disposition": f"attachment; filename={get_request.file_name}"
            })
        except S3Error as exc:
            raise HTTPException(status_code=404, detail=f"File not found: {get_request.file_name}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    
# Run the API
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)