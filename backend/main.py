import re
import json
import os
import sqlite3
import bcrypt
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
import pypdf
from google import genai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Lecture Lens API", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("SYSTEM FAULT: GEMINI_API_KEY variable is missing.")

client = genai.Client(api_key=GEMINI_API_KEY)

# =========================================================================
# DATA STRUCTURAL SCHEMAS
# =========================================================================

class YouTubeRequest(BaseModel):
    url: str

class AnalysisRequest(BaseModel):
    text: str
    username: str  # ◄ Track session owner
    title: str     # ◄ Identify history records

class LoginRequest(BaseModel):
    username: str
    password: str

# =========================================================================
# DATABASE MATRIX & PERSISTENCE LAYER
# =========================================================================

def init_db():
    conn = sqlite3.connect("lecturelens.db")
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

@app.post("/api/register")
async def register_user(credentials: LoginRequest):
    username_clean = credentials.username.strip().lower()
    if len(username_clean) < 3 or len(credentials.password) < 6:
        raise HTTPException(status_code=400, detail="Credentials do not match length constraints.")
        
    conn = sqlite3.connect("lecturelens.db")
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
    conn = sqlite3.connect("lecturelens.db")
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE username = ?", (credentials.username.strip().lower(),))
    record = cursor.fetchone()
    conn.close()
    
    if record and bcrypt.checkpw(credentials.password.encode('utf-8'), record[0].encode('utf-8')):
        return {"status": "success", "token": f"token_{credentials.username}"}
            
    raise HTTPException(status_code=401, detail="INVALID_NODE_CREDENTIALS // ACCESS_DENIED")

# =========================================================================
# CORE CORE FUNCTIONAL INTELLIGENCE ENDPOINTS
# =========================================================================

@app.get("/api/history/{username}")
async def get_user_history(username: str):
    conn = sqlite3.connect("lecturelens.db")
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

@app.post("/api/extract/youtube")
def extract_youtube_transcript(data: YouTubeRequest):
    video_id = extract_video_id(data.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Could not extract a valid YouTube Video ID.")
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = " ".join([chunk['text'] for chunk in transcript_list])
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
    
    prompt = f"Analyze this lecture text. Return a single JSON object with arrays for 'summary' (concept/explanation pairs), 'jargon' (term/definition pairs), and 'flashcards' (question/answer pairs). Raw text:\n{data.text}"
    
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        clean_json_data = json.loads(response.text.strip())
        
        # Save output straight into user's historical table record
        conn = sqlite3.connect("lecturelens.db")
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO history (username, title, analysis_data) VALUES (?, ?, ?)",
            (data.username.strip().lower(), data.title, json.dumps(clean_json_data))
        )
        conn.commit()
        conn.close()
        
        return clean_json_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Core Failure: {str(e)}")