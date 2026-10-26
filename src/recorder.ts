import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Recording {
  /** Para a gravação e devolve o WAV (16 kHz, mono, 16 bits). */
  stop(): Promise<Uint8Array>;
  /** Descarta a gravação. */
  cancel(): void;
}

// winmm/MCI: presente em todo Windows, sem dependência externa.
const MCI_TYPES = `Add-Type -Namespace PiMic -Name Winmm -MemberDefinition @'
[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern int mciSendString(string c, System.Text.StringBuilder r, int l, System.IntPtr cb);
[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern bool mciGetErrorString(int e, System.Text.StringBuilder b, int l);
[DllImport("winmm.dll")] public static extern int waveInGetNumDevs();
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct WAVEINCAPS { public short wMid; public short wPid; public int vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szPname; public int dwFormats; public short wChannels; public short wReserved1; }
[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern int waveInGetDevCaps(System.IntPtr id, ref WAVEINCAPS caps, int size);
'@
`;

const WIN_RECORD = `${MCI_TYPES}
function M([string]$c) {
  $sb = New-Object System.Text.StringBuilder 256
  $e = [PiMic.Winmm]::mciSendString($c, $sb, 256, [IntPtr]::Zero)
  if ($e -ne 0) {
    $m = New-Object System.Text.StringBuilder 256
    [void][PiMic.Winmm]::mciGetErrorString($e, $m, 256)
    [Console]::Out.WriteLine("ERR $e $m"); [Console]::Out.Flush(); exit 1
  }
}
M 'open new type waveaudio alias pimic'
$set = 'set pimic bitspersample 16 channels 1 samplespersec 16000 bytespersec 32000 alignment 2'
if ($env:PI_MIC_DEVICE) { $set += " input $env:PI_MIC_DEVICE" }
M $set
M 'record pimic'
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
[void][Console]::In.ReadLine()
M 'stop pimic'
M ("save pimic " + $env:PI_MIC_OUT)
M 'close pimic'
[Console]::Out.WriteLine('SAVED'); [Console]::Out.Flush()
`;

const WIN_DEVICES = `${MCI_TYPES}
$n = [PiMic.Winmm]::waveInGetNumDevs()
$names = @()
for ($d = 0; $d -lt $n; $d++) {
  $c = New-Object PiMic.Winmm+WAVEINCAPS
  [void][PiMic.Winmm]::waveInGetDevCaps([IntPtr]$d, [ref]$c, [Runtime.InteropServices.Marshal]::SizeOf($c))
  $names += $c.szPname
}
[Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @($names)))
`;

function powershell(script: string, env: NodeJS.ProcessEnv = {}): ChildProcess {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
}

function tempWav(): string {
  // MCI não aceita caminho curto (~1) entre aspas; usa o caminho longo.
  const dir = realpathSync.native(tmpdir());
  return join(dir, `pi-mic-${process.pid}-${Date.now()}.wav`);
}

function readAndRemove(path: string): Uint8Array {
  const data = readFileSync(path);
  rmSync(path, { force: true });
  return data;
}

/** Nomes dos dispositivos de entrada, na ordem dos ids do waveIn (só Windows). */
export async function listInputDevices(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const child = powershell(WIN_DEVICES);
  let out = "";
  child.stdout?.on("data", (d: Buffer) => {
    out += d.toString();
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", () => resolve());
  });
  const parsed = JSON.parse(out.trim() || "[]") as string[] | string;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function startWindows(deviceIndex: number | undefined): Promise<Recording> {
  const out = tempWav();
  const quoted = out.includes(" ") ? `"${out}"` : out;
  const child = powershell(WIN_RECORD, {
    PI_MIC_OUT: quoted,
    PI_MIC_DEVICE: deviceIndex === undefined ? "" : String(deviceIndex),
  });
  let buf = "";
  const lines: ((line: string) => void)[] = [];
  child.stdout?.on("data", (d: Buffer) => {
    buf += d.toString();
    let i = buf.indexOf("\n");
    while (i >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      for (const l of lines) l(line);
      i = buf.indexOf("\n");
    }
  });
  const exited = new Promise<number>((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
  const waitFor = (word: string) =>
    new Promise<void>((resolve, reject) => {
      lines.push((line) => {
        if (line === word) resolve();
        else if (line.startsWith("ERR")) reject(new Error(`MCI ${line.slice(4)}`));
      });
      exited.then((code) => reject(new Error(`recorder exited (${code}) before ${word}`)));
      child.on("error", reject);
    });

  return waitFor("READY").then(() => ({
    async stop() {
      const saved = waitFor("SAVED");
      child.stdin?.write("\n");
      await saved;
      return readAndRemove(out);
    },
    cancel() {
      child.kill();
      rmSync(out, { force: true });
    },
  }));
}

function which(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).error === undefined;
}

function startUnix(): Promise<Recording> {
  const out = tempWav();
  let child: ChildProcess;
  if (which("rec")) child = spawn("rec", ["-q", "-c", "1", "-r", "16000", "-b", "16", out]);
  else if (process.platform === "linux" && which("arecord"))
    child = spawn("arecord", ["-q", "-f", "S16_LE", "-r", "16000", "-c", "1", out]);
  else
    return Promise.reject(
      new Error("no recorder found: install SoX (`rec`) or, on Linux, alsa-utils (`arecord`)"),
    );
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    // Os gravadores não sinalizam início; considera iniciado no spawn.
    child.on("spawn", () =>
      resolve({
        async stop() {
          child.kill("SIGINT");
          await exited;
          return readAndRemove(out);
        },
        cancel() {
          child.kill();
          rmSync(out, { force: true });
        },
      }),
    );
  });
}

/** Começa a gravar no dispositivo indicado (índice do waveIn no Windows; ignorado fora dele). */
export function startRecording(deviceIndex?: number): Promise<Recording> {
  return process.platform === "win32" ? startWindows(deviceIndex) : startUnix();
}
