# Chrome 调试模式启动脚本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "启动 Chrome 调试模式" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$port = 9222
Write-Host "正在启动 Chrome，调试端口: $port" -ForegroundColor Yellow
Write-Host ""

Write-Host "注意：" -ForegroundColor Yellow
Write-Host "1. 请确保 Chrome 已安装"
Write-Host "2. 启动后请勿关闭此窗口"
Write-Host "3. 在测试系统中输入 CDP Endpoint: http://localhost:$port"
Write-Host ""

# 常见 Chrome 路径
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES}\Google\Chrome\Application\chrome.exe",
    "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

if (-not $chromePath) {
    Write-Host "错误: 未找到 Chrome" -ForegroundColor Red
    Write-Host "请手动运行以下命令：" -ForegroundColor Yellow
    Write-Host "chrome.exe --remote-debugging-port=$port"
    Read-Host "按任意键退出"
    exit 1
}

Write-Host "使用 Chrome 路径: $chromePath" -ForegroundColor Green
Write-Host ""

$tempProfile = Join-Path $env:TEMP "chrome-debug-profile"
$arguments = @(
    "--remote-debugging-port=$port",
    "--user-data-dir=`"$tempProfile`""
)

try {
    $process = Start-Process -FilePath $chromePath -ArgumentList $arguments -PassThru
    Write-Host "Chrome 已启动 (PID: $($process.Id))" -ForegroundColor Green
    Write-Host "调试端口: http://localhost:$port" -ForegroundColor Green
    Write-Host ""
    Write-Host "按任意键停止 Chrome..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
        Write-Host "Chrome 已关闭" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "启动失败: $_" -ForegroundColor Red
    Read-Host "按任意键退出"
}
