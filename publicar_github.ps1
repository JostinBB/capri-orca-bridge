# Crea (o actualiza) el repositorio PUBLICO en la cuenta GitHub autenticada.
# Ejecutar SOLO desde el directorio extraido del proyecto, con gh y git instalados.
param([switch]$ReleaseAfterRealWindowsTest)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$repo = 'JostinBB/capri-orca-bridge'
foreach ($exe in @('git','gh')) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "Instala $exe y vuelve a ejecutar." }
}
gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Inicia sesión primero con: gh auth login' }
$login = (gh api user --jq '.login').Trim()
if ($LASTEXITCODE -ne 0 -or $login -ne 'JostinBB') { throw "La cuenta activa es '$login', pero este script solo puede publicar en JostinBB. Cambia de cuenta con gh auth switch." }
if (-not (Test-Path '.git')) { git init -b main }
if ($LASTEXITCODE -ne 0) { throw 'No se pudo inicializar Git.' }
python tests/check_public_repo.py
if ($LASTEXITCODE -ne 0) { throw 'Se encontraron datos que no deben publicarse.' }
python tests/check_csharp.py
if ($LASTEXITCODE -ne 0) { throw 'Fallo la revisión C#.' }
node --test tests/accounts.test.mjs tests/bridge.test.mjs tests/dashboard.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Fallan pruebas Node. No se publica.' }
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { throw "Rama activa '$branch'; usa main para publicar." }
git add -A
if ((git diff --cached --name-only) -ne $null) {
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git commit -m 'Capri-Orca Bridge v0.10.0: visual quotas, tests and CI'
    if ($LASTEXITCODE -ne 0) { throw 'Git no pudo crear el commit. Configura user.name / user.email.' }
  }
}
gh repo view $repo --json name 2>$null | Out-Null
$alreadyExists = $LASTEXITCODE -eq 0
if (-not $alreadyExists) {
  gh repo create $repo --public --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw 'GitHub no pudo crear el repositorio público.' }
} else {
  git remote get-url origin 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { git remote add origin "https://github.com/$repo.git" }
  $url = (git remote get-url origin).Trim()
  if ($url -notmatch '(?i)github\.com[:/]JostinBB/capri-orca-bridge(\.git)?$') { throw "Remote inesperado: $url" }
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo enviar al repositorio.' }
}
Write-Host "Código publicado: https://github.com/$repo"
Write-Host 'Revisa Actions / CI antes de crear una release.'
if ($ReleaseAfterRealWindowsTest) {
  foreach ($exe in @('dotnet','orca')) {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { throw "Hace falta $exe para validar en Windows antes de la release." }
  }
  dotnet build tests/windows-compile/CapriBridgeCompile.csproj -c Release -v minimal
  if ($LASTEXITCODE -ne 0) { throw 'No compila el mod C# con el stub. No hay release.' }
  orca plugin validate .\orca-plugin
  if ($LASTEXITCODE -ne 0) { throw 'Orca no valido su plugin. No hay release.' }
  $answer = Read-Host '¿Probaste manualmente en Capri y Orca reales (voz, panel y cuenta) y CI está verde? Escribe VALIDADO para publicar prerelease'
  if ($answer -cne 'VALIDADO') { Write-Host 'No se ha creado ninguna release.'; exit 0 }
  $v=(Get-Content VERSION -Raw).Trim()
  git tag -a "v$v" -m "Capri-Orca Bridge v$v"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el tag.' }
  git push origin "v$v"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo subir el tag.' }
  Write-Host "GitHub Actions creará la prerelease v$v si todas las pruebas pasan."
}
