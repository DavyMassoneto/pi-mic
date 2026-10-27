import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pcmReader } from "./pcm-reader.ts";
import { powershell } from "./powershell.ts";
import type { Capture, PcmListener } from "./types.ts";
import { WAVEIN_CS } from "./wavein-source.ts";

const FALLBACK_RATE = 16000;

const captureScript = (dll: string) => `
$ErrorActionPreference = 'Stop'
$dll = '${dll}'
if (Test-Path $dll) { Add-Type -Path $dll } else { Add-Type -TypeDefinition $env:PI_MIC_CS -OutputAssembly $dll; Add-Type -Path $dll }
$dev = if ($env:PI_MIC_DEVICE) { [int]$env:PI_MIC_DEVICE } else { -1 }
exit [PiMicCapture]::Run($dev)
`;

function compiledDllPath(): string {
  const hash = createHash("sha1").update(WAVEIN_CS).digest("hex").slice(0, 10);
  return join(realpathSync.native(tmpdir()), `pi-mic-capture-${hash}.dll`);
}

export function startWindowsCapture(
  deviceIndex: number | undefined,
  onChunk: PcmListener,
): Promise<Capture> {
  const dll = compiledDllPath();
  const child = powershell(captureScript(dll), {
    PI_MIC_CS: existsSync(dll) ? "" : WAVEIN_CS,
    PI_MIC_DEVICE: deviceIndex === undefined ? "" : String(deviceIndex),
  });
  child.stdout?.on("data", pcmReader(onChunk));
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  return new Promise<Capture>((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.includes("READY")) {
        resolve({
          rate: Number(stderr.match(/RATE (\d+)/)?.[1] ?? FALLBACK_RATE),
          async stop() {
            child.stdin?.write("\n");
            await exited;
          },
          cancel() {
            child.kill();
          },
        });
      }
    });
    child.on("error", reject);
    exited.then(() => reject(new Error(stderr.trim().split("\n").pop() || "recorder exited")));
  });
}
