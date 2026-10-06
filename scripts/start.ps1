param([switch]$InstallOnly, [switch]$Debug)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$logsRoot = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null
function Get-WraHealth([int]$timeoutSeconds) {
    # Windows PowerShell 5 对无 charset 的 JSON 可能误解码中文路径，显式按 UTF-8 读取。
    $response = Invoke-WebRequest 'http://127.0.0.1:38991/health' -UseBasicParsing -TimeoutSec $timeoutSeconds
    return [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Json
}
$health = $null
try { $health = Get-WraHealth 2 } catch {}
if ($null -ne $health -and ($health.name -ne 'WpsReferenceAssistant' -or $health.root -ne $projectRoot)) {
    throw '端口 38991 已被其他程序或另一个项目占用，请先关闭该程序。'
}
if ($null -ne $health -and $health.version -ne $version) {
    $pidFile = Join-Path $logsRoot 'server.pid'
    if (-not (Test-Path -LiteralPath $pidFile)) { throw '旧版服务正在运行，未找到本项目的进程记录，请先关闭旧版服务。' }
    $oldServerPid = [int](Get-Content -LiteralPath $pidFile)
    $oldServer = Get-CimInstance Win32_Process -Filter "ProcessId = $oldServerPid" -ErrorAction SilentlyContinue
    $expectedServer = Join-Path $PSScriptRoot 'server.cjs'
    if ($null -eq $oldServer -or $oldServer.Name -ne 'node.exe' -or -not $oldServer.CommandLine -or -not $oldServer.CommandLine.Contains($expectedServer)) { throw '旧版服务进程无法确认，未结束任何程序。' }
    Stop-Process -Id $oldServerPid
    $health = $null
}
if ($null -eq $health) {
    $serverScript = Join-Path $PSScriptRoot 'server.cjs'
    $serverProcess = Start-Process -FilePath $nodeExe -ArgumentList @('"' + $serverScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logsRoot 'server.log') -RedirectStandardError (Join-Path $logsRoot 'server-error.log')
    Set-Content -LiteralPath (Join-Path $logsRoot 'server.pid') -Value $serverProcess.Id
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $health = Get-WraHealth 1; break } catch {}
    }
    if ($null -eq $health -or $health.name -ne 'WpsReferenceAssistant') { throw '加载项本地服务未能启动，请查看 logs/server-error.log。' }
}

# 与官方 wpsjs 2.2.3 debug_publish.js 的 publish 配置一致，保留其他加载项。
$addonsRoot = Join-Path $env:APPDATA 'kingsoft\wps\jsaddons'
$publishPath = Join-Path $addonsRoot 'publish.xml'
New-Item -ItemType Directory -Path $addonsRoot -Force | Out-Null
$config = New-Object System.Xml.XmlDocument
if (Test-Path -LiteralPath $publishPath) {
    $config.Load($publishPath)
    if ($config.DocumentElement.Name -ne 'jsplugins') { throw '现有 publish.xml 的结构异常，未覆盖。' }
    $backupPath = Join-Path $logsRoot ('publish-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.xml')
    Copy-Item -LiteralPath $publishPath -Destination $backupPath
} else { $config.LoadXml('<jsplugins/>') }
$plugin = $config.SelectSingleNode('/jsplugins/jspluginonline[@name="WpsReferenceAssistant"]')
if ($null -eq $plugin) { $plugin = $config.CreateElement('jspluginonline'); [void]$config.DocumentElement.AppendChild($plugin) }
$plugin.SetAttribute('name', 'WpsReferenceAssistant')
$plugin.SetAttribute('type', 'wps')
$plugin.SetAttribute('url', ('http://127.0.0.1:38991/v' + $version + '/'))
$plugin.SetAttribute('debug', '')
$plugin.SetAttribute('enable', 'enable_dev')
$plugin.SetAttribute('install', 'null')
$settings = New-Object System.Xml.XmlWriterSettings
$settings.Encoding = New-Object System.Text.UTF8Encoding($false)
$settings.Indent = $true
$writer = [Xml.XmlWriter]::Create($publishPath, $settings)
try { $config.Save($writer) } finally { $writer.Dispose() }
Write-Host '参考文献助手已配置，本地服务运行中。' -ForegroundColor Green
Write-Host '在 WPS 中选中文末文献列表，再点击【参考文献助手 → 生成文献批注】。'
if (-not $InstallOnly) {
    $wpsExe = Get-Process wps -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1 -ExpandProperty Path
    if (-not $wpsExe) {
        $command = (Get-ItemProperty -LiteralPath 'Registry::HKEY_CLASSES_ROOT\KWPS.Document.12\shell\open\command' -ErrorAction SilentlyContinue).'(default)'
        if ($command -match '^"([^"]+\.exe)"') { $wpsExe = $matches[1] }
    }
    if (-not $wpsExe) { throw '未找到 WPS 程序，请手动打开 WPS。加载项配置已保存。' }
    $launchArguments = @()
    if ($Debug) { $launchArguments += '/JsApiremotedebuggingPort=38992'; $launchArguments += ('/JsApiUserDataDir="' + (Join-Path $logsRoot 'wps-debug-profile') + '"') }
    if ($launchArguments.Count) { Start-Process -FilePath $wpsExe -ArgumentList $launchArguments -WindowStyle Hidden }
    else { Start-Process -FilePath $wpsExe -WindowStyle Hidden }
    Write-Host '如果功能区没有出现，请先保存论文，再自行关闭所有 WPS 窗口并重新打开。'
}
