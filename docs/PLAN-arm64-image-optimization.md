# Plano de Implementação: Otimização ARM64 e Tempos de Imagens

## Objetivo
Otimizar o desempenho de geração de vídeo do sistema em uma VPS Ampere (ARM64), forçando a utilização de imagens estatícas nativas em vez de clipes de vídeos, resolvendo gargalos de emulação através de binários ARM e implementando uma gestão inteligente do tempo de exibição das imagens baseada em TTS.

## Fases de Implementação

### Fase 1: Otimização do Docker (Binários Nativos ARM64)
- **Tarefa 1.1:** Atualizar o `Dockerfile` para instalar `chromium` e `ffmpeg` das origens nativas da distro (`apt` ou `apk`), prevenindo a emulação x86_64 que destrói a performance na Oracle Cloud.
- **Tarefa 1.2:** Configurar as variáveis globais (`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` e `PUPPETEER_EXECUTABLE_PATH`) para atrelar a engine do Remotion aos instaladores locais.
- **Tarefa 1.3:** Adequar limites de concorrência (`concurrency`) nas chamadas do `renderMedia` para a realidade de 6 vCPUs.

### Fase 2: Schema de Vídeo (API)
- **Tarefa 2.1:** Modificar o schema `VideoItemSchema` (`src/types/video.types.ts`) introduzindo uma propriedade nativa (ex: `duration?: number`) para reger o tempo estipulado em segundos em que a cena específica deve durar.
- **Tarefa 2.2:** Forçar a recusa/remoção da requisição de vídeos pela pipeline, mantendo exclusivamente instâncias de imagens.

### Fase 3: Lógica Customizada de Duração (video-pipeline.ts)
- **Tarefa 3.1:** Após o job finalizar o TTS (Step 1) retornando a duração em segundos real, calcular os espaços entre imagens.
- **Tarefa 3.2:** Desenvolver o fallback matemático no Orquestrador:
  - Iterar pelo Array de Imagens; 
  - Se a imagem tiver com sua variável `duration` setada pela request, isolamos do pool total de tempo;
  - Com o restante dos segundos não alocados no pool do arquivo de áudio, dividimos inteiramente pela *quantidade de imagens sobressalentes sem duration definido*.
  - Gerar e reconfigurar as variáveis da engine Remotion.

### Fase 4: Otimização Visual (Remotion)
- **Tarefa 4.1:** Adequar as instâncias visuais `<Sequence />` do Remotion para consumirem os blocos perfeitos de temporização calculados externamente sem causar desync com o áudio final da composição.

## Definições Estratégicas (Casos de Borda Resolvidos)
1. **Soma dos Tempos > Áudio Total:** Caso as durações explícitas ultrapassem o áudio TTS, os tempos serão redimensionados (cortados) de maneira proporcional para se adequarem exatamente à duração total.
2. **Tempo Mínimo de Exibição:** Fica estabelecido um tempo mínimo de **2 segundos (`MIN_DURATION_SECONDS`)** por imagem para evitar o efeito "flash".
3. **Resolução e FPS:** A configuração do Remotion ficará parametrizada obrigatoriamente para **720p (720x1280 ou 1280x720) a 30 FPS**, minimizando exaustão de processamento na VPS.
