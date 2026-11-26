!macro NSIS_HOOK_POSTINSTALL
  ; Remove legacy <=v4.2 autostart registry value if present
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "KuroCatPet"
!macroend
