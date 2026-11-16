# Solo lectura: comprueba que el worker Orca publica su conexion autenticada.
$ErrorActionPreference = 'Stop'
$file = Join-Path $env:LOCALAPPDATA 'CapriOrcaBridge\connection.json'
if (-not (Test-Path -LiteralPath $file)) {
    Write-Host 'FALLO: no existe connection.json. Activa el plugin Capri Bridge dentro de Orca.' -ForegroundColor Red
    exit 1
}
$config = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.host -ne '127.0.0.1' -or $config.port -lt 1024 -or $config.port -gt 65535 -or $config.token -notmatch '^[0-9a-f]{64}$') {
    Write-Host 'FALLO: archivo de conexion invalido' -ForegroundColor Red
    exit 2
}
$headers = @{ 'x-capri-orca-token' = [string]$config.token }
try {
    $body = @{ version=1; operation='ping'; params=@{}; requestId=([guid]::NewGuid().ToString('N')) } | ConvertTo-Json -Compress -Depth 6
    $answer = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $config.port + '/v1') -Method Post -Headers $headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 8
    if (-not $answer.ok) { throw 'Respuesta no confirmada' }
    Write-Host ('CORRECTO: puente version ' + $answer.result.bridge + ', Host API ' + $answer.result.hostApi.major + '.' + $answer.result.hostApi.minor) -ForegroundColor Green
    if (-not $answer.result.capabilities.agentScope) {Write-Warning 'Tu Orca no dispone del API 1.10 requerido para consultar agentes por proyecto.'}
    if ($answer.result.accounts) {Write-Host 'El puente incluye el lector de cuentas por Orca CLI.'}
    try {
        $body2 = @{ version=1; operation='accounts_status'; params=@{}; requestId=([guid]::NewGuid().ToString('N')) } | ConvertTo-Json -Compress -Depth 6
        $usage = Invoke-RestMethod -Uri ('http://127.0.0.1:' + $config.port + '/v1') -Method Post -Headers $headers -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body2)) -TimeoutSec 40
        if ($usage.ok) {
            Write-Host ('CORRECTO: Orca CLI devolvio ' + $usage.result.usage.Count + ' proveedores. Los porcentajes no se imprimen en este diagnostico.') -ForegroundColor Green
        } else {Write-Warning ('Lectura de cuotas no disponible: ' + $usage.error.message)}
    } catch {Write-Warning ('No se pudo leer cuotas por CLI: ' + $_.Exception.Message)}
    Write-Host 'No se enviaron prompts ni se cambiaron cuentas.'
} catch {
    Write-Host ('FALLO al contactar Orca: ' + $_.Exception.Message) -ForegroundColor Red
    exit 3
}
