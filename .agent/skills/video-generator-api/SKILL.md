---
name: video-generator-api
description: Ultra-specialized skill for creating YouTube videos via the Video Generator API. Generates optimized JSON payloads for POST /api/videos, crafts SEO-driven scripts with scene-by-scene media composition, and orchestrates the full pipeline via MCP tools (create-video, get-video-status, list-videos). Use when the user asks to create, generate, produce, or render any video.
version: 2.0.0
---

# Video Generator API — YouTube Video Production Skill

## Trigger Conditions

Activate this skill when:
- User asks to "create a video," "generate a video," "make a YouTube video," or "produce a Shorts"
- User provides a topic, script, or idea for video content
- User wants to check video rendering progress
- User provides context that implies video creation (e.g., "explain X in video form," "turn this article into a video")

## MCP Tools Reference

### 1. `create-video`

Starts a video generation pipeline. Returns `videoId` for polling.

**Full Schema:**

```json
{
  "script": "string (min 10 chars) — Full narration text. TTS reads this continuously.",
  "language": "pt | en",
  "videoItems": [
    {
      "searchTerm": "string (optional) — English keyword for SerpAPI media search",
      "imageUrl": "string (optional) — URL of a direct image to use. If provided, SerpAPI search is skipped.",
      "type": "image | animated_text | formula | 3d_image",
      "displayMode": "fit | ken_burns | static | slide | typewriter | fade | reveal (optional)",
      "duration": "number (optional) — Duration in seconds (e.g. 5). Will fallback proportionally to match TTS."
    }
  ],
  "useSrt": true,
  "srtStyle": {
    "position": "top | center | bottom (default: bottom)",
    "backgroundColor": "#hex (default: #0066ff)",
    "fontSize": "number (default: 48)",
    "fontFamily": "string (default: Inter)"
  },
  "useBackgroundMusic": true,
  "backgroundMusicStyle": "sad | melancholic | happy | euphoric | excited | chill | uneasy | angry | dark | hopeful | contemplative | funny",
  "config": {
    "orientation": "landscape | portrait (default: landscape)",
    "voice": "string (ElevenLabs voice ID, optional)",
    "paddingBack": "number ms (default: 1500) — silence after narration ends",
    "musicVolume": "muted | low | medium | high (default: medium)"
  }
}
```

### 2. `get-video-status`

Polls pipeline progress. Call every 15s after `create-video`.

**Input:** `{ "videoId": "cuid_string" }`
**Response:** `{ videoId, status, progress (0-100), stage, error, createdAt }`

**Stage progression:** `tts_generation → subtitle_generation → media_search → rendering → storage → done`
**Terminal states:** `ready` (success) or `failed` (check `error` field).

### 3. `list-videos`

Returns all jobs. No input required.

---

## Video Production Protocol

When the user requests a video, execute this pipeline sequentially. **Never skip steps.**

### Step 1 — Topic Analysis & Marketing Context

Before writing the script, determine:

| Factor | Question |
|--------|----------|
| **Audience** | Who watches this? Age range, knowledge level |
| **Platform** | YouTube long-form (landscape) or Shorts (portrait)? |
| **Intent** | Educational, entertainment, promotional, tutorial? |
| **Language** | pt (Portuguese) or en (English)? |
| **Tone** | Formal, conversational, dramatic, humorous? |
| **SEO angle** | What query should this video rank for? |

If the user provides only a topic (e.g., "make a video about black holes"), **ask targeted questions** before proceeding:
1. Language (pt or en)?
2. YouTube or Shorts format?
3. Desired tone/mood?

If user says "just do it" or provides enough context, infer defaults:
- Language: `pt`
- Orientation: `landscape`
- Mood: match topic (science → `contemplative`, business → `hopeful`, horror → `dark`)

### Step 2 — Script Writing (YouTube-Optimized)

Write the narration script following this structure. The `script` field is a **single continuous text** — the TTS reads it as one audio track.

**Script Formula for YouTube (60-180s):**

```
[HOOK — 0-5s]
Provocative question or shocking statement. Must break pattern.

[CONTEXT — 5-15s]
Brief background. Why the viewer should care.

[CORE CONTENT — 15-60s]
Main educational/entertainment payload.
Break complex ideas into 3-5 digestible sentences.
Each sentence = one visual scene.

[TWIST/INSIGHT — 60-75s]
Unexpected angle, data point, or perspective shift.

[CTA — 75-90s]
Close with value recap + channel prompt.
```

**Script Formula for Shorts (15-60s):**

```
[HOOK — 0-3s]
One sentence. Immediate pattern interrupt.

[PAYLOAD — 3-45s]
Dense, fast-paced. 3-4 key points. No filler.

[PUNCHLINE — 45-60s]
Memorable conclusion. One sentence.
```

**Writing Rules:**
- Write in the target language (pt or en)
- Use short sentences (max 15 words each for TTS clarity)
- Avoid parentheses, complex punctuation, or abbreviations
- Include numbers and data for credibility
- Every sentence must correspond to a distinct visual scene
- **Never** end with "subscribe" or "like" — end with value

### Step 3 — Scene Composition (videoItems)

Map every 1-2 sentences of the script to a `videoItem`. The number of `videoItems` MUST match the number of visual transitions in the narration.

**Scene Count Rules:**

| Script Duration | Min Scenes | Max Scenes |
|-----------------|-----------|-----------|
| 15-30s (Shorts) | 3 | 6 |
| 30-60s | 4 | 8 |
| 60-120s | 6 | 12 |
| 120-180s | 8 | 15 |

**Scene Type Selection Matrix:**

| Content Type | Use `type` | Display Mode | When |
|-------------|-----------|-------------|------|
| Nature, city, abstract concepts | `image` | `ken_burns` | Default for most narrative scenes |
| Static visual (diagram, screenshot, product) | `image` | `fit` or `static` | When specific items are shown |
| Title card / key phrase | `animated_text` | `typewriter` or `fade` | Opening hook, key stats, section headers |
| Math / scientific equation | `formula` | `reveal` | When explaining formulas or equations |
| 3D render concept | `3d_image` | `static` | Conceptual or futuristic scenes |

**searchTerm Best Practices:**

The `searchTerm` drives SerpAPI image queries. Quality depends entirely on this field.

| Rule | Example |
|------|---------|
| **Always in English** | ✅ `"deep ocean underwater fish 4k"` ❌ `"peixe no fundo do mar"` |
| **Be specific and visual** | ✅ `"scientist working laboratory microscope"` ❌ `"science"` |
| **Include quality keywords** | Append `4k`, `cinematic`, `aerial`, `close-up` when relevant |
| **Avoid abstract concepts** | ✅ `"person thinking cafe laptop"` ❌ `"artificial intelligence concept"` |
| **Match orientation** | For portrait (Shorts): add `"vertical"`. For landscape: add `"wide"` |
| **3-6 words max** | SerpAPI perform best with concise queries |

**Display Mode Guide:**

| Mode | Visual Effect | Best For |
|------|--------------|---------|
| `fit` | Image fills frame (letterbox if needed) | Screenshots, charts, full images |
| `ken_burns` | Slow zoom/pan on static image | Cinematic photos, portraits, landscapes |
| `static` | No movement | 3D images, diagrams |
| `slide` | Horizontal slide animation | Before/after, comparison |
| `typewriter` | Text appears character by character | Titles, quotes, stats |
| `fade` | Smooth opacity transition | Overlay text, transitions |
| `reveal` | Content reveals progressively | Formulas, step-by-step |

### Step 4 — Audio Configuration

**Music Mood Selection:**

| Video Topic | Recommended Mood | Backup |
|------------|-----------------|--------|
| Science / Space / Philosophy | `contemplative` | `hopeful` |
| Technology / Innovation | `hopeful` | `excited` |
| Business / Finance | `chill` | `hopeful` |
| Horror / Mystery / Crime | `dark` | `uneasy` |
| Comedy / Lifestyle | `funny` | `happy` |
| Motivational / Fitness | `euphoric` | `excited` |
| Drama / Emotions / History | `melancholic` | `sad` |
| Action / Sports / Gaming | `excited` | `angry` |
| Nature / Relaxation | `chill` | `contemplative` |
| Tutorials / Educational | `chill` | `contemplative` |

**Volume Rules:**
- Narration-heavy: `musicVolume: "low"` — voice is primary
- Ambient/visual-heavy: `musicVolume: "medium"` — balanced
- Music video / montage: `musicVolume: "high"` — music drives the feel

**Subtitle Configuration:**
- Always enable `useSrt: true` for YouTube (algorithm indexes captions)
- **Portuguese content**: `backgroundColor: "#0066ff"` (high contrast)
- **English content**: `backgroundColor: "#1a1a1a"` (subtle, professional)
- Shorts: `fontSize: 56` (larger for mobile), `position: "center"`
- Long-form: `fontSize: 48` (default), `position: "bottom"`

### Step 5 — JSON Assembly & Validation

Before calling `create-video`, validate the payload:

**Pre-flight Checklist:**

- [ ] `script` has at least 10 characters
- [ ] `videoItems` array has at least 1 item (aim for 4-8)
- [ ] Every `videoItem.searchTerm` is in English
- [ ] Number of `videoItems` roughly matches number of narration sentences
- [ ] `backgroundMusicStyle` matches the video tone
- [ ] `orientation` matches the target platform (landscape/portrait)
- [ ] No `searchTerm` is a single generic word (e.g., "technology", "nature")

### Step 6 — Call MCP & Monitor

1. Call `create-video` with the assembled JSON
2. Report the `videoId` to the user immediately
3. If user requests monitoring: poll `get-video-status` every 15 seconds
4. On `status: "ready"` → confirm completion with `outputPath`
5. On `status: "failed"` → report the `error` field verbatim

---

## Complete Examples

### Example 1: Portuguese Educational YouTube Video (Landscape)

**User prompt:** "Crie um vídeo sobre buracos negros"

```json
{
  "script": "Você sabia que um buraco negro pode comprimir a massa de milhões de sóis em um único ponto? Eles não sugam tudo ao redor como aspiradores cósmicos. Na verdade, um buraco negro distorce o espaço e o tempo de uma forma tão intensa que nem a luz consegue escapar. O primeiro buraco negro foi fotografado em 2019 pelo Event Horizon Telescope. Aquela famosa imagem laranja que você já viu. E o mais impressionante: no centro da nossa galáxia, a Via Láctea, existe um buraco negro supermassivo chamado Sagitário A estrela, com 4 milhões de vezes a massa do Sol. A ciência ainda não sabe o que acontece dentro de um buraco negro. Mas uma coisa é certa: o universo é muito mais estranho do que imaginamos.",
  "language": "pt",
  "videoItems": [
    { "searchTerm": "black hole space visualization 4k", "type": "image", "displayMode": "ken_burns", "duration": 5 },
    { "searchTerm": "gravitational lensing space effect", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "spacetime distortion animation", "type": "image", "displayMode": "ken_burns", "duration": 3 },
    { "searchTerm": "event horizon telescope black hole photo", "type": "image", "displayMode": "fit" },
    { "searchTerm": "milky way galaxy center stars", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "deep space nebula stars cinematic", "type": "image", "displayMode": "ken_burns" }
  ],
  "useSrt": true,
  "srtStyle": {
    "position": "bottom",
    "backgroundColor": "#0066ff",
    "fontSize": 48,
    "fontFamily": "Inter"
  },
  "useBackgroundMusic": true,
  "backgroundMusicStyle": "contemplative",
  "config": {
    "orientation": "landscape",
    "paddingBack": 2000,
    "musicVolume": "low"
  }
}
```

### Example 2: English YouTube Shorts (Portrait)

**User prompt:** "Create a Shorts about why we dream"

```json
{
  "script": "Your brain doesn't shut off when you sleep. It actually becomes more active during REM sleep than when you're awake. Dreams might be your brain processing emotions and consolidating memories from the day. Some scientists believe dreams are just random neural firings that your brain tries to make sense of. But here's the craziest part. Lucid dreamers can actually control their dreams. Your mind is literally a movie studio that runs every single night.",
  "language": "en",
  "videoItems": [
    { "searchTerm": "person sleeping bed night close up", "type": "image", "displayMode": "ken_burns", "duration": 4 },
    { "searchTerm": "brain neural activity visualization", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "dreaming surreal clouds floating", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "neurons firing brain scan", "type": "image", "displayMode": "fit" },
    { "searchTerm": "lucid dreaming surreal landscape", "type": "image", "displayMode": "ken_burns", "duration": 3 }
  ],
  "useSrt": true,
  "srtStyle": {
    "position": "center",
    "backgroundColor": "#1a1a1a",
    "fontSize": 56,
    "fontFamily": "Inter"
  },
  "useBackgroundMusic": true,
  "backgroundMusicStyle": "dark",
  "config": {
    "orientation": "portrait",
    "paddingBack": 1000,
    "musicVolume": "low"
  }
}
```

### Example 3: Formula + Animated Text (Math/Science)

**User prompt:** "Faça um vídeo explicando E=mc²"

```json
{
  "script": "Essa é a equação mais famosa do mundo. E igual a m c ao quadrado. Mas o que ela realmente significa? A letra E representa a energia contida em qualquer objeto. A letra m é a massa desse objeto. E c é a velocidade da luz, que é 300 mil quilômetros por segundo. Quando você multiplica a massa pela velocidade da luz ao quadrado, descobre que mesmo uma pequena quantidade de matéria contém uma quantidade absurda de energia. Foi assim que Einstein mostrou que matéria e energia são a mesma coisa. E essa descoberta mudou a física para sempre.",
  "language": "pt",
  "videoItems": [
    { "searchTerm": "E=mc²", "type": "formula", "displayMode": "reveal" },
    { "searchTerm": "A equação que mudou tudo", "type": "animated_text", "displayMode": "typewriter", "duration": 3 },
    { "searchTerm": "albert einstein portrait vintage", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "particle accelerator physics lab", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "nuclear energy power plant aerial", "type": "image", "displayMode": "ken_burns" },
    { "searchTerm": "universe stars galaxies cinematic", "type": "image", "displayMode": "ken_burns", "duration": 5 }
  ],
  "useSrt": true,
  "useBackgroundMusic": true,
  "backgroundMusicStyle": "contemplative",
  "config": {
    "orientation": "landscape",
    "paddingBack": 2000,
    "musicVolume": "low"
  }
}
```

---

## YouTube SEO Integration

When composing the `script`, apply these SEO principles from the marketing skills knowledge base:

**Video Optimization (video-optimization):**
- Front-load the main keyword in the first sentence of the script
- Structure the narration for YouTube's automatic chapter detection (clear topic shifts per scene)
- Captions via `useSrt: true` enable YouTube's subtitle indexing

**Content Strategy (content-strategy):**
- Each video should target one specific keyword cluster
- Series of related videos build topical authority — suggest follow-ups after generation

**Keyword Research (keyword-research):**
- Use the user's topic to infer search queries viewers would type
- Incorporate long-tail variations naturally in the script

**Schema & Metadata (schema-markup, serp-features):**
- Suggest title, description, and tags for the generated video
- The script itself should be structured for **featured snippet** extraction (question → direct answer)

After video generation completes, provide the user with:

1. **Suggested YouTube Title** — Under 60 chars, keyword-front-loaded
2. **Suggested Description** — First 150 chars contain the keyword; include timestamps matching scenes
3. **Suggested Tags** — 8-12 relevant tags
4. **Suggested Thumbnail Concept** — Text overlay + background color matching the video mood

---

## Error Handling

| Error Pattern | Cause | Resolution |
|--------------|-------|-----------|
| `No videos found for search term` | searchTerm too abstract or niche | Simplify to 2-3 concrete visual words |
| `No images found for search term` | SerpAPI returned empty | Try alternative phrasing, remove qualifiers |
| ElevenLabs quota exceeded | TTS API limit | Inform user; suggest shorter script or wait |
| Remotion render OOM | Too many scenes or high-resolution media | Reduce to 6 scenes max; use `portrait` for lower resolution |
| `status: "failed"` with no `error` | Pipeline crash | Check server logs; suggest retry |

**Retry Strategy:** If generation fails on `media_search` stage, rebuild `videoItems` with simpler `searchTerm` values and retry.

---

## Pipeline Architecture Reference

```
User Request → Script Generation → JSON Assembly → create-video MCP call
                                                          │
                                    ┌─────────────────────┘
                                    ▼
                              Video Pipeline
                    ┌──────────────────────────┐
                    │ 1. TTS (ElevenLabs)      │ 0-20%
                    │ 2. Subtitles (SRT)       │ 20-30%
                    │ 3. Media Search          │ 30-55%
                    │    ├─ SerpAPI (image)     │
                    │    └─ Internal (text/formula) │
                    │ 4. Remotion Render       │ 55-90%
                    │ 5. Storage (local/GCS)   │ 90-100%
                    └──────────────────────────┘
                                    │
                                    ▼
                           status: "ready"
                        → outputPath: .mp4
```