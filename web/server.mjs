#!/usr/bin/env node
// pi-mic-web: proxy na frente do pi-web que injeta o botão de microfone e transcreve o áudio
// pelo mesmo provider do /mic (chave lida de auth.json/models.json, nunca enviada ao navegador).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PREFIX = "/__pi-mic";
const MAX_AUDIO = 25 * 1024 * 1024;
const here = dirname(fileURLToPath(import.meta.url));
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

/** Endereço do pi-web pelo registro de execução mais recente em <agentDir>/pi-web-run. */
function detectTarget() {
  const dir = join(agentDir, "pi-web-run");
  if (!existsSync(dir)) return undefined;
  const runs = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const run = runs[0] && readJson(runs[0]);
  return run?.port ? `http://${run.hostname || "127.0.0.1"}:${run.port}` : undefined;
}

const targetUrl = arg("--target") || process.env.PI_MIC_WEB_TARGET || detectTarget();
if (!targetUrl) {
  console.error("pi-mic-web: pi-web address unknown; pass --target http://host:port");
  process.exit(1);
}
const target = new URL(targetUrl);
const [listenHost, listenPort] = (
  arg("--listen") ||
  process.env.PI_MIC_WEB_LISTEN ||
  "127.0.0.1:3042"
).split(":");

function resolveEndpoint() {
  const config = readJson(join(agentDir, "pi-mic.json")) ?? {};
  const provider = config.provider;
  if (!provider) throw new Error("no provider set in pi-mic.json; run /mic setup in pi");
  const models = readJson(join(agentDir, "models.json"))?.providers?.[provider] ?? {};
  const auth = readJson(join(agentDir, "auth.json"))?.[provider];
  let apiKey = auth?.key;
  if (!apiKey && typeof models.apiKey === "string")
    apiKey = process.env[models.apiKey] || models.apiKey;
  const baseUrl = config.baseUrl || models.baseUrl;
  if (!apiKey) throw new Error(`no API key for provider "${provider}"`);
  if (!baseUrl) throw new Error(`no baseUrl for provider "${provider}"`);
  return { apiKey, baseUrl, model: config.model || "deepgram/nova-3", language: config.language };
}

const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" };

async function handleTranscribe(req, res) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_AUDIO) return sendJson(res, 413, { error: "audio too large" });
    chunks.push(c);
  }
  try {
    const ep = resolveEndpoint();
    const type = (req.headers["content-type"] || "audio/webm").split(";")[0].trim();
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.concat(chunks)], { type }),
      `speech.${EXT[type] || "webm"}`,
    );
    form.append("model", ep.model);
    if (ep.language) form.append("language", ep.language);
    const r = await fetch(`${ep.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ep.apiKey}` },
      body: form,
    });
    const body = await r.text();
    if (!r.ok) return sendJson(res, 502, { error: `HTTP ${r.status}: ${body.slice(0, 300)}` });
    const json = JSON.parse(body);
    const text = (json.text ?? "").trim();
    sendJson(res, 200, { text, noSpeech: json.noSpeechDetected === true || text === "" });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

function upstreamHeaders(headers) {
  const out = { ...headers, host: target.host, "accept-encoding": "identity" };
  if (out.origin) out.origin = target.origin;
  if (out.referer) out.referer = out.referer.replace(/^https?:\/\/[^/]+/, target.origin);
  return out;
}

const TAG = Buffer.from(`<script type="module" src="${PREFIX}/client.js"></script>`);
const HEAD_END = Buffer.from("</head>");

/** Repassa o HTML injetando o script antes de </head>, sem esperar o fim do streaming. */
function pipeInjected(up, res) {
  let pending = Buffer.alloc(0);
  let done = false;
  up.on("data", (chunk) => {
    if (done) return res.write(chunk);
    pending = Buffer.concat([pending, chunk]);
    const i = pending.indexOf(HEAD_END);
    if (i < 0) return;
    res.write(Buffer.concat([pending.subarray(0, i), TAG, pending.subarray(i)]));
    pending = Buffer.alloc(0);
    done = true;
  });
  up.on("end", () => res.end(pending));
}

function proxy(req, res) {
  const up = http.request(
    {
      host: target.hostname,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req.headers),
    },
    (ur) => {
      const headers = { ...ur.headers };
      if ((headers["content-type"] || "").startsWith("text/html")) {
        delete headers["content-length"];
        res.writeHead(ur.statusCode, headers);
        pipeInjected(ur, res);
      } else {
        res.writeHead(ur.statusCode, headers);
        ur.pipe(res);
      }
    },
  );
  up.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`pi-mic-web: pi-web unreachable at ${target.origin} (${err.message})`);
  });
  req.pipe(up);
  res.on("close", () => up.destroy());
}

const STATIC = Object.fromEntries(
  ["client.js", "live-core.js"].map((f) => [`${PREFIX}/${f}`, readFileSync(join(here, f))]),
);

const server = http.createServer((req, res) => {
  const file = STATIC[req.url];
  if (file) {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache" });
    return res.end(file);
  }
  if (req.url === `${PREFIX}/transcribe` && req.method === "POST")
    return handleTranscribe(req, res);
  proxy(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const up = net.connect(Number(target.port), target.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(upstreamHeaders(req.headers))) {
      for (const val of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${val}`);
    }
    up.write(`${lines.join("\r\n")}\r\n\r\n`);
    up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(Number(listenPort), listenHost, () => {
  console.log(`pi-mic-web: http://${listenHost}:${listenPort} → ${target.origin}`);
});
