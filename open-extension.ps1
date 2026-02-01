# Quick script to open VS Code with the extension loaded

$rootPath = $PSScriptRoot
$extensionPath = Join-Path $rootPath "vscode-extension"

Write-Host "`n🚀 Starting VS Code with Agent Control Plane Extension...`n" -ForegroundColor Green

# Open VS Code with extension development path
code --extensionDevelopmentPath="$extensionPath" "$rootPath"

Write-Host "✅ VS Code launched!" -ForegroundColor Green
Write-Host "   Use Ctrl+Shift+P → 'ACP: Open Trace File' to use the extension`n" -ForegroundColor Cyan
