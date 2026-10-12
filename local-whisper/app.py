"""Optional local service. Bind to loopback; do not expose without authentication."""
import os
import tempfile
import threading
from functools import lru_cache
from fastapi import FastAPI, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

ORIGIN = os.getenv('ALLOWED_ORIGIN', 'http://localhost:3000')
app = FastAPI(title='UCORCI faster-whisper local')
app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], allow_methods=['POST'], allow_headers=['Content-Type'])
lock = threading.Lock()

@lru_cache(maxsize=1)
def model():
    return WhisperModel('base', device='cpu', compute_type='int8')

@app.post('/transcribe')
def transcribe(request: Request, audio: UploadFile):
    if request.headers.get('origin') != ORIGIN:
        raise HTTPException(403, 'Origen no permitido')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'Hay otra transcripción en curso')
    path = None
    try:
        content = audio.file.read(25 * 1024 * 1024 + 1)
        if not content or len(content) > 25 * 1024 * 1024:
            raise HTTPException(413, 'Audio vacío o mayor de 25 MB')
        with tempfile.NamedTemporaryFile(delete=False, suffix='.audio') as temp:
            path = temp.name
            temp.write(content)
        segments, info = model().transcribe(path, language='es', beam_size=5, vad_filter=True)
        if info.duration > 600:
            raise HTTPException(413, 'Dividí el audio en partes de hasta 10 minutos')
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return {'text': text}
    finally:
        if path:
            os.unlink(path)
        lock.release()
