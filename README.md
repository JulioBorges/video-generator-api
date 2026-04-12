# Video Generator API

API REST assíncrona para geração de vídeos YouTube a partir de roteiro, com TTS, busca de mídia e renderização via Remotion.

## Stack

- **Runtime:** Node.js 22 + TypeScript
- **Framework:** Express 4
- **TTS:** ElevenLabs (PT/EN, word-level timestamps)
- **Mídia:** SerpAPI + Pexels (imagens/vídeos)
- **Renderização:** Remotion 4 (React-based)
- **Fila:** p-queue (concurrency configurável)
- **DB:** SQLite (better-sqlite3, WAL mode)
- **Storage:** Local FS ou Google Cloud Storage
- **Docs:** Swagger UI em `/docs`
- **Integração AI:** MCP Server em `/mcp`

## Setup Rápido

```bash
# 1. Copiar env
cp .env.example .env
# Preencher .env com as chaves de API

# 2. Instalar dependências
npm install --legacy-peer-deps

# 3. Rodar em dev
npm run dev
```

## Variáveis de Ambiente

```env
PORT=3000
API_KEY=your-secret-key
ELEVENLABS_API_KEY=...
SERPAPI_KEY=...
PEXELS_API_KEY=...
STORAGE_TYPE=local       # ou gcs
DATA_DIR_PATH=~/.yt-video-generator
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
| `POST/GET` | `/mcp` | MCP endpoint para agentes AI |

### Autenticação

Todas as rotas `/api` requerem header `X-API-Key`.

### Corpo da Requisição

```json
{
  "script": "Roteiro do vídeo com mais de 10 caracteres",
  "language": "pt",
  "videoItems": [
    {
      "searchTerm": "inteligencia artificial",
      "type": "video",
      "displayMode": "fit"
    },
    {
      "searchTerm": "E = mc²",
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
    "musicVolume": "medium"
  }
}
```

### Tipos de Cena

| Tipo | Descrição | Display Modes |
|------|-----------|---------------|
| `video` | Vídeo de stock (Pexels) | `fit` |
| `image` | Imagem (SerpAPI) | `ken_burns`, `static`, `slide` |
| `animated_text` | Texto animado | `typewriter`, `fade` |
| `formula` | Fórmula matemática | `reveal` |
| `3d_image` | Imagem 3D | `static` |

### Progresso do Job

| Etapa | Progresso |
|-------|-----------|
| TTS generation | 0–20% |
| Subtitle generation | 20–30% |
| Media search | 30–55% |
| Rendering | 55–90% |
| Storage | 90–100% |

## Docker

```bash
docker compose up -d
```

## Testes

```bash
npm run test:run   # 22 testes unitários
```

## Arquitetura

```
src/
├── api/              # Express routes, middleware, swagger
├── db/               # SQLite setup + jobs repository
├── mcp/              # MCP server (AI agent tools)
├── orchestrator/     # Video pipeline + job queue
├── remotion/         # Compositions + scenes + overlays
├── services/
│   ├── media-search/ # SerpAPI + Pexels
│   ├── music/        # 31 tracks, mood-based selection
│   ├── renderer/     # FFmpeg + Remotion
│   ├── storage/      # Local FS + GCS
│   ├── subtitle/     # Caption generation + SRT
│   └── tts/          # ElevenLabs
├── types/            # Zod schemas + TypeScript types
├── config.ts         # Env validation with Zod
├── logger.ts         # Pino structured logging
└── index.ts          # Bootstrap + DI wiring
```
