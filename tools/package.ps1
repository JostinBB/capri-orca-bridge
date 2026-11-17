# Build and verify the experimental installation archive. No secrets or user data are packaged.
param(
    [string]$Tag = "",
    [string]$OutputDir = "dist"
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
    $version = (Get-Content -LiteralPath 'VERSION' -Raw).Trim()
    if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw 'VERSION is not semantic versioning' }
    $manifestVersion = (Get-Content -LiteralPath 'orca-plugin/orca-plugin.json' -Raw | ConvertFrom-Json).version
    if ($version -ne $manifestVersion) { throw 'VERSION does not match Orca manifest' }
    if ([string]::IsNullOrWhiteSpace($Tag)) { $Tag = "v$version" }
    if ($Tag -ne "v$version") { throw 'Tag does not match VERSION' }

    $items = @('capri-mod', 'orca-plugin', 'tests', 'compatibility', 'README.md',
               'REPORTE_PRUEBAS.md', 'LICENSE', 'VERSION', 'diagnostico_windows.ps1')
    foreach ($item in $items) {
        if (-not (Test-Path -LiteralPath $item)) { throw "Missing package content: $item" }
    }

    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    $destination = (Resolve-Path -LiteralPath $OutputDir).Path
    $zipName = "Capri-Orca-Bridge-$Tag.zip"
    $zip = Join-Path $destination $zipName
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -Path $items -DestinationPath $zip -CompressionLevel Optimal -ErrorAction Stop

    # Verify key files are genuinely present in the ZIP before publishing.
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        foreach ($required in @('VERSION', 'orca-plugin/orca-plugin.json',
                                 'capri-mod/capri-orca-bridge.capri-code')) {
            if ($entries -notcontains $required) { throw "Archive misses $required" }
        }
    } finally { $archive.Dispose() }

    $digest = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($digest -notmatch '^[0-9a-f]{64}$') { throw 'Invalid SHA-256 digest' }
    $shaFile = Join-Path $destination 'SHA256SUMS.txt'
    Set-Content -LiteralPath $shaFile -Value "$digest  $zipName" -Encoding ascii
    Write-Host "Package verified: $zipName; SHA-256: $digest"
} finally { Pop-Location }
