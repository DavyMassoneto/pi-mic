// Núcleo da transcrição ao vivo, o mesmo no navegador (pi-web) e no Node (CLI).
// Recebe PCM 16 kHz mono int16, separa a fala em trechos pelas pausas e manda cada trecho ao
// endpoint de transcrição em lote: enquanto o trecho cresce, uma transcrição parcial por vez;
// na pausa, a final. Funciona com qualquer endpoint /audio/transcriptions.

export const SAMPLE_RATE = 16000;
const FRAME = 320; // 20 ms

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
 * Float32 [-1, 1] numa taxa qualquer → Int16 a 16 kHz (média por janela; suficiente para voz).
 * @param {Float32Array} input
 * @param {number} rate
 * @returns {Int16Array}
 */
export function toPcm16k(input, rate) {
  const ratio = rate / SAMPLE_RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / (b - a)));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
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
 * @property {number} [silenceMs] pausa que fecha um trecho
 * @property {number} [maxSegmentMs] trecho mais longo antes de fechar mesmo sem pausa
 * @property {number} [interimEveryMs] áudio novo mínimo entre transcrições parciais
 */

export class LiveTranscriber {
  /** @param {LiveOptions} opts */
  constructor(opts) {
    this.opts = opts;
    this.silenceFrames = Math.round((opts.silenceMs ?? 700) / 20);
    this.maxFrames = Math.round((opts.maxSegmentMs ?? 12000) / 20);
    this.interimFrames = Math.round((opts.interimEveryMs ?? 800) / 20);
    this.rest = new Int16Array(0);
    this.preroll = /** @type {Int16Array[]} */ ([]);
    this.floor = 0;
    this.calibrated = 0;
    this.loud = 0;
    /** @type {{ frames: Int16Array[], speech: number, quiet: number, interimAt: number, interim: string, closed?: boolean } | null} */
    this.seg = null;
    /** @type {{ interim: string, final?: string, done: Promise<void> }[]} */
    this.closed = [];
    this.inFlight = false;
    this.cancelled = false;
  }

  /** @param {Int16Array} chunk */
  push(chunk) {
    if (this.cancelled) return;
    const all = new Int16Array(this.rest.length + chunk.length);
    all.set(this.rest);
    all.set(chunk, this.rest.length);
    let off = 0;
    for (; off + FRAME <= all.length; off += FRAME)
      this.frame(all.subarray(off, off + FRAME).slice());
    this.rest = all.slice(off);
  }

  /** @param {Int16Array} f */
  frame(f) {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    this.opts.onLevel?.(Math.min(1, rms / 6000));

    // Ruído de fundo: média dos primeiros 300 ms, depois só dos quadros sem fala.
    if (this.calibrated < 15) {
      this.floor = (this.floor * this.calibrated + rms) / (this.calibrated + 1);
      this.calibrated++;
    }
    const threshold = Math.max(350, this.floor * 2.5);
    const speaking = rms > threshold;
    if (!speaking && !this.seg) this.floor = this.floor * 0.95 + rms * 0.05;

    if (!this.seg) {
      this.preroll.push(f);
      if (this.preroll.length > 15) this.preroll.shift();
      this.loud = speaking ? this.loud + 1 : 0;
      if (this.loud >= 3) {
        this.seg = { frames: this.preroll, speech: 3, quiet: 0, interimAt: 0, interim: "" };
        this.preroll = [];
      }
      return;
    }

    const seg = this.seg;
    seg.frames.push(f);
    if (speaking) {
      seg.speech++;
      seg.quiet = 0;
    } else seg.quiet++;
    if (seg.quiet >= this.silenceFrames || seg.frames.length >= this.maxFrames) this.close();
    else if (seg.speech >= 8 && seg.frames.length - seg.interimAt >= this.interimFrames)
      this.interim(seg);
  }

  /** @param {NonNullable<LiveTranscriber["seg"]>} seg */
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
    this.seg = null;
    this.loud = 0;
    if (!seg) return;
    seg.closed = true;
    if (seg.speech < 8) return; // < 160 ms de fala: ruído
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
    const pcm = new Int16Array(frames.length * FRAME);
    for (let i = 0; i < frames.length; i++) pcm.set(frames[i], i * FRAME);
    try {
      return await this.opts.transcribe(encodeWav(pcm));
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
    if (this.seg) pending.push(this.seg.interim);
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
    this.seg = null;
  }
}
