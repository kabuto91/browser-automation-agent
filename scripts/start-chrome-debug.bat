@echo off
echo ========================================
echo 启动 Chrome 调试模式
echo ========================================
echo.
echo 正在启动 Chrome，调试端口: 9222
echo.
echo 注意：
echo 1. 请确保 Chrome 已安装
echo 2. 如果 Chrome 未在默认路径，请修改脚本中的路径
echo 3. 启动后请勿关闭此窗口
echo 4. 在测试系统中输入 CDP Endpoint: http://localhost:9222
echo.

REM Windows 默认 Chrome 路径
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

REM 如果默认路径不存在，尝试其他常见路径
if not exist %CHROME_PATH% (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist %CHROME_PATH% (
    echo 错误: 未找到 Chrome，请手动修改脚本中的 CHROME_PATH
    echo 或者手动运行以下命令：
    echo chrome.exe --remote-debugging-port=9222
    pause
    exit /b 1
)

echo 使用 Chrome 路径: %CHROME_PATH%
echo.

%CHROME_PATH% --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug-profile"

echo.
echo Chrome 已关闭
pause
