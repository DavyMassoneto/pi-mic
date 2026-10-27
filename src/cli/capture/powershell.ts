import { type ChildProcess, spawn } from "node:child_process";

export function powershell(script: string, env: NodeJS.ProcessEnv = {}): ChildProcess {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}
