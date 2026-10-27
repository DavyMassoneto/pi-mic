import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Captura em andamento: entrega PCM mono int16 na taxa nativa (`rate`) até stop()/cancel(). */
export interface Capture {
  rate: number;
  stop(): Promise<void>;
  cancel(): void;
}

/** Taxa pedida ao gravador fora do Windows (lá o waveIn escolhe e informa a sua). */
const NATIVE_RATE = 48000;

// waveIn (winmm): presente em todo Windows, sem dependência externa. O PCM sai cru no stdout;
// "READY"/"ERR" vão no stderr. Uma linha no stdin encerra.
const WAVEIN_CS = `
using System; using System.Runtime.InteropServices; using System.Threading;
public static class PiMicCapture {
  [StructLayout(LayoutKind.Sequential)] struct WAVEFORMATEX { public ushort wFormatTag, nChannels; public uint nSamplesPerSec, nAvgBytesPerSec; public ushort nBlockAlign, wBitsPerSample, cbSize; }
  [StructLayout(LayoutKind.Sequential)] struct WAVEHDR { public IntPtr lpData; public uint dwBufferLength, dwBytesRecorded; public IntPtr dwUser; public uint dwFlags, dwLoops; public IntPtr lpNext, reserved; }
  [DllImport("winmm.dll")] static extern int waveInOpen(out IntPtr h, int dev, ref WAVEFORMATEX f, IntPtr cb, IntPtr inst, int flags);
  [DllImport("winmm.dll")] static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInUnprepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInStart(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInReset(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInClose(IntPtr h);
  public static int Run(int device) {
    var ev = new AutoResetEvent(false);
    IntPtr h = IntPtr.Zero;
    int r = -1; uint rate = 0;
    // Taxa nativa primeiro; só desce se o dispositivo recusar.
    foreach (uint candidate in new uint[] { 48000, 44100, 16000 }) {
      var fmt = new WAVEFORMATEX { wFormatTag = 1, nChannels = 1, nSamplesPerSec = candidate, nAvgBytesPerSec = candidate * 2, nBlockAlign = 2, wBitsPerSample = 16 };
      r = waveInOpen(out h, device, ref fmt, ev.SafeWaitHandle.DangerousGetHandle(), IntPtr.Zero, 0x50000);
      if (r == 0) { rate = candidate; break; }
    }
    if (r != 0) { Console.Error.WriteLine("ERR waveInOpen " + r); return 1; }
    Console.Error.WriteLine("RATE " + rate);
    int N = 4, BYTES = (int)(rate / 10) * 2;
    int hs = Marshal.SizeOf(typeof(WAVEHDR));
    var hdrs = new IntPtr[N];
    for (int i = 0; i < N; i++) {
      var hd = new WAVEHDR { lpData = Marshal.AllocHGlobal(BYTES), dwBufferLength = (uint)BYTES };
      hdrs[i] = Marshal.AllocHGlobal(hs);
      Marshal.StructureToPtr(hd, hdrs[i], false);
      waveInPrepareHeader(h, hdrs[i], hs);
      waveInAddBuffer(h, hdrs[i], hs);
    }
    bool stop = false;
    var reader = new Thread(() => { Console.In.ReadLine(); stop = true; ev.Set(); });
    reader.IsBackground = true; reader.Start();
    var stdout = Console.OpenStandardOutput();
    waveInStart(h);
    Console.Error.WriteLine("READY");
    int next = 0;
    while (true) {
      ev.WaitOne(200);
      if (stop) waveInReset(h);
      while (true) {
        var hd = (WAVEHDR)Marshal.PtrToStructure(hdrs[next], typeof(WAVEHDR));
        if ((hd.dwFlags & 1) == 0) break;
        if (hd.dwBytesRecorded > 0) {
          var buf = new byte[hd.dwBytesRecorded];
          Marshal.Copy(hd.lpData, buf, 0, buf.Length);
          stdout.Write(buf, 0, buf.Length);
          stdout.Flush();
        }
        if (stop) { hd.dwFlags &= ~1u; hd.dwBytesRecorded = 0; Marshal.StructureToPtr(hd, hdrs[next], false); }
        else waveInAddBuffer(h, hdrs[next], hs);
        next = (next + 1) % N;
      }
      if (stop) break;
    }
    for (int i = 0; i < N; i++) waveInUnprepareHeader(h, hdrs[i], hs);
    waveInClose(h);
    return 0;
  }
}`;

// O C# compilado fica em cache no temp; compilar a cada gravação custaria ~1 s.
const CAPTURE_PS = (dll: string) => `
$ErrorActionPreference = 'Stop'
$dll = '${dll}'
if (Test-Path $dll) { Add-Type -Path $dll } else { Add-Type -TypeDefinition $env:PI_MIC_CS -OutputAssembly $dll; Add-Type -Path $dll }
$dev = if ($env:PI_MIC_DEVICE) { [int]$env:PI_MIC_DEVICE } else { -1 }
exit [PiMicCapture]::Run($dev)
`;

const DEVICES_PS = `Add-Type -Namespace PiMic -Name Winmm -MemberDefinition @'
[DllImport("winmm.dll")] public static extern int waveInGetNumDevs();
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct WAVEINCAPS { public short wMid; public short wPid; public int vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szPname; public int dwFormats; public short wChannels; public short wReserved1; }
[DllImport("winmm.dll", CharSet=CharSet.Unicode)] public static extern int waveInGetDevCaps(System.IntPtr id, ref WAVEINCAPS caps, int size);
'@
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

/** Nomes dos dispositivos de entrada, na ordem dos ids do waveIn (só Windows). */
export async function listInputDevices(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const child = powershell(DEVICES_PS);
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

/** Converte bytes PCM s16le em Int16Array, guardando o byte ímpar para o próximo pedaço. */
function pcmReader(onChunk: (pcm: Int16Array) => void) {
  let rest: Buffer = Buffer.alloc(0);
  return (data: Buffer) => {
    const buf = rest.length ? Buffer.concat([rest, data]) : data;
    const even = buf.length - (buf.length % 2);
    rest = buf.subarray(even);
    if (even === 0) return;
    const copy = new Uint8Array(buf.subarray(0, even));
    onChunk(new Int16Array(copy.buffer));
  };
}

function startWindows(deviceIndex: number | undefined, onChunk: (pcm: Int16Array) => void) {
  const hash = createHash("sha1").update(WAVEIN_CS).digest("hex").slice(0, 10);
  const dll = join(realpathSync.native(tmpdir()), `pi-mic-capture-${hash}.dll`);
  const child = powershell(CAPTURE_PS(dll), {
    PI_MIC_CS: existsSync(dll) ? "" : WAVEIN_CS,
    PI_MIC_DEVICE: deviceIndex === undefined ? "" : String(deviceIndex),
  });
  child.stdout?.on("data", pcmReader(onChunk));
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  return new Promise<Capture>((resolve, reject) => {
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.includes("READY"))
        resolve({
          rate: Number(err.match(/RATE (\d+)/)?.[1] ?? 16000),
          async stop() {
            child.stdin?.write("\n");
            await exited;
          },
          cancel() {
            child.kill();
          },
        });
    });
    child.on("error", reject);
    exited.then(() => reject(new Error(err.trim().split("\n").pop() || "recorder exited")));
  });
}

function which(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).error === undefined;
}

function startUnix(onChunk: (pcm: Int16Array) => void) {
  let child: ChildProcess;
  if (which("rec"))
    child = spawn("rec", [
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
  else if (process.platform === "linux" && which("arecord"))
    child = spawn("arecord", [
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
  else
    return Promise.reject(
      new Error("no recorder found: install SoX (`rec`) or, on Linux, alsa-utils (`arecord`)"),
    );
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

/** Lê um WAV PCM mono no ritmo real, como se fosse o microfone (PI_MIC_FAKE_INPUT, para testes). */
function startFake(path: string, onChunk: (pcm: Int16Array) => void): Promise<Capture> {
  const file = readFileSync(path);
  const rate = file.readUInt32LE(24);
  const data = file.subarray(44);
  const step = (rate / 10) * 2;
  const read = pcmReader(onChunk);
  let off = 0;
  const timer = setInterval(() => {
    if (off >= data.length) off = 0;
    read(data.subarray(off, off + step));
    off += step;
  }, 100);
  return Promise.resolve({
    rate,
    async stop() {
      clearInterval(timer);
    },
    cancel() {
      clearInterval(timer);
    },
  });
}

/** Começa a capturar (índice do waveIn no Windows; ignorado fora dele). */
export function startCapture(
  deviceIndex: number | undefined,
  onChunk: (pcm: Int16Array) => void,
): Promise<Capture> {
  const fake = process.env.PI_MIC_FAKE_INPUT;
  if (fake) return startFake(fake, onChunk);
  return process.platform === "win32" ? startWindows(deviceIndex, onChunk) : startUnix(onChunk);
}
