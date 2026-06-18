import re
import json
import os
import sqlite3
import bcrypt
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import pypdf
from google import genai
from dotenv import load_dotenv

# Load environmental configurations securely from your local .env file
load_dotenv()

app = FastAPI(title="Lecture Lens API", version="1.3.4")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pull the API key dynamically out of system memory environment profiles
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("SYSTEM FAULT: GEMINI_API_KEY variable is missing.")

# Initialize the official Google GenAI Client
client = genai.Client(api_key=GEMINI_API_KEY)

# =========================================================================
# DATA STRUCTURAL SCHEMAS
# =========================================================================

class YouTubeRequest(BaseModel):
    url: str

class AnalysisRequest(BaseModel):
    text: str
    username: str  
    title: str     

class LoginRequest(BaseModel):
    username: str
    password: str

# =========================================================================
# DATABASE MATRIX & PERSISTENCE LAYER
# =========================================================================

DB_FILE = "lecturelens.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Core User Accounts Matrix
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    """)
    
    # Relational History Tracking Log
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            title TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            analysis_data TEXT NOT NULL,
            FOREIGN KEY(username) REFERENCES users(username)
        )
    """)
    
    # Seed default system administrative node if missing
    cursor.execute("SELECT * FROM users WHERE username = 'admin'")
    if not cursor.fetchone():
        hashed = bcrypt.hashpw("lecturelens2026".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ("admin", hashed))
        conn.commit()
    
    conn.close()

init_db()

def extract_video_id(url: str) -> str:
    pattern = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    return match.group(1) if match else None

# =========================================================================
# SYSTEM SECURITY GATEWAYS (AUTH ENDPOINTS)
# =========================================================================

@app.get("/")
def home():
    return {"status": "online", "message": "Lecture Lens Secure AI Processing Engine Live!"}

@app.post("/api/register")
async def register_user(credentials: LoginRequest):
    username_clean = credentials.username.strip().lower()
    if len(username_clean) < 3 or len(credentials.password) < 6:
        raise HTTPException(status_code=400, detail="Credentials do not match length constraints.")
        
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        hashed = bcrypt.hashpw(credentials.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username_clean, hashed))
        conn.commit()
        return {"status": "success", "message": "ACCOUNT_PROVISIONED"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="IDENTITY_CONFLICT // USERNAME_TAKEN")
    finally:
        conn.close()

@app.post("/api/login")
async def login(credentials: LoginRequest):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE username = ?", (credentials.username.strip().lower(),))
    record = cursor.fetchone()
    conn.close()
    
    if record and bcrypt.checkpw(credentials.password.encode('utf-8'), record[0].encode('utf-8')):
        return {"status": "success", "token": f"token_{credentials.username}"}
            
    raise HTTPException(status_code=401, detail="INVALID_NODE_CREDENTIALS // ACCESS_DENIED")

@app.get("/api/history/{username}")
async def get_user_history(username: str):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, timestamp, analysis_data FROM history WHERE username = ? ORDER BY timestamp DESC", (username.strip().lower(),))
    rows = cursor.fetchall()
    conn.close()
    
    history_deck = []
    for row in rows:
        history_deck.append({
            "id": row[0],
            "title": row[1],
            "timestamp": row[2],
            "analysis_data": json.loads(row[3])
        })
    return history_deck

# =========================================================================
# DATA SEPARATION & INTEL EXTRACTION ENDPOINTS
# =========================================================================

@app.post("/api/extract/youtube")
def extract_youtube_transcript(data: YouTubeRequest):
    video_id = extract_video_id(data.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Could not extract a valid YouTube Video ID.")
    try:
        # Check if cookie bypass file was injected via Render Secret Files
        cookie_path = "cookies.txt"
        has_cookies = os.path.exists(cookie_path)
        
        # Dual fallback mechanism coupled with cookie authentication bypass
        try:
            api_instance = YouTubeTranscriptApi()
            if has_cookies:
                transcript_list = api_instance.fetch(video_id, cookies=cookie_path)
            else:
                transcript_list = api_instance.fetch(video_id)
        except (AttributeError, TypeError):
            if has_cookies:
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id, cookies=cookie_path)
            else:
                transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            
        full_text = " ".join([chunk.get('text', '') if isinstance(chunk, dict) else (getattr(chunk, 'text', '') or '') for chunk in transcript_list])
        return {"video_id": video_id, "text_length": len(full_text), "transcript": full_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")

@app.post("/api/extract/pdf")
async def extract_pdf_text(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    try:
        pdf_reader = pypdf.PdfReader(file.file)
        full_text = ""
        for page in pdf_reader.pages:
            extracted_text = page.extract_text()
            if extracted_text:
                full_text += extracted_text + "\n"
        return {"filename": file.filename, "text_length": len(full_text), "text": full_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")

@app.post("/api/analyze")
def analyze_lecture_text(data: AnalysisRequest):
    if not data.text or len(data.text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Insufficient lecture text provided for analysis.")
    
    prompt = f"""
    You are an elite academic professor and study assistant. Analyze the following lecture text thoroughly.
    Extract the core teaching points, translate technical jargon into simple terminology, and build custom study flashcards.
    
    You MUST return your entire output as a single valid JSON object matching this exact schema template structure:
    
    {{
        "summary": [
            {{"concept": "Name of Core Concept", "explanation": "A deep, informative bullet-point explanation of this concept."}}
        ],
        "jargon": [
            {{"term": "Technical Term/Acronym", "definition": "A clear, intuitive explanation of what it means in simple context."}}
        ],
        "flashcards": [
            {{"question": "A pinpoint question testing a critical takeaway?", "answer": "The direct, informative answer for student self-testing."}}
        ]
    }}
    
    Raw text content block to process:
    {data.text}
    """
    
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        raw_output = response.text.strip()
        
        # Safe markdown stripping block
        backtick_marker = chr(96) * 3
        if raw_output.startswith(backtick_marker):
            lines = raw_output.splitlines()
            if lines[0].strip().startswith(backtick_marker):
                lines = lines[1:]
            if lines and lines[-1].strip().endswith(backtick_marker):
                lines = lines[:-1]
            raw_output = "\n".join(lines).strip()
            
        clean_json_data = json.loads(raw_output)
        
        # Persistent memory registration log step
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO history (username, title, analysis_data) VALUES (?, ?, ?)",
            (data.username.strip().lower(), data.title, json.dumps(clean_json_data))
        )
        conn.commit()
        conn.close()
        
        return clean_json_data
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI response format validation failed. Please re-run execution matrices.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Core Failure: {str(e)}")

# =========================================================================
# ADVANCED SYSTEM DIAGNOSTICS & TELEMETRY VIEWER (FREE SHELL ALTERNATIVE)
# =========================================================================

# Secure administration secret passkey
ADMIN_SECRET = "lecturelens2026"

@app.get("/api/admin/db-dump")
def dump_database_tables(secret: str = Query(None, description="Admin verification secret key")):
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="SECURITY_FAULT: Unauthorized telemetry request.")
        
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Fetch accounts data
        cursor.execute("SELECT id, username, password_hash FROM users")
        users_raw = cursor.fetchall()
        users_table = [{"id": r[0], "username": r[1], "password_hash": r[2]} for r in users_raw]
        
        # Fetch history log data
        cursor.execute("SELECT id, username, title, timestamp, analysis_data FROM history ORDER BY timestamp DESC")
        history_raw = cursor.fetchall()
        
        history_table = []
        for r in history_raw:
            try:
                parsed_data = json.loads(r[4])
            except Exception:
                parsed_data = r[4]
                
            history_table.append({
                "id": r[0],
                "username": r[1],
                "title": r[2],
                "timestamp": r[3],
                "analysis_data": parsed_data
            })
            
        conn.close()
        return {
            "status": "success",
            "active_tables": ["users", "history"],
            "db_metrics": {
                "total_users": len(users_table),
                "total_analyses_logged": len(history_table)
            },
            "tables": {
                "users": users_table,
                "history": history_table
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database Dump Failed: {str(e)}")

@app.get("/api/admin/db-download")
def download_database_binary(secret: str = Query(None, description="Admin verification secret key")):
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="SECURITY_FAULT: Unauthorized file request.")
        
    if not os.path.exists(DB_FILE):
        raise HTTPException(status_code=404, detail="Database file not initialized on disc yet.")
        
    return FileResponse(
        path=DB_FILE,
        filename="lecturelens_production.db",
        media_type="application/x-sqlite3"
    )