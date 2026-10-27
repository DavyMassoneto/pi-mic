export const WAVEIN_CS = `
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
