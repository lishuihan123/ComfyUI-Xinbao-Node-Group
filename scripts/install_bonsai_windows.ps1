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

$modelParts = 1..4 | ForEach-Object {
    "Ternary-Bonsai-2-27B-PTQ1_0.gguf.part{0:D2}" -f $_
}
$modelPartSizes = @(1887436800L, 1887436800L, 1887436800L, 284338528L)
$mmprojName = "Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf"
$mmprojSize = 629246976L
$runtimeBinaryName = "llama-prism-b10709-9a9394a-bin-win-cuda-12.4-x64.zip"
$runtimeCudaName = "cudart-llama-bin-win-cuda-12.4-x64.zip"
$runtimeBinarySize = 253442371L
$runtimeCudaSize = 391443627L

New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null

function Get-RemoteFile([string]$url, [string]$name, [long]$expectedBytes) {
    $target = Join-Path $downloadDir $name
    if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -eq $expectedBytes) {
        Write-Host "Existing download, skipped: $name"
        return $target
    }
    if ((Test-Path -LiteralPath $target) -and (Get-Item -LiteralPath $target).Length -gt $expectedBytes) {
        Remove-Item -LiteralPath $target -Force
    }

    Write-Host "Downloading or resuming $name"
    & curl.exe --location --fail --retry 20 --retry-all-errors --retry-delay 5 `
        --continue-at - --output $target "$url/$name"
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed: $name"
    }
    $actualBytes = (Get-Item -LiteralPath $target).Length
    if ($actualBytes -ne $expectedBytes) {
        throw "Download size verification failed for ${name}: $actualBytes != $expectedBytes"
    }
    return $target
}

$modelPartPaths = for ($index = 0; $index -lt $modelParts.Count; $index++) {
    Get-RemoteFile $baseUrl $modelParts[$index] $modelPartSizes[$index]
}
$mmprojDownload = Get-RemoteFile $baseUrl $mmprojName $mmprojSize
$runtimeBinaryDownload = Get-RemoteFile $runtimeBaseUrl $runtimeBinaryName $runtimeBinarySize
$runtimeCudaDownload = Get-RemoteFile $runtimeBaseUrl $runtimeCudaName $runtimeCudaSize

function Join-ReleaseParts([array]$partPaths, [string]$destination) {
    $output = [IO.File]::Open($destination, [IO.FileMode]::Create, [IO.FileAccess]::Write)
    try {
        foreach ($partPath in $partPaths) {
            Write-Host "Joining $(Split-Path -Leaf $partPath)"
            $input = [IO.File]::OpenRead($partPath)
            try { $input.CopyTo($output) } finally { $input.Dispose() }
        }
    } finally {
        $output.Dispose()
    }
}

$modelPath = Join-Path $modelDir "Ternary-Bonsai-2-27B-PTQ1_0.gguf"
$mmprojPath = Join-Path $modelDir $mmprojName
Join-ReleaseParts $modelPartPaths $modelPath
Copy-Item -LiteralPath $mmprojDownload -Destination $mmprojPath -Force
$runtimeDir = Join-Path $modelDir "runtime"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Expand-Archive -LiteralPath $runtimeBinaryDownload -DestinationPath $runtimeDir -Force
Expand-Archive -LiteralPath $runtimeCudaDownload -DestinationPath $runtimeDir -Force

$expectedModelHash = "53107F530AA52EB00912263AB1EE29BD199261C87CD7B4AD4CA1318C1FE33EE3"
$expectedMmprojHash = "6807EDE61D570BB86BA34B756A0FA109EDC33668604DE867C6EA6D8F1D631903"
$actualModelHash = (Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash
$actualMmprojHash = (Get-FileHash -LiteralPath $mmprojPath -Algorithm SHA256).Hash

if ($actualModelHash -ne $expectedModelHash) {
    throw "Main model SHA256 verification failed: $actualModelHash"
}
if ($actualMmprojHash -ne $expectedMmprojHash) {
    throw "Vision projector SHA256 verification failed: $actualMmprojHash"
}

Write-Host "Installation complete: $modelDir" -ForegroundColor Green
Write-Host "Restart ComfyUI before using the inference node."
