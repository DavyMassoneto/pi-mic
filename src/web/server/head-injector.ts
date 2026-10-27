const HEAD_END = Buffer.from("</head>");

export class HeadInjector {
  readonly #tag: Buffer;
  #pending: Buffer = Buffer.alloc(0);
  #injected = false;

  constructor(tag: Buffer) {
    this.#tag = tag;
  }

  write(chunk: Buffer): Buffer {
    if (this.#injected) return chunk;
    this.#pending = Buffer.concat([this.#pending, chunk]);
    const index = this.#pending.indexOf(HEAD_END);
    if (index < 0) return Buffer.alloc(0);
    const out = Buffer.concat([
      this.#pending.subarray(0, index),
      this.#tag,
      this.#pending.subarray(index),
    ]);
    this.#pending = Buffer.alloc(0);
    this.#injected = true;
    return out;
  }

  end(): Buffer {
    const rest = this.#pending;
    this.#pending = Buffer.alloc(0);
    return rest;
  }
}
