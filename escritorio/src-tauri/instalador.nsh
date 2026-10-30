; Ganchos del instalador NSIS de zamorApp Escritorio.
; Las actualizaciones automáticas usan un instalador liviano sin PostgreSQL, PostgREST ni Node: esas piezas
; quedan de la instalación completa (en modo /UPDATE el instalador no desinstala nada antes). Por eso, después
; de una actualización liviana, el desinstalador ya no las tiene en su lista: al desinstalar de verdad (no al
; actualizar) se borran aquí. Los datos viven en %LOCALAPPDATA%\zamorApp y nunca se tocan.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$INSTDIR\recursos\pgsql"
    RMDir /r "$INSTDIR\recursos\postgrest"
    RMDir /r "$INSTDIR\recursos\node"
    RMDir "$INSTDIR\recursos"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend

; Ícono nuevo (isologo de OcupaVida): Windows guarda en caché el ícono de los accesos directos y de la barra de
; tareas, y tras una actualización seguiría mostrando el viejo. Se le avisa que los íconos cambiaron. Solo refresca
; la caché de íconos de Windows; no toca accesos directos, el registro ni otros programas (tampoco el SAME).
!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${If} ${FileExists} "$SYSDIR\ie4uinit.exe"
    Push $0
    nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
    Pop $0 ; código de salida (no importa)
    Pop $0 ; $0 vuelve a su valor: la plantilla de Tauri sigue usándolo
  ${EndIf}
!macroend
