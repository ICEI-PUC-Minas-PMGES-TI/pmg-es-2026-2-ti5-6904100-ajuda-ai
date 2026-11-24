<#
.SYNOPSIS
  Monta o arquivo de segredos da HOMOLOGAÇÃO a partir do seu .env local, FORA do repositório.

.DESCRIPTION
  Só lê e escreve arquivos locais. Não acessa a internet, o Azure nem o banco.
  Nenhum valor é impresso.

  Do .env local aproveita: o pooler do Supabase (SUPABASE_POOLER_URL), a connection
  string do Blob, o token público do Mapbox, o endereço dos assets do mapa, a lista
  do painel de QA e a CA do banco.
  Gera valores NOVOS (não os do .env): JWT_SECRET e DEMO_CHAVE_ACESSO.
  Deixa em branco o que é seu: RABBITMQ_URL (CloudAMQP), REGISTRO_USUARIO/REGISTRO_SENHA
  (Docker Hub) e MICROSOFT_* (quando a TI registrar o app).

  O arquivo vai para %USERPROFILE%\ajudaai-segredos\homologacao.env. A chave de
  demonstração fica lá: é com ela que você entra nas contas demo.

.EXAMPLE
  ./infra/azure/montar-segredos.ps1
#>
param(
  [string]$EnvLocal = (Join-Path $PSScriptRoot '..\..\code\back\api\.env'),
  [string]$Saida = (Join-Path $env:USERPROFILE 'ajudaai-segredos\homologacao.env')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $EnvLocal)) { throw "Não encontrei o .env local: $EnvLocal" }
if ($Saida -like "$((Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)*") { throw 'A saída precisa ficar FORA do repositório.' }

$v = @{}
foreach ($l in Get-Content $EnvLocal) { if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$' -and $matches[2]) { $v[$matches[1]] = $matches[2] } }

function Aleatorio([int]$bytes) { $b = New-Object byte[] $bytes; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($b); $rng.Dispose(); [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

# Login Microsoft fica de fora por enquanto (MICROSOFT_* em branco); o acesso é pelo login demo protegido.
# Pooler de sessão do Supabase: postgresql://usuario:senha@host:5432/banco (o host direto do .env é só IPv6)
if (-not $v['SUPABASE_POOLER_URL'] -or $v['SUPABASE_POOLER_URL'] -notmatch '^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)') {
  throw 'SUPABASE_POOLER_URL ausente ou fora do formato esperado no .env local.'
}
$dbUser = [uri]::UnescapeDataString($matches[1]); $dbPass = [uri]::UnescapeDataString($matches[2])
$dbHost = $matches[3]; $dbPort = if ($matches[4]) { $matches[4] } else { '5432' }; $dbName = $matches[5]

$linhas = @(
  '# Segredos da HOMOLOGAÇÃO. FORA do Git. Não compartilhe este arquivo.',
  'APP_ENV=homologacao', 'NODE_ENV=production', 'HOST=0.0.0.0', 'PORT=3000',
  "JWT_SECRET=$(Aleatorio 48)",
  "DB_HOST=$dbHost", "DB_PORT=$dbPort", "DB_USERNAME=$dbUser", "DB_PASSWORD=$dbPass", "DB_DATABASE=$dbName",
  'DB_SCHEMA=feed', 'DB_SSL=true', 'DB_SSL_CA=certs/supabase-ca.crt', 'DB_SYNCHRONIZE=false', 'SEED_DEMO_DATA=false',
  'AUTH_ALLOWED_DOMAIN=pucminas.edu.br,sga.pucminas.edu.br',
  'AUTH_DEMO_ENABLED=true', "DEMO_CHAVE_ACESSO=$(Aleatorio 24)", 'DEMO_OPERADORES=',
  'COORDENADORES_EMAILS=', "GAMIFICACAO_QA_EMAILS=$($v['GAMIFICACAO_QA_EMAILS'])",
  "AZURE_STORAGE_CONNECTION_STRING=$($v['AZURE_STORAGE_CONNECTION_STRING'])",
  'RABBITMQ_URL=', 'RABBITMQ_FEED_EXCHANGE=ajuda-ai.feed', 'RABBITMQ_FEED_QUEUE=ajuda-ai.feed.sse',
  'MICROSOFT_TENANT_ID=', 'MICROSOFT_CLIENT_ID=',
  "MAPBOX_ACCESS_TOKEN=$($v['MAPBOX_ACCESS_TOKEN'])",
  "MAP_ASSETS_BASE_URL=$($v['MAP_ASSETS_BASE_URL'])", "MAPBOX_STYLE_URI=$($v['MAPBOX_STYLE_URI'])",
  'REGISTRO_USUARIO=', 'REGISTRO_SENHA='
)
New-Item -ItemType Directory -Force -Path (Split-Path $Saida) | Out-Null
Set-Content -Path $Saida -Value $linhas -Encoding utf8
# Só o seu usuário lê o arquivo.
icacls $Saida /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

$faltam = @('RABBITMQ_URL', 'REGISTRO_USUARIO', 'REGISTRO_SENHA', 'MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID')
Write-Host "Arquivo criado: $Saida"
Write-Host "Preencha (são seus): $($faltam -join ', ')  (MICROSOFT_* só quando a TI registrar o app)"
Write-Host "Chave de demonstração: está em DEMO_CHAVE_ACESSO nesse arquivo."
foreach ($k in 'AZURE_STORAGE_CONNECTION_STRING', 'MAPBOX_ACCESS_TOKEN') { if (-not $v[$k]) { Write-Host "AVISO: $k ausente no .env local." -ForegroundColor Yellow } }
