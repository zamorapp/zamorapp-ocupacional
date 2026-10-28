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
