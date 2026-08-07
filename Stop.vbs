' ShadowAssist — Silent Stopper
On Error Resume Next

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' Kill electron processes associated with the app silently (WindowStyle 0 = hidden, True = wait for exit)
WshShell.Run "cmd.exe /c taskkill /F /IM electron.exe /T 2>nul", 0, True

Set WshShell = Nothing
