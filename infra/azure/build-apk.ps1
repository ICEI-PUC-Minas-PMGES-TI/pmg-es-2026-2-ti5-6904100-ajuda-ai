<#
.SYNOPSIS
  Gera o APK Android de HOMOLOGAÇÃO apontando para a API hospedada.

.DESCRIPTION
  POR PADRÃO SÓ MOSTRA o que faria (simulação). Só compila com -Executar.
  Roda no seu computador; não publica nada e não acessa o Azure além de ler o
  endereço da API (az containerapp show) quando -ApiUrl não é informado.

  A chave de demonstração NUNCA é embutida no APK (seria extraível do binário). O APK só liga
  o campo de chave na tela de login (DEMO_LOGIN_PROTEGIDO=true, que não é segredo): quem
  apresenta digita a chave. Ela fica em DEMO_CHAVE_ACESSO no arquivo de segredos.

  Os dart-defines vão para um arquivo temporário FORA do repositório, apagado ao final.
  Sem android/key.properties o release é assinado com a chave de debug (serve para a
  apresentação; o Android só deixa atualizar por cima se a chave for sempre a mesma).

.EXAMPLE
  ./infra/azure/build-apk.ps1 -ArquivoSegredos $env:USERPROFILE\ajudaai-segredos\homologacao.env             # simulação
  ./infra/azure/build-apk.ps1 -ArquivoSegredos $env:USERPROFILE\ajudaai-segredos\homologacao.env -Executar
#>
param(
  [Parameter(Mandatory)][string]$ArquivoSegredos,
  [string]$ApiUrl,                                # https://..., sem barra final; padrão: lida do Container App
  [string]$GrupoRecursos = 'rg-ajudaai',
  [string]$App = 'ajudaai-api-hml',
  [switch]$Executar
)
$ErrorActionPreference = 'Stop'
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path $ArquivoSegredos)) { throw "Arquivo de segredos não encontrado: $ArquivoSegredos" }

$v = @{}
foreach ($l in Get-Content $ArquivoSegredos) { if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$' -and $matches[2]) { $v[$matches[1]] = $matches[2] } }

if (-not $ApiUrl) {
  if (-not $Executar) { $ApiUrl = 'https://<endereço-da-api-lido-do-Azure>' }
  else {
    $fqdn = az containerapp show -g $GrupoRecursos -n $App --query properties.configuration.ingress.fqdn -o tsv
    if (-not $fqdn) { throw 'Não consegui ler o endereço da API: o Container App existe?' }
    $ApiUrl = "https://$fqdn"
  }
}
$ApiUrl = $ApiUrl.TrimEnd('/')
if ($ApiUrl -notmatch '^https://') { throw 'A API precisa ser https:// (o APK de release bloqueia HTTP sem criptografia).' }
foreach ($k in 'MAPBOX_ACCESS_TOKEN', 'MAP_ASSETS_BASE_URL') { if (-not $v[$k]) { Write-Host "AVISO: $k vazio no arquivo de segredos: o mapa pode não carregar." -ForegroundColor Yellow } }

$defines = [ordered]@{ API_BASE_URL = $ApiUrl; DEMO_LOGIN = 'true'; CAMPUS_MAP_DIAGNOSTICS = 'false' }
foreach ($k in 'MAPBOX_ACCESS_TOKEN', 'MAP_ASSETS_BASE_URL', 'MAPBOX_STYLE_URI', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_TENANT_ID') { if ($v[$k]) { $defines[$k] = $v[$k] } }
# A chave de demonstração NUNCA entra no APK (seria extraível): a pessoa a digita na tela de login.
$defines['DEMO_LOGIN_PROTEGIDO'] = 'true'

Write-Host "API do APK: $ApiUrl"
Write-Host ("Configurações embutidas (nomes, sem valores): " + ($defines.Keys -join ', '))
if (-not $Executar) {
  Write-Host 'SIMULAÇÃO: nada será compilado. Comando que seria executado, em code/mobile:' -ForegroundColor Yellow
  Write-Host 'flutter build apk --release --split-per-abi --dart-define-from-file=<arquivo temporário fora do repositório>'
  return
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ajudaai-defines-" + [guid]::NewGuid().ToString('N') + '.json')
try {
  [IO.File]::WriteAllText($tmp, ($defines | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  Push-Location (Join-Path $raiz 'code\mobile')
  try {
    # Avisos no stderr (flutter/gradle) viram erro fatal no PowerShell 5.1: vale o código de saída.
    $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      flutter pub get
      if ($LASTEXITCODE -ne 0) { throw 'flutter pub get falhou.' }
      flutter build apk --release --split-per-abi "--dart-define-from-file=$tmp"
      if ($LASTEXITCODE -ne 0) { throw 'flutter build apk falhou.' }
    } finally { $ErrorActionPreference = $anterior }
  } finally { Pop-Location }
} finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }

$saida = Join-Path $raiz 'code\mobile\build\app\outputs\flutter-apk'
Get-ChildItem $saida -Filter '*-release.apk' | ForEach-Object { Write-Host ("{0}  ({1:N0} MB)" -f $_.FullName, ($_.Length / 1MB)) }
Write-Host 'Para celulares modernos use app-arm64-v8a-release.apk. Instale com: adb install -r <arquivo>  (ou envie o arquivo ao celular).'
