' ShadowAssist — Silent Launcher
On Error Resume Next

Dim fso, WshShell, scriptDir, userProfile, appData, programFiles, programFilesX86, fullPath

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")

' Build robust PATH environment variable to ensure node and npm are found
userProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
appData = WshShell.ExpandEnvironmentStrings("%APPDATA%")
programFiles = WshShell.ExpandEnvironmentStrings("%ProgramFiles%")
programFilesX86 = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")

fullPath = WshShell.Environment("PROCESS")("PATH")
fullPath = appData & "\npm;" & programFiles & "\nodejs\;" & programFilesX86 & "\nodejs\;" & userProfile & "\AppData\Local\Programs\node\;" & fullPath
WshShell.Environment("PROCESS")("PATH") = fullPath

' Set working directory to project root
WshShell.CurrentDirectory = scriptDir

' Kill any stale/orphaned electron instances to prevent single-instance lock deadlock
WshShell.Run "cmd.exe /c taskkill /F /IM electron.exe /T 2>nul", 0, True

' Small delay to allow process cleanup
WScript.Sleep 500

' Launch app in background (0 = hidden, False = fire and forget)
WshShell.Run "cmd.exe /c npm start", 0, False

Set WshShell = Nothing
Set fso = Nothing
