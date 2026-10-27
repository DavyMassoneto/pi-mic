import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { pcmReader } from "./pcm-reader.ts";
import type { Capture, PcmListener } from "./types.ts";

const NATIVE_RATE = 48000;

function commandExists(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).error === undefined;
}

function spawnRecorder(): ChildProcess {
  if (commandExists("rec")) {
    return spawn("rec", [
      "-q",
      "-t",
      "raw",
      "-r",
      String(NATIVE_RATE),
      "-b",
      "16",
      "-c",
      "1",
      "-e",
      "signed-integer",
      "-",
    ]);
  }
  if (process.platform === "linux" && commandExists("arecord")) {
    return spawn("arecord", [
      "-q",
      "-t",
      "raw",
      "-f",
      "S16_LE",
      "-r",
      String(NATIVE_RATE),
      "-c",
      "1",
    ]);
  }
  throw new Error("no recorder found: install SoX (`rec`) or, on Linux, alsa-utils (`arecord`)");
}

export function startUnixCapture(onChunk: PcmListener): Promise<Capture> {
  let child: ChildProcess;
  try {
    child = spawnRecorder();
  } catch (err) {
    return Promise.reject(err);
  }
  child.stdout?.on("data", pcmReader(onChunk));
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  return new Promise<Capture>((resolve, reject) => {
    child.on("error", reject);
    child.on("spawn", () =>
      resolve({
        rate: NATIVE_RATE,
        async stop() {
          child.kill("SIGINT");
          await exited;
        },
        cancel() {
          child.kill();
        },
      }),
    );
  });
}
