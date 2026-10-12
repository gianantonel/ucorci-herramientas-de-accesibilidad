"""Google Translate TTS: MP3 response, no document storage."""
from http.server import BaseHTTPRequestHandler
from io import BytesIO
import json
import os
import requests
from gtts import gTTS

class handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode())

    def do_POST(self):
        origin = self.headers.get('Origin', '')
        if origin != os.environ.get('APP_URL', 'http://localhost:3000'):
            return self.reply(403, {'error': 'Solicitud de otro origen bloqueada.'})
        # The Node endpoint validates the Auth.js session and user record.
        try:
            auth = requests.get(os.environ['APP_URL'] + '/api/tts-permit', headers={'Cookie': self.headers.get('Cookie', '')}, timeout=12)
            if auth.status_code == 429:
                return self.reply(429, {'error': 'Podés generar hasta 12 audios por minuto. Esperá un momento.'})
            if auth.status_code != 200:
                return self.reply(401, {'error': 'Iniciá sesión gratis para generar audio.'})
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 45000:
                return self.reply(413, {'error': 'El texto supera el tamaño permitido.'})
            data = json.loads(self.rfile.read(length))
            text = data.get('text', '').strip()
            if not text or len(text) > 5000:
                return self.reply(400, {'error': 'Ingresá entre 1 y 5000 caracteres por audio.'})
            audio = BytesIO()
            gTTS(text=text, lang='es', tld='com.ar', slow=bool(data.get('slow', False)), timeout=(8, 25)).write_to_fp(audio)
            payload = audio.getvalue()
            if len(payload) > 4000000:
                return self.reply(413, {'error': 'El audio es demasiado grande. Dividí el texto.'})
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Disposition', 'attachment; filename="ucorci-voz.mp3"')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(payload)
        except (ValueError, TypeError, AttributeError):
            self.reply(400, {'error': 'Texto inválido.'})
        except Exception:
            self.reply(503, {'error': 'Google Translate no respondió. Probá escuchar con la voz del dispositivo o intentá más tarde.'})

if __name__ == '__main__':
    import sys
    data = json.load(sys.stdin)
    audio = BytesIO()
    gTTS(text=data['text'], lang='es', tld='com.ar', slow=bool(data.get('slow')), timeout=(8, 25)).write_to_fp(audio)
    sys.stdout.buffer.write(audio.getvalue())
