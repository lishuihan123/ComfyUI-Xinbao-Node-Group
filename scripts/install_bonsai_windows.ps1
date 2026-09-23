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
$runtimeBaseUrl = "https://github.com/PrismML-Eng/llama.cpp/releases/download/prism-b10709-9a9394a"

$parts = @(
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part01",
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part02",
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part03",
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part04"
)
$mmprojName = "Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf"
$runtimeBinaryName = "llama-prism-b10709-9a9394a-bin-win-cuda-12.4-x64.zip"
$runtimeCudaName = "cudart-llama-bin-win-cuda-12.4-x64.zip"

New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null

function Get-RemoteFile([string]$url, [string]$name) {
    $target = Join-Path $downloadDir $name
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "Downloading $name"
        Invoke-WebRequest -Uri "$url/$name" -OutFile $target
    } else {
        Write-Host "Existing download, skipped: $name"
    }
    return $target
}

$partPaths = foreach ($part in $parts) { Get-RemoteFile $baseUrl $part }
$mmprojDownload = Get-RemoteFile $baseUrl $mmprojName
$runtimeBinaryDownload = Get-RemoteFile $runtimeBaseUrl $runtimeBinaryName
$runtimeCudaDownload = Get-RemoteFile $runtimeBaseUrl $runtimeCudaName

$modelPath = Join-Path $modelDir "Ternary-Bonsai-2-27B-PTQ1_0.gguf"
$output = [IO.File]::Open($modelPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
try {
    foreach ($partPath in $partPaths) {
        Write-Host "Joining $(Split-Path -Leaf $partPath)"
        $input = [IO.File]::OpenRead($partPath)
        try { $input.CopyTo($output) } finally { $input.Dispose() }
    }
} finally {
    $output.Dispose()
}

Copy-Item -LiteralPath $mmprojDownload -Destination (Join-Path $modelDir $mmprojName) -Force
$runtimeDir = Join-Path $modelDir "runtime"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Expand-Archive -LiteralPath $runtimeBinaryDownload -DestinationPath $runtimeDir -Force
Expand-Archive -LiteralPath $runtimeCudaDownload -DestinationPath $runtimeDir -Force

$expectedModelHash = "53107F530AA52EB00912263AB1EE29BD199261C87CD7B4AD4CA1318C1FE33EE3"
$expectedMmprojHash = "6807EDE61D570BB86BA34B756A0FA109EDC33668604DE867C6EA6D8F1D631903"
$actualModelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash
$actualMmprojHash = (Get-FileHash -LiteralPath (Join-Path $modelDir $mmprojName) -Algorithm SHA256).Hash

if ($actualModelHash -ne $expectedModelHash) {
    throw "Main model SHA256 verification failed: $actualModelHash"
}
if ($actualMmprojHash -ne $expectedMmprojHash) {
    throw "Vision projector SHA256 verification failed: $actualMmprojHash"
}

Write-Host "Installation complete: $modelDir" -ForegroundColor Green
Write-Host "Restart ComfyUI before using the inference node."
