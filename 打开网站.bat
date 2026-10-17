@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PORT=8123"

rem 找一个可用的 Python
where python >nul 2>nul
if errorlevel 1 (set "PY=py") else (set "PY=python")

rem 取本机局域网 IP，方便手机访问
set "LAN="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set "LAN=%%a"
set "LAN=%LAN: =%"

echo.
echo   ★ 生日礼物 · 本地网站已启动
echo.
echo   电脑上打开：http://127.0.0.1:%PORT%/
if defined LAN echo   手机上打开（连同一个 WiFi）：http://%LAN%:%PORT%/
echo.
echo   第一次打开会加载几秒，然后点 CLICK TO START，
echo   输入我们在一起的那一天就能进去了 ^^_^
echo.
echo   关闭这个窗口就会停止服务。
echo.

start "生日礼物 · 本地服务器" cmd /c "%PY% -m http.server %PORT%"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"
