# UCORCI Herramientas de Accesibilidad

Herramientas gratuitas de la Unión Cordobesa de Ciegos, Córdoba, Argentina, para el mundo. Código abierto bajo licencia MIT.

## Herramientas

- **Texto a voz:** texto libre y extracción local de PDF con texto, Word DOCX, Excel XLSX (todas las hojas), TXT y HTML. Google Translate mediante gTTS, `lang='es'`, `tld='com.ar'`. MP3 y conversión a WAV PCM en el navegador. Hasta 5000 caracteres por audio. Google decide la voz; no se garantiza un acento argentino específico ni disponibilidad permanente de ese servicio no oficial.
- **Audio a texto:** Whisper base multilingüe cuantizado en el navegador (Transformers.js), sin API paga; audio procesado en el dispositivo. Primera descarga del modelo desde Hugging Face. Audio de hasta 25 MB y 10 minutos. Grabación mediante micrófono, edición del resultado, copiar y descargar TXT sin emojis. Servicio Python opcional con faster-whisper base CPU/int8.
- **Lectura para dislexia:** presentación en Comic Sans (Comic Neue libre si no está instalada), tamaño, espaciado e interlineado. Conserva el contenido. Exporta TXT, HTML o impresión. No es un tratamiento ni se afirma que una fuente sirva a todas las personas.

Índice, buscador, modo oscuro predeterminado, modo claro, amarillo sobre negro, tamaño de texto y fuente global. Preferencias guardadas localmente. Sin iconos o emojis decorativos en las herramientas.

## Registro y privacidad

Nombre, apellido, correo y contraseña (mínimo 12 caracteres). Contraseñas con bcrypt, nunca en texto plano. Auth.js usa cookies HttpOnly para sesiones de hasta 90 días, SameSite y Secure en HTTPS. Los campos usan `autocomplete` para gestores de contraseñas; la aplicación no guarda contraseñas en localStorage.

OAuth preparado para Google, Apple, Facebook y GitHub; solo aparecen proveedores con credenciales configuradas. No se vinculan automáticamente cuentas diferentes por coincidencia de email. Un nuevo usuario social completa su nombre y apellido antes de usar las herramientas. Las cuentas creadas con contraseña aún no verifican la titularidad del correo ni ofrecen recuperación por email: SMTP y flujo de recuperación son trabajo pendiente y no se simulan.

La producción usa PostgreSQL en el proyecto separado **UCORCI-herramientas-de-accesibilidad** de InsForge, elegido por el titular. SQLite permanece como alternativa para desarrollo local y pruebas. La base guarda cuentas y métricas (herramienta, duración, resultado y fecha). No guarda documentos, textos ni audios. Google recibe el texto al generar audio. Una persona puede exportar o borrar sus datos desde Mi cuenta. No existe un endpoint público que liste usuarios o métricas de otras personas.

## Desarrollo local

Requisitos: Node.js 22 o superior; Python 3.10 o superior para TTS y el servicio opcional.

```sh
npm install
# Copiar .env.example a .env y generar AUTH_SECRET de al menos 32 caracteres aleatorios.
# Ejemplo: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run db:init
pip install -r requirements.txt
npm run dev
```

Abrir http://localhost:3000. SQLite local se crea en `data/ucorci.db` y se conserva entre reinicios. Si Python no está en PATH, definir `PYTHON_BIN` en `.env`. El servidor local debe mantenerse ligado a loopback; para hospedar públicamente, usar Vercel o un servidor HTTPS administrado.

```sh
npm test
npm run build
node server/metrics.mjs
```

El informe de métricas es administrativo y se ejecuta en un entorno con acceso a la base. No publicar su credencial en el frontend.

## Vercel e InsForge PostgreSQL

Proyecto InsForge: `dccb03fc-63c3-4217-a71c-21edc26625d9`, nombre `UCORCI-herramientas-de-accesibilidad`. Es independiente de `en-una-nota`.

Variables de producción: `INSFORGE_URL`, `INSFORGE_API_KEY`, `INSFORGE_ANON_KEY`, `AUTH_SECRET` y `APP_URL`. La clave administrativa **solo se usa en las funciones del servidor**, nunca en variables `VITE_` ni en el navegador. La migración está en `migrations/20261012222803_create-ucorci-schema.sql`; se aplica con `npx @insforge/cli db migrations up --all`.

Las tablas `ucorci_users`, `ucorci_accounts`, `ucorci_usage_events` y `ucorci_rate_limits` tienen RLS y revocación de acceso directo a `anon` y `authenticated`. Auth.js verifica la sesión en Vercel y el SDK administrativo realiza únicamente la operación autorizada para ese usuario. Las funciones de limitación de intentos e informe de métricas son exclusivamente administrativas.

Google y GitHub usan los proveedores integrados de InsForge, con PKCE, verifier en cookie HttpOnly de corta duración, intercambio de código en servidor y cookie de sesión Auth.js cifrada. Callback: `https://ucorci-herramientas-de-accesibilidad.vercel.app/api/oauth/callback`. Las cuentas nuevas completan nombre y apellido; no se vincula automáticamente un acceso social a una cuenta con contraseña que ya usa ese email.

## Alternativa: Vercel y SQLite persistente

**No usar `file:` ni `/tmp` en Vercel para registros reales.** Sus funciones no garantizan un archivo SQLite compartido y persistente. Usar SQLite remoto compatible con libSQL (por ejemplo Turso) o adaptar el cliente a otro servicio SQLite. Un proyecto PostgreSQL de InsForge no es SQLite.

Variables de entorno del servidor:

| Variable              | Valor                                                     |
| --------------------- | --------------------------------------------------------- |
| `DATABASE_URL`        | URL `libsql://` de una base SQLite persistente            |
| `DATABASE_AUTH_TOKEN` | Token privado de esa base                                 |
| `AUTH_SECRET`         | Secreto aleatorio estable, al menos 32 caracteres         |
| `APP_URL`             | `https://ucorci-herramientas-de-accesibilidad.vercel.app` |

La aplicación crea automáticamente el esquema en el primer acceso. También se puede ejecutar `npm run db:init` con las mismas variables en un entorno administrativo. Si falta SQLite persistente, el servidor devuelve 503 y el sitio informa que el registro está pendiente de configuración; no se simula una cuenta.

```sh
npx vercel login
npx vercel link --project ucorci-herramientas-de-accesibilidad
npx vercel --prod
```

El repositorio puede importarse en Vercel con Vite como framework; `vercel.json` configura las funciones Node y Python. Vercel suele requerir nombres de proyecto en minúsculas; la marca visible mantiene UCORCI.

### Acceso social

Crear una aplicación en la consola de cada proveedor y guardar las credenciales **solo en el servidor**:

- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET` (Apple usa un client secret JWT con vencimiento; renovarlo según su configuración)
- `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET`
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`

Callback: `https://ucorci-herramientas-de-accesibilidad.vercel.app/api/auth/callback/google` (cambiar `google` por `apple`, `facebook` o `github`). No se pueden activar estos proveedores sin registrar las aplicaciones externas. Apple puede requerir membresía de desarrollador; no se garantiza gratuidad de ese proveedor.

## faster-whisper opcional

```sh
pip install -r local-whisper/requirements.txt
uvicorn local-whisper.app:app --host 127.0.0.1 --port 8000
```

Establecer `VITE_STT_SERVICE_URL=http://127.0.0.1:8000` y `ALLOWED_ORIGIN=http://localhost:3000`. En producción, usar un servicio HTTPS con autenticación y límites propios; el ejemplo está pensado para una instalación local en loopback. La primera vez descarga el modelo. No publicar este servicio sin agregar control de acceso. No se instala el modelo de Python dentro de las funciones de Vercel.

## Accesibilidad y límites de verificación

Objetivo WCAG 2.2 AA: estructura semántica, idioma es-AR, enlace para saltar contenido, foco visible, controles nativos, etiquetas visibles, estados y errores anunciados, diálogo con foco contenido, teclado, reflujo móvil y preferencias de contraste/tamaño/fuente. Compatibilidad orientada a NVDA, JAWS, TalkBack y VoiceOver; requiere pruebas manuales con esos lectores antes de afirmar conformidad completa.

PDF escaneado: OCR todavía no incluido. DOC y XLS antiguos: convertir a DOCX/XLSX. Los archivos protegidos o dañados pueden fallar. Los documentos complejos pueden requerir corregir el orden del texto. Whisper puede cometer errores o inventar palabras ante silencio; revisar todas las transcripciones.

Fuentes técnicas: [gTTS](https://gtts.readthedocs.io/en/latest/module.html), [Transformers.js](https://huggingface.co/docs/transformers.js/api/pipelines), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Auth.js](https://authjs.dev/reference/express), [limitaciones de Vercel](https://vercel.com/docs/functions/limitations).

Comic Neue se incluye con su licencia OFL en `public/fonts/OFL.txt`.
