@echo off
set JAVA_HOME=C:\Users\peace\.bubblewrap\jdk\jdk-17.0.11+9
set ANDROID_HOME=C:\Users\peace\.bubblewrap\androidSdk
set PATH=%JAVA_HOME%\bin;%PATH%

echo === BUBBLEWRAP BUILD - OptiNote ===

echo [1/2] Initialisation du projet...
(echo n
echo n
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo.
echo optinote123
echo optinote123
echo OptiNote
echo.
echo.
echo.
echo.
echo FR
echo yes
echo optinote123
echo optinote123
echo y
echo y
echo y
) | bubblewrap init --manifest=https://jarod256.github.io/audit-terrain/manifest.json

if %ERRORLEVEL% neq 0 (
    echo ERREUR lors de l'init
    pause
    exit /b 1
)

echo [2/2] Compilation APK...
(echo optinote123
echo optinote123
) | bubblewrap build --skipPwaValidation

if exist app-release-signed.apk (
    echo.
    echo ========================================
    echo    APK GENERE AVEC SUCCES !
    echo ========================================
    dir app-release-signed.apk
) else (
    echo ECHEC - pas d'APK genere
)
pause
