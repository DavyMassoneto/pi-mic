import type { PcmListener } from "./types.ts";

export function pcmReader(onChunk: PcmListener): (data: Buffer) => void {
  let rest: Buffer = Buffer.alloc(0);
  return (data) => {
    const buf = rest.length ? Buffer.concat([rest, data]) : data;
    const even = buf.length - (buf.length % 2);
    rest = buf.subarray(even);
    if (even === 0) return;
    const copy = new Uint8Array(buf.subarray(0, even));
    onChunk(new Int16Array(copy.buffer));
  };
}
