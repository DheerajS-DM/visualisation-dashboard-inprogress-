import os
import json
import math
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    raise ValueError("Missing Supabase credentials! Check your .env file.")

# 3. Initialize the client
supabase = create_client(URL, KEY)

# 4. The core logic standalone function
def run_automatic_ingestion():
    print("Loading JSON data...")
    with open('jsondata.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    for row in data:
        for key, val in row.items():
            if val == "":
                row[key] = None

    chunk_size = math.ceil(len(data) / 8)
    chunks = [data[i:i + chunk_size] for i in range(0, len(data), chunk_size)]
    
    def upload_chunk(chunk):
        return supabase.table("blackcoffer_data").insert(chunk).execute()

    print("Firing up 8 concurrent threads for upload...")
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(upload_chunk, chunks))
        
    print(f"Success! Uploaded using {len(results)} threads.")

# 5. FastAPI Lifespan function (Runs on startup)
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Checking database status...")
    check = supabase.table("blackcoffer_data").select("id").limit(1).execute()
    
    if not check.data:
        print("Database is empty. Starting automatic ingestion pipeline...")
        run_automatic_ingestion()
    else:
        print("Data already exists in Supabase. Skipping automatic upload.")
        
    yield 

# 6. Initialize FastAPI with the lifespan
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/data")
def fallback_data():
    try:
        # Try primary source (Supabase)
        print("Backend attempting to fetch from Supabase...")
        res = supabase.table("blackcoffer_data").select("*").limit(100).execute()
        return res.data
    except Exception as e:
        # Fail-safe: Read from the local JSON file
        print(f"Supabase connection failed ({e}). Falling back to local JSON file...")
        try:
            with open('jsondata.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data[:100]
        except FileNotFoundError:
            return {"error": "Both Supabase and local JSON file are unavailable."}