# pi-mic

Entrada por voz para o pi — no terminal (CLI) e no
[pi-web](https://www.npmjs.com/package/@agegr/pi-web). Você fala, o áudio vai para um endpoint
OpenAI-compatível `/v1/audio/transcriptions` (por exemplo o OmniRoute com Deepgram) e o texto
entra no campo de mensagem, sem enviar.

## Instalação

```bash
pi install npm:pi-mic
```

Depois, no pi, uma vez:

```
/mic setup     # escolhe o provider (chave e baseUrl vêm do models.json/auth.json) e o modelo
/mic check     # confirma provider, chave e endpoint com um áudio de silêncio
```

A configuração fica em `~/.pi/agent/pi-mic.json`:

```json
{ "provider": "omni-memory", "model": "deepgram/nova-3", "language": "pt", "device": "Microphone (HD Pro Webcam C920)" }
```

`language` e `device` são opcionais: sem `language` o gateway detecta o idioma; sem `device`
grava do microfone padrão do sistema.

## CLI

| Ação | Como |
|---|---|
| Começar / parar de gravar | `Alt+M` ou `/mic` |
| Escolher o microfone (Windows) | `/mic device` |
| Configurar provider/modelo/idioma | `/mic setup` |
| Testar o endpoint | `/mic check` |

A transcrição aparece no editor enquanto você fala, de dois jeitos:

- **Tempo real (Deepgram):** com `"realtime": { "provider": "deepgram", "apiKey": "…" }` no
  `pi-mic.json` (ou `DEEPGRAM_API_KEY`), o áudio vai pelo streaming do Deepgram e as palavras
  chegam enquanto você fala. `/mic setup` configura.
- **Trecho a trecho (qualquer provider):** sem `realtime`, o pi-mic separa a fala nas pausas e
  manda cada trecho ao `/audio/transcriptions` do provider, com prévia parcial.

Nos dois modos só passa áudio com voz (alto e com tom): teclado, cliques e batidas não viram
palavras.
Enquanto grava, o editor fica travado (só `Alt+M` para parar e `Esc` para cancelar e voltar ao
texto de antes) e o rodapé mostra `🔴` com o nível do microfone.

Captura: Windows usa a API `waveIn` nativa (nada a instalar); macOS/Linux usam `rec` (SoX) ou
`arecord`. Para testes, `PI_MIC_FAKE_INPUT=<arquivo.wav>` (16 kHz mono) substitui o microfone.

Defina `language` (por exemplo `"pt-BR"`): trechos curtos atrapalham a detecção automática de
idioma.

## pi-web

O pi-web não tem ponto de extensão de interface, então o `pi-mic-web` fica na frente dele:
um proxy que repassa tudo (HTTP, SSE e WebSocket), injeta o botão de microfone na página e
transcreve o áudio no servidor — a chave do provider nunca vai para o navegador.

```bash
npx -p pi-mic pi-mic-web                      # descobre o pi-web em ~/.pi/agent/pi-web-run
npx -p pi-mic pi-mic-web --target http://100.91.99.83:3041 --listen 127.0.0.1:3042
```

Abra `http://127.0.0.1:3042`. O botão de microfone fica na linha do campo de mensagem, logo
antes do Enviar; clique ou use `Alt+M` para gravar e de novo para parar, `Esc` cancela. Como no
CLI, o texto entra ao vivo e o campo (e o Enviar) ficam travados até a transcrição terminar.

O navegador só libera o microfone em contexto seguro: `localhost`/`127.0.0.1` ou HTTPS. Para
usar de outro aparelho, publique o `pi-mic-web` com HTTPS dentro da sua rede privada (por
exemplo `tailscale serve --bg 3042`). Não exponha publicamente: o pi-web pode não ter senha.

## Desenvolvimento

Fluxo git-flow: `feature/*` → `dev` → `release/*` → `main` (e `hotfix/*` → `main` + `dev`).
Commits seguem [Conventional Commits](https://www.conventionalcommits.org/); o CI recusa os
que não seguem. Cada push em `main` calcula a versão pelos commits desde a última tag
(`feat` → minor, `fix`/`perf` → patch, `!`/`BREAKING CHANGE` → major), publica no npm com
trusted publishing e cria a tag e a release no GitHub.

```bash
npm install
npm run check   # biome + tsc + testes
```
