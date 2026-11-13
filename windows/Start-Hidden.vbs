Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\LocalSoundboard.exe"
shell.CurrentDirectory = dir
shell.Run """" & exe & """", 7, False
