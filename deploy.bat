@echo off
title OptiNote - Build & Deploy
set JAVA_HOME=C:\Users\peace\.bubblewrap\jdk\jdk-17.0.11+9
set ANDROID_HOME=C:\Users\peace\.bubblewrap\androidSdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\build-tools\34.0.0;%PATH%

echo.
echo  ===================================
echo    OptiNote - Build ^& Deploy
echo  ===================================
echo.

:: 1. Push sur GitHub Pages
echo [1/3] Push GitHub Pages...
cd /d c:\Fichiers\Note
git add -A
git commit -m "Update OptiNote" 2>nul
git push origin master 2>nul
echo      OK

:: 2. Compiler APK
echo [2/3] Compilation APK...
cd /d c:\Fichiers\Note\apk-build
call gradlew.bat assembleRelease -q

:: 3. Signer APK
echo [3/3] Signature APK...
zipalign -f -p 4 "app\build\outputs\apk\release\app-release-unsigned.apk" "app-aligned.apk" >nul 2>&1
apksigner sign --ks "android.keystore" --ks-pass "pass:optinote123" --key-pass "pass:optinote123" --ks-key-alias optinote --out "c:\Fichiers\Note\OptiNote.apk" "app-aligned.apk" >nul 2>&1
del "app-aligned.apk" >nul 2>&1

echo.
echo  ===================================
if exist "c:\Fichiers\Note\OptiNote.apk" (
    echo    TERMINE !
    echo    APK : c:\Fichiers\Note\OptiNote.apk
    echo    Web : https://jarod256.github.io/audit-terrain/
) else (
    echo    ERREUR lors du build
)
echo  ===================================
echo.
pause
