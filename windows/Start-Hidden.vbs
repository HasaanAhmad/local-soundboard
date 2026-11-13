Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\Start-Soundboard.bat"
shell.CurrentDirectory = dir
shell.Run """" & bat & """", 7, False
