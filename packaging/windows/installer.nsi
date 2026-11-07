Unicode true
RequestExecutionLevel user
ManifestDPIAware true
!include "MUI2.nsh"
!include "x64.nsh"

Name "SCrip"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\SCrip"
BrandingText "SCrip"
SetCompressor /SOLID lzma
Icon "app.ico"
VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=1049 "ProductName" "SCrip"
VIAddVersionKey /LANG=1049 "FileDescription" "Установка SCrip"
VIAddVersionKey /LANG=1049 "FileVersion" "1.0.0"
VIAddVersionKey /LANG=1049 "LegalCopyright" "SCrip"
!define MUI_ICON "app.ico"
!define MUI_UNICON "app.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_WELCOMEPAGE_TITLE "Установить SCrip"
!define MUI_WELCOMEPAGE_TEXT "Ваша музыка из SoundCloud на компьютере.$\r$\n$\r$\nПриложение установится для текущего пользователя. Ярлыки появятся в меню «Пуск» и на рабочем столе."
!define MUI_WELCOMEPAGE_BUTTON "Установить"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "SCrip установлен"
!define MUI_FINISHPAGE_TEXT "Откройте приложение и войдите в свой аккаунт SoundCloud."
!define MUI_FINISHPAGE_RUN "$INSTDIR\SCrip.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Открыть SCrip"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Для SCrip требуется 64-разрядная Windows."
    Abort
  ${EndIf}
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\SCrip"
FunctionEnd

!macro CheckClosed
  IfFileExists "$INSTDIR\SCrip.exe" 0 done
  retry:
  ClearErrors
  FileOpen $0 "$INSTDIR\SCrip.exe" a
  IfErrors locked
  FileClose $0
  Goto done
  locked:
  IfSilent cancel
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Закройте SCrip, затем нажмите «Повторить»." IDRETRY retry
  cancel:
  SetErrorLevel 2
  Abort
  done:
!macroend

!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SCrip"
Section
  !insertmacro CheckClosed
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\SCrip.lnk" "$INSTDIR\SCrip.exe"
  CreateShortcut "$DESKTOP\SCrip.lnk" "$INSTDIR\SCrip.exe"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "SCrip"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "1.0.0"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\SCrip.exe"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  !insertmacro CheckClosed
  !include "${FILELIST}"
  Delete "$DESKTOP\SCrip.lnk"
  Delete "$SMPROGRAMS\SCrip.lnk"
  DeleteRegKey HKCU "${UNKEY}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
