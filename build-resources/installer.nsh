; Novase Browser — Custom NSIS Installer Configuration
; This file customizes the Windows installer experience

!macro customInit
  ; Set installer window title
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Novase Browser"
  !define MUI_WELCOMEPAGE_TEXT "Novase is a modern browser with built-in games, media downloading, and multi-engine search.$\r$\n$\r$\nBrowse. Play. Download.$\r$\n$\r$\nClick Next to continue."
!macroend

!macro customInstallMode
  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "Novase Browser"
!macroend
