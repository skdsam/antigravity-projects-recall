@echo off
SETLOCAL EnableDelayedExpansion

SET "EXT_NAME=skdsam.project-tracker"
for /f "tokens=*" %%a in ('node -p "require('./package.json').version"') do set "EXT_VERSION=%%a"
SET "EXT_DIR=%EXT_NAME%-%EXT_VERSION%"
SET "TARGET_DIR=%USERPROFILE%\.antigravity\extensions\%EXT_DIR%"

echo ==============================================
echo   Antigravity Project Tracker Installer
echo ==============================================
echo.

:: Check if Node is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found. Node.js is required for installation.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Create target directory
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

:: Copy files
echo [1/3] Copying extension files...
copy /Y "extension.js" "%TARGET_DIR%\" >nul
copy /Y "package.json" "%TARGET_DIR%\" >nul
copy /Y "mcp-server.js" "%TARGET_DIR%\" >nul
copy /Y "README.md" "%TARGET_DIR%\" >nul
if exist "assets" (
    xcopy /E /I /Y "assets" "%TARGET_DIR%\assets" >nul
)

:: Copy node_modules if it exists
if exist "node_modules" (
    echo [2/3] copying node_modules...
    xcopy /E /I /Y "node_modules" "%TARGET_DIR%\node_modules" >nul
) else (
    echo [2/3] node_modules not found, skipping copy...
)

:: Update registration
echo [3/3] Updating extension registration...
node update_registration.js

echo.
echo ==============================================
echo   Installation Successful!
echo ==============================================
echo 1. Restart the Antigravity IDE.
echo 2. Look for the "Projects" icon in the Activity Bar (left side).
echo 3. Your recent projects will appear in the "Recent Projects" view.
echo ==============================================
echo.
pause
