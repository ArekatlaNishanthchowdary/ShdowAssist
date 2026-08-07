<#
.SYNOPSIS
  Moves Electron windows from "Apps" to "Background processes" in Windows Task Manager.

.DESCRIPTION
  Windows Task Manager classifies a process as an "App" when any of its windows has the
  WS_EX_APPWINDOW extended style (0x00040000).  Electron's skipTaskbar only uses the
  ITaskbarList COM API — it does NOT strip WS_EX_APPWINDOW from the window style.

  This script:
    1. Adds    WS_EX_TOOLWINDOW (0x00000080) — marks window as a tool/utility pane
    2. Removes WS_EX_APPWINDOW  (0x00040000) — stops Windows from treating it as an App

  Pass a comma-separated list of decimal HWND values via the -HWNDs parameter.
  Example: powershell -File win-tool-window.ps1 -HWNDs "131234,131236"
#>
param([string]$HWNDs = "")

if ([string]::IsNullOrWhiteSpace($HWNDs)) { exit 0 }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinStyler {
    public const int GWL_EXSTYLE      = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_APPWINDOW  = 0x00040000;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    public static void Apply(long hwnd) {
        IntPtr h  = new IntPtr(hwnd);
        int style = GetWindowLong(h, GWL_EXSTYLE);
        int next  = (style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
        SetWindowLong(h, GWL_EXSTYLE, next);
    }
}
"@ -ErrorAction SilentlyContinue

foreach ($raw in ($HWNDs -split ',')) {
    $raw = $raw.Trim()
    if ([string]::IsNullOrEmpty($raw)) { continue }
    try {
        [WinStyler]::Apply([long]$raw)
    } catch {
        # ignore per-window failures; next window may still succeed
    }
}
