param(
    [string]$ComfyUIRoot = "",
    [string]$ReleaseTag = "v0.2.0"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $ComfyUIRoot) {
    $customNodes = Split-Path -Parent $repoRoot
    $ComfyUIRoot = Split-Path -Parent $customNodes
}

$ComfyUIRoot = [IO.Path]::GetFullPath($ComfyUIRoot)
$modelDir = Join-Path $ComfyUIRoot "models\LLM\Bonsai2-27B"
$downloadDir = Join-Path $env:TEMP "xinbao-bonsai2-v020"
$baseUrl = "https://github.com/lishuihan123/ComfyUI-Xinbao-Node-Group/releases/download/$ReleaseTag"

$parts = @(
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part01",
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part02",
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part03",
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part04"
)
$mmprojName = "Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf"
$runtimeName = "Xinbao-Bonsai2-runtime-win-cuda12.zip"

New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null

function Get-ReleaseFile([string]$name) {
    $target = Join-Path $downloadDir $name
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "正在下载 $name"
        Invoke-WebRequest -Uri "$baseUrl/$name" -OutFile $target
    } else {
        Write-Host "已存在，跳过下载：$name"
    }
    return $target
}

$partPaths = foreach ($part in $parts) { Get-ReleaseFile $part }
$mmprojDownload = Get-ReleaseFile $mmprojName
$runtimeDownload = Get-ReleaseFile $runtimeName

$modelPath = Join-Path $modelDir "Ternary-Bonsai-2-27B-PTQ1_0.gguf"
$output = [IO.File]::Open($modelPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
try {
    foreach ($partPath in $partPaths) {
        Write-Host "正在合并 $(Split-Path -Leaf $partPath)"
        $input = [IO.File]::OpenRead($partPath)
        try { $input.CopyTo($output) } finally { $input.Dispose() }
    }
} finally {
    $output.Dispose()
}

Copy-Item -LiteralPath $mmprojDownload -Destination (Join-Path $modelDir $mmprojName) -Force
Expand-Archive -LiteralPath $runtimeDownload -DestinationPath $modelDir -Force

$expectedModelHash = "53107F530AA52EB00912263AB1EE29BD199261C87CD7B4AD4CA1318C1FE33EE3"
$expectedMmprojHash = "6807EDE61D570BB86BA34B756A0FA109EDC33668604DE867C6EA6D8F1D631903"
$actualModelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash
$actualMmprojHash = (Get-FileHash -LiteralPath (Join-Path $modelDir $mmprojName) -Algorithm SHA256).Hash

if ($actualModelHash -ne $expectedModelHash) {
    throw "主模型 SHA256 校验失败。实际值：$actualModelHash"
}
if ($actualMmprojHash -ne $expectedMmprojHash) {
    throw "视觉投影模型 SHA256 校验失败。实际值：$actualMmprojHash"
}

Write-Host "安装完成：$modelDir" -ForegroundColor Green
Write-Host "请重启 ComfyUI。"
