' Lanza el respaldo diario sin abrir ninguna ventana (ni siquiera un instante).
' La tarea programada «zamorApp respaldo» ejecuta este archivo con wscript.exe.
Set fso = CreateObject("Scripting.FileSystemObject")
script = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "respaldo.ps1")
' Espera a que termine y devuelve su código, para que la tarea programada registre si falló
codigo = CreateObject("WScript.Shell").Run("powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & script & """", 0, True)
WScript.Quit codigo
