// Núcleo da transcrição ao vivo, o mesmo no navegador (pi-web) e no Node (CLI).
// Recebe PCM mono int16 na taxa nativa do microfone (sem reamostrar: o áudio enviado ao
// reconhecimento é o original). A detecção de voz analisa uma cópia reduzida só internamente.

/** Taxa padrão quando quem chama não informa a sua. */
export const SAMPLE_RATE = 16000;

/** Amostras de um quadro de 20 ms. @param {number} rate */
const frameLen = (rate) => Math.round(rate / 50);

/**
 * WAV PCM 16 bits mono.
 * @param {Int16Array} pcm
 * @param {number} [rate]
 * @returns {Uint8Array}
 */
export function encodeWav(pcm, rate = SAMPLE_RATE) {
  const out = new Uint8Array(44 + pcm.length * 2);
  const v = new DataView(out.buffer);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
  return out;
}

/**
 * Float32 [-1, 1] → Int16, na mesma taxa (sem reamostrar).
 * @param {Float32Array} input
 * @returns {Int16Array}
 */
export function floatToInt16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Quadros de voz (20 ms cada) para um trecho contar como fala: 200 ms de vogais. */
const MIN_VOICED = 10;

/**
 * @typedef {{ frames: Int16Array[], voiced: number, quiet: number, interimAt: number, interim: string, closed?: boolean }} Seg
 * @returns {Seg}
 */
const newSeg = () => ({ frames: [], voiced: 0, quiet: 0, interimAt: 0, interim: "" });

/**
 * Periodicidade do quadro: pico da autocorrelação normalizada entre 80 e 400 Hz (0..1).
 * Só para detectar voz; analisa uma amostra a cada `rate/16000` (o tom da voz fica bem abaixo).
 * @param {Int16Array} f
 * @param {number} [rate]
 */
export function periodicity(f, rate = SAMPLE_RATE) {
  const step = Math.max(1, Math.round(rate / 16000));
  const r = rate / step;
  const n = Math.floor(f.length / step);
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += f[i * step];
  mean /= n || 1;
  let e0 = 0;
  for (let i = 0; i < n; i++) {
    x[i] = f[i * step] - mean;
    e0 += x[i] * x[i];
  }
  if (e0 === 0) return 0;
  let best = 0;
  for (let lag = Math.floor(r / 400); lag <= Math.ceil(r / 80); lag++) {
    let c = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < n; i++) {
      c += x[i] * x[i + lag];
      e1 += x[i] * x[i];
      e2 += x[i + lag] * x[i + lag];
    }
    const v = c / Math.sqrt(e1 * e2 || 1);
    if (v > best) best = v;
  }
  return best;
}

/**
 * Junta `rest` + `chunk`, chama `each` para cada quadro de `len` amostras e devolve a sobra.
 * @param {Int16Array} rest
 * @param {Int16Array} chunk
 * @param {number} len
 * @param {(f: Int16Array) => void} each
 */
function frames(rest, chunk, len, each) {
  const all = new Int16Array(rest.length + chunk.length);
  all.set(rest);
  all.set(chunk, rest.length);
  let off = 0;
  for (; off + len <= all.length; off += len) each(all.slice(off, off + len));
  return all.slice(off);
}

/** Detector de voz por quadro: alto (acima do ruído de fundo) E periódico. */
export class VoiceDetector {
  /** @param {number} [rate] */
  constructor(rate = SAMPLE_RATE) {
    this.rate = rate;
    this.floor = 150;
  }

  /** @param {Int16Array} f */
  frame(f) {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    // Ruído de fundo pelo mínimo: desce rápido, sobe devagar. Não depende de começar em silêncio.
    this.floor =
      rms < this.floor ? this.floor * 0.7 + rms * 0.3 : this.floor + (rms - this.floor) * 0.002;
    // Vogais têm tom; clique de tecla e batida são altos mas sem tom.
    const voiced = rms > Math.max(300, this.floor * 3) && periodicity(f, this.rate) > 0.45;
    return { level: Math.min(1, rms / 6000), voiced };
  }
}

/**
 * Portão de ruído para o streaming: repassa o áudio original com 300 ms de atraso e zera o que
 * não está perto de voz (300 ms antes até 700 ms depois), para teclado e batidas não virarem
 * palavras. O que passa não é alterado.
 */
export class NoiseGate {
  /**
   * @param {(pcm: Int16Array) => void} out
   * @param {(level: number) => void} [onLevel]
   * @param {number} [rate]
   */
  constructor(out, onLevel, rate = SAMPLE_RATE) {
    this.out = out;
    this.onLevel = onLevel;
    this.len = frameLen(rate);
    this.vad = new VoiceDetector(rate);
    this.rest = new Int16Array(0);
    /** @type {Int16Array[]} */
    this.queue = [];
    this.index = 0; // índice do próximo quadro que entra
    this.lastVoiced = -1_000_000;
    this.delay = 15;
    this.hold = 35;
  }

  /** @param {Int16Array} chunk */
  push(chunk) {
    this.rest = frames(this.rest, chunk, this.len, (f) => {
      const { level, voiced } = this.vad.frame(f);
      this.onLevel?.(level);
      if (voiced) this.lastVoiced = this.index;
      this.queue.push(f);
      this.index++;
    });
    if (this.queue.length > this.delay) this.emit(this.queue.length - this.delay);
  }

  /** @param {number} n */
  emit(n) {
    const first = this.index - this.queue.length;
    const batch = this.queue.splice(0, n);
    const out = new Int16Array(batch.length * this.len);
    for (let k = 0; k < batch.length; k++)
      if (this.lastVoiced >= first + k - this.hold) out.set(batch[k], k * this.len);
    this.out(out);
  }

  /** Solta o que está no atraso e a sobra de menos de um quadro (ao parar). */
  flush() {
    if (this.rest.length) {
      const tail = new Int16Array(this.len);
      tail.set(this.rest);
      this.rest = new Int16Array(0);
      this.queue.push(tail);
      this.index++;
    }
    if (this.queue.length) this.emit(this.queue.length);
  }
}

/** @param {string[]} parts */
const join = (parts) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");

/**
 * @typedef {{ text: string, noSpeech?: boolean }} SttResult
 * @typedef {object} LiveOptions
 * @property {(wav: Uint8Array) => Promise<SttResult>} transcribe
 * @property {(committed: string, pending: string) => void} onUpdate texto confirmado e o provisório
 * @property {(level: number) => void} [onLevel] nível 0..1 por quadro, para o medidor
 * @property {(err: Error) => void} [onError]
 * @property {number} [sampleRate] taxa do PCM recebido (padrão 16000)
 * @property {number} [silenceMs] pausa que fecha um trecho
 * @property {number} [maxSegmentMs] trecho mais longo antes de fechar mesmo sem pausa
 * @property {number} [interimEveryMs] áudio novo mínimo entre transcrições parciais
 */

/**
 * Trecho a trecho, para providers sem streaming: separa a fala pelas pausas e manda cada trecho
 * ao endpoint em lote; enquanto o trecho cresce, uma transcrição parcial por vez.
 */
export class LiveTranscriber {
  /** @param {LiveOptions} opts */
  constructor(opts) {
    this.opts = opts;
    this.rate = opts.sampleRate ?? SAMPLE_RATE;
    this.len = frameLen(this.rate);
    this.silenceFrames = Math.round((opts.silenceMs ?? 700) / 20);
    this.maxFrames = Math.round((opts.maxSegmentMs ?? 12000) / 20);
    this.interimFrames = Math.round((opts.interimEveryMs ?? 800) / 20);
    this.rest = new Int16Array(0);
    this.vad = new VoiceDetector(this.rate);
    /** @type {Seg} */
    this.seg = newSeg();
    /** @type {{ interim: string, final?: string, done: Promise<void> }[]} */
    this.closed = [];
    this.inFlight = false;
    this.cancelled = false;
  }

  /** @param {Int16Array} chunk */
  push(chunk) {
    if (this.cancelled) return;
    this.rest = frames(this.rest, chunk, this.len, (f) => this.frame(f));
  }

  /**
   * Nada é descartado antes da fala: o trecho acumula todo o áudio desde o último corte, e a
   * detecção de voz só decide onde cortar e se o trecho tem fala que valha enviar.
   * @param {Int16Array} f
   */
  frame(f) {
    const { level, voiced } = this.vad.frame(f);
    this.opts.onLevel?.(level);

    const seg = this.seg;
    seg.frames.push(f);
    if (voiced) {
      seg.voiced++;
      seg.quiet = 0;
    } else seg.quiet++;

    if (seg.voiced < MIN_VOICED) {
      // Sem fala ainda: guarda só o último 1 s (cobre o início da primeira sílaba).
      if (seg.frames.length > 50) seg.frames.splice(0, seg.frames.length - 50);
      if (seg.quiet >= this.silenceFrames) seg.voiced = 0;
      return;
    }
    if (seg.quiet >= this.silenceFrames || seg.frames.length >= this.maxFrames) this.close();
    else if (seg.frames.length - seg.interimAt >= this.interimFrames) this.interim(seg);
  }

  /** @param {Seg} seg */
  interim(seg) {
    if (this.inFlight) return;
    this.inFlight = true;
    seg.interimAt = seg.frames.length;
    this.call(seg.frames)
      .then((r) => {
        if (!seg.closed && r.text) {
          seg.interim = r.text;
          this.emit();
        }
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  close() {
    const seg = this.seg;
    this.seg = newSeg();
    seg.closed = true;
    if (this.rest.length) {
      seg.frames.push(this.rest);
      this.rest = new Int16Array(0);
    }
    if (seg.voiced < MIN_VOICED) return; // sem voz: ruído, teclado, respiração
    /** @type {{ interim: string, final?: string, done: Promise<void> }} */
    const entry = { interim: seg.interim, done: Promise.resolve() };
    entry.done = this.call(seg.frames).then((r) => {
      entry.final = r.noSpeech ? "" : r.text;
      this.emit();
    });
    this.closed.push(entry);
  }

  /** @param {Int16Array[]} frames */
  async call(frames) {
    const pcm = new Int16Array(frames.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of frames) {
      pcm.set(f, o);
      o += f.length;
    }
    try {
      return await this.opts.transcribe(encodeWav(pcm, this.rate));
    } catch (err) {
      this.opts.onError?.(/** @type {Error} */ (err));
      return { text: "", noSpeech: true };
    }
  }

  /** Texto confirmado (trechos finais em ordem) e provisório (o que ainda falta confirmar). */
  text() {
    const committed = [];
    let i = 0;
    for (; i < this.closed.length && this.closed[i].final !== undefined; i++)
      committed.push(this.closed[i].final ?? "");
    const pending = this.closed.slice(i).map((c) => c.final ?? c.interim);
    pending.push(this.seg.interim);
    return { committed: join(committed), pending: join(pending) };
  }

  emit() {
    if (this.cancelled) return;
    const { committed, pending } = this.text();
    this.opts.onUpdate(committed, pending);
  }

  /** Fecha o trecho em andamento e espera todas as finais. Devolve o texto completo. */
  async stop() {
    this.close();
    await Promise.all(this.closed.map((c) => c.done));
    return this.text().committed;
  }

  cancel() {
    this.cancelled = true;
    this.seg = newSeg();
  }
}
