@echo off
setlocal
pushd "%~dp0"
set "plugin_arch=amd64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "plugin_arch=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "plugin_arch=arm64"
if not exist "artifacts\plugin-installer\windows-%plugin_arch%\centerify-plugins.exe" goto missing
"artifacts\plugin-installer\windows-%plugin_arch%\centerify-plugins.exe" --root "%~dp0." %*
set "plugin_exit=%errorlevel%"
popd
exit /b %plugin_exit%
:missing
echo Build or download the native Centerify plugin installer first. See docs/plugins.md.
popd
exit /b 1
