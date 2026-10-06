$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publishPath = Join-Path $env:APPDATA 'kingsoft\wps\jsaddons\publish.xml'
if (Test-Path -LiteralPath $publishPath) {
    $config = New-Object Xml.XmlDocument
    $config.Load($publishPath)
    foreach ($plugin in @($config.SelectNodes('/jsplugins/jspluginonline[@name="WpsReferenceAssistant"]'))) { [void]$plugin.ParentNode.RemoveChild($plugin) }
    $config.Save($publishPath)
}
$pidPath = Join-Path $projectRoot 'logs\server.pid'
if (Test-Path -LiteralPath $pidPath) {
    $serverPid = [int](Get-Content -LiteralPath $pidPath)
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
    $expectedScript = Join-Path $PSScriptRoot 'server.cjs'
    if ($null -ne $processInfo -and $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($expectedScript)) { Stop-Process -Id $serverPid }
}
Write-Host '已移除本加载项配置。文档中的批注未修改；如需清除，请在卸载前使用插件的清除按钮。'
