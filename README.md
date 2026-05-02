# Video Generator API

API REST assíncrona para geração de vídeos a partir de roteiro, com TTS multi-provider e renderização via Remotion.

## Stack

- **Runtime:** Node.js 22 + TypeScript
- **Framework:** Express 4
- **TTS:** OpenAI, ElevenLabs, Google Cloud TTS, Kokoro (local)
- **Renderização:** Remotion 4 (React-based)
- **Fila:** p-queue (concurrency configurável)
- **DB:** SQLite (better-sqlite3, WAL mode)
- **Storage:** Local FS ou Google Cloud Storage
- **Docs:** Swagger UI em `/docs`
- **Integração AI:** MCP Server via SSE em `/sse`

## Setup Rápido

```bash
# 1. Copiar env
cp .env.example .env
# Preencher .env com as chaves de API

# 2. Instalar dependências
yarn install

# 3. Rodar em dev
yarn dev
```

## Variáveis de Ambiente

```env
PORT=3000
API_KEY=your-secret-key

# TTS API Keys (preencher conforme o provider usado)
ELEVENLABS_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_TTS_KEY_FILE=/path/to/service-account.json

# Storage (local | gcs)
STORAGE_TYPE=local
# GCS_BUCKET=your-gcs-bucket
# GCS_KEY_FILE=/path/to/service-account.json

# App
DATA_DIR_PATH=~/.yt-video-generator
LOG_LEVEL=info
CONCURRENCY=1
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------| 
| `POST` | `/api/videos` | Criar job de geração |
| `GET` | `/api/videos` | Listar todos os jobs |
| `GET` | `/api/videos/:id/status` | Status e progresso |
| `GET` | `/api/videos/:id` | Download do vídeo (MP4) |
| `DELETE` | `/api/videos/:id` | Remover vídeo |
| `GET` | `/api/videos/music-styles` | Estilos de música disponíveis |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/sse` | MCP SSE endpoint (agentes AI) |

### Autenticação

Todas as rotas `/api` requerem header `X-API-Key`.

### Corpo da Requisição

```json
{
  "script": "Roteiro do vídeo com mais de 10 caracteres",
  "language": "pt",
  "ttsProvider": "kokoro",
  "videoItems": [
    {
      "imageUrl": "https://example.com/image1.jpg",
      "type": "image",
      "displayMode": "ken_burns"
    },
    {
      "imageUrl": "https://example.com/formula.png",
      "type": "formula",
      "displayMode": "reveal"
    }
  ],
  "useSrt": true,
  "srtStyle": {
    "position": "bottom",
    "backgroundColor": "#0066ff",
    "fontSize": 52
  },
  "useBackgroundMusic": true,
  "backgroundMusicStyle": "hopeful",
  "config": {
    "orientation": "landscape",
    "voice": "pm_alex",
    "voiceSpeed": 1.0,
    "paddingBack": 1500,
    "musicVolume": "medium"
  }
}
```

### Tipos de Cena

| Tipo | Descrição | Display Modes |
|------|-----------|---------------|
| `image` | Imagem (URL obrigatória) | `ken_burns`, `static`, `slide`, `fit` |
| `animated_text` | Texto animado | `typewriter`, `fade` |
| `formula` | Fórmula matemática | `reveal` |
| `3d_image` | Imagem 3D | `static` |

### TTS Providers

| Provider | Config `voice` | Notas |
|----------|---------------|-------|
| `openai` | `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | Requer `OPENAI_API_KEY` |
| `elevenlabs` | Voice ID (ex: `pNInz6obpgDQGcFmaJgB`) | Requer `ELEVENLABS_API_KEY` |
| `google` | Voice name (ex: `pt-BR-Neural2-A`) | Requer `GOOGLE_TTS_KEY_FILE` |
| `kokoro` | Voice name (ex: `pm_alex`, `af_heart`) | Local, sem API key. Suporta `voiceSpeed` |

### Progresso do Job

| Etapa | Progresso |
|-------|-----------|
| TTS generation | 0–20% |
| Subtitle generation | 20–30% |
| Image download | 30–55% |
| Rendering | 55–90% |
| Storage | 90–100% |

## Docker

```bash
docker compose up -d
```

## Testes

```bash
yarn test
```

## Arquitetura

```
src/
├── api/              # Express routes, middleware, swagger
├── db/               # SQLite setup + jobs repository
├── mcp/              # MCP server (AI agent tools via SSE)
├── orchestrator/     # Video pipeline + job queue
├── remotion/         # Compositions + scenes + overlays
├── services/
│   ├── music/        # 31 tracks, mood-based selection
│   ├── renderer/     # FFmpeg + Remotion
│   ├── storage/      # Local FS + GCS
│   ├── subtitle/     # Caption generation + pages
│   └── tts/          # OpenAI, ElevenLabs, Google, Kokoro
├── types/            # Zod schemas + TypeScript types
├── config.ts         # Env validation with Zod
├── logger.ts         # Pino structured logging
└── index.ts          # Bootstrap + DI wiring
```
