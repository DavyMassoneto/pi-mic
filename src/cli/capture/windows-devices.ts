import { powershell } from "./powershell.ts";

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

export async function listInputDevices(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const child = powershell(DEVICES_PS);
  let out = "";
  child.stdout?.on("data", (data: Buffer) => {
    out += data.toString();
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", () => resolve());
  });
  const parsed = JSON.parse(out.trim() || "[]") as string[] | string;
  return Array.isArray(parsed) ? parsed : [parsed];
}
