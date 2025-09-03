; Custom NSIS script for proper desktop shortcut icon handling

!macro customInstall
  ; Create desktop shortcut manually with explicit icon
  ${ifNot} ${isUpdated}
    ; Delete any existing desktop shortcut
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\Ajeen POS.lnk"
    
    ; Create desktop shortcut with explicit icon from build resources
    File /oname=$TEMP\app_icon.ico "${BUILD_RESOURCES_DIR}\icon.ico"
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}" "" "$TEMP\app_icon.ico" 0
    
    ; Also handle start menu shortcut
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\Ajeen POS.lnk"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}" "" "$TEMP\app_icon.ico" 0
  ${endIf}
!macroend