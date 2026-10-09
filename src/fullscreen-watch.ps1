param([int]$OwnerPid)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PaperDeskForeground {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor,Work; public uint Flags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w,out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr w,out Rect r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr w);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr w,int index);
  public static bool HasCaption(IntPtr w) { return (GetWindowLong(w,-16) & 0x00C00000) != 0; }
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr w,uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m,ref MonitorInfo info);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr w,StringBuilder name,int count);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr w,int attribute,out Rect rect,int size);
}
'@
try { [void][PaperDeskForeground]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { [void][PaperDeskForeground]::SetProcessDPIAware() }
while ($true) {
  $sample = @{ fullscreen=$false }
  $handle = [PaperDeskForeground]::GetForegroundWindow()
  [uint32]$foregroundPid = 0
  [void][PaperDeskForeground]::GetWindowThreadProcessId($handle,[ref]$foregroundPid)
  if ($handle -ne [IntPtr]::Zero -and $foregroundPid -ne $OwnerPid -and -not [PaperDeskForeground]::IsIconic($handle)) {
    $className = [System.Text.StringBuilder]::new(256)
    [void][PaperDeskForeground]::GetClassName($handle,$className,256)
    if ($className.ToString() -notin @('Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd')) {
      $rect = [PaperDeskForeground+Rect]::new()
      $info = [PaperDeskForeground+MonitorInfo]::new()
      $info.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
      $monitor = [PaperDeskForeground]::MonitorFromWindow($handle,2)
      if ([PaperDeskForeground]::GetWindowRect($handle,[ref]$rect) -and [PaperDeskForeground]::GetMonitorInfo($monitor,[ref]$info)) {
        $frame = [PaperDeskForeground+Rect]::new()
        if ([PaperDeskForeground]::DwmGetWindowAttribute($handle,9,[ref]$frame,16) -eq 0) { $rect = $frame }
        $m = $info.Monitor
        if (-not [PaperDeskForeground]::HasCaption($handle) -and [Math]::Abs($rect.Left-$m.Left) -le 2 -and [Math]::Abs($rect.Top-$m.Top) -le 2 -and [Math]::Abs($rect.Right-$m.Right) -le 2 -and [Math]::Abs($rect.Bottom-$m.Bottom) -le 2) {
          $sample = @{ fullscreen=$true; pid=$foregroundPid; handle=$handle.ToInt64().ToString(); x=$m.Left; y=$m.Top; width=$m.Right-$m.Left; height=$m.Bottom-$m.Top }
        }
      }
    }
  }
  [Console]::WriteLine(($sample | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 500
}
