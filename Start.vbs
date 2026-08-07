' ShadowAssist — Silent Launcher
Dim fso, WshShell, scriptDir, batPath

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\scripts\silent-start.bat"

Set WshShell = CreateObject("WScript.Shell")

' Launch silent-start.bat with WindowStyle 0 (completely hidden, fire and forget)
WshShell.Run "cmd.exe /c " & Chr(34) & batPath & Chr(34), 0, False

Set WshShell = Nothing
Set fso = Nothing
