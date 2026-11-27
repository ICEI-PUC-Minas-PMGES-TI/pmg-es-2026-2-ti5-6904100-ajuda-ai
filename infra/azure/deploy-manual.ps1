<#
.SYNOPSIS
  Primeiro deploy (e deploys seguintes) do Ajuda-aí a partir do seu computador,
  sem OIDC e sem registrar nada no Entra.

.DESCRIPTION
  POR PADRÃO SÓ MOSTRA os comandos (simulação). Só publica com -Executar.

  Usa o SEU login do Azure (az login) e o SEU login do Docker Hub (docker login).
  Nenhuma credencial nova é criada e nenhuma senha vai para o Git.

  API:  constrói a imagem, envia ao Docker Hub (repositório privado), troca a imagem
        do Container App e espera /health/ready responder com a versão nova.
        Se não ficar saudável, restaura a imagem e a versão anteriores.
  Web:  constrói com as variáveis do ambiente e sincroniza com o site estático do
        Storage (autenticação por chave da conta, lida pela CLI, nunca impressa).

  ROLLBACK da API: -Imagem <tag anterior>. Rollback da web: rode de novo a partir
  do commit anterior (git checkout <commit>) com -Somente web.

  Variáveis lidas de -ArquivoSegredos (.env FORA do Git): MAPBOX_ACCESS_TOKEN,
  MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID (os dois últimos opcionais até o Entra).

.EXAMPLE
  ./infra/azure/deploy-manual.ps1 -Usuario meuusuario                      # simulação
  docker login -u meuusuario                                                # uma vez
  ./infra/azure/deploy-manual.ps1 -Usuario meuusuario -ArquivoSegredos $env:USERPROFILE\ajudaai-segredos\homologacao.env -Executar
#>
param(
  [string]$Ambiente = 'homologacao',
  [Parameter(Mandatory)][string]$Usuario,        # usuário do Docker Hub (repositório privado ajudaai-api)
  [ValidateSet('ambos', 'api', 'web')][string]$Somente = 'ambos',
  [string]$Imagem,                               # rollback: tag já publicada
  [string]$ArquivoSegredos,
  [string]$GrupoRecursos = 'rg-ajudaai',
  [switch]$Executar
)
$ErrorActionPreference = 'Stop'
if ($Ambiente -ne 'homologacao') { throw 'Este script é só para a homologação. Produção só depois da autorização específica.' }

$app    = 'ajudaai-api-hml'
$conta  = 'ajudaiwebhomolog'
$repo   = "docker.io/$Usuario/ajudaai-api"
$raiz   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sha    = (git -C $raiz rev-parse --short HEAD).Trim()
$sujo   = if (git -C $raiz status --porcelain) { '-local' } else { '' }
$tag    = if ($Imagem) { $Imagem } else { "manual-$(Get-Date -Format 'yyyyMMdd-HHmm')-$sha$sujo" }

function Passo([string]$descricao, [scriptblock]$comando) {
  Write-Host "`n# $descricao" -ForegroundColor Cyan
  Write-Host ($comando.ToString().Trim())
  if ($Executar) {
    # Avisos no stderr (npm, az) viram erro fatal no PowerShell 5.1; vale o código de saída do comando.
    $global:LASTEXITCODE = 0
    $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $comando } finally { $ErrorActionPreference = $anterior }
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Falhou: $descricao" }
  }
}
function LerSegredos([string]$caminho) {
  $v = @{}
  if (-not $caminho) { return $v }
  if (-not (Test-Path $caminho)) { throw "Arquivo de segredos não encontrado: $caminho" }
  foreach ($l in Get-Content $caminho) { if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$' -and $matches[2]) { $v[$matches[1]] = $matches[2] } }
  return $v
}

if (-not $Executar) { Write-Host 'SIMULAÇÃO: nada será publicado. Use -Executar após a autorização.' -ForegroundColor Yellow }
Write-Host "Ambiente: $Ambiente | versão: $tag | API: $app | web: $conta"

Passo 'Conferir a assinatura e o limite de gastos' {
  $id = az account show --query id -o tsv
  $limite = az rest --method get --url "https://management.azure.com/subscriptions/${id}?api-version=2022-12-01" --query 'subscriptionPolicies.spendingLimit' -o tsv
  if ($limite -ne 'On') { throw 'Limite de gastos NÃO está ligado: parar.' }
  Write-Host "Assinatura ok, limite de gastos: $limite"
}

if ($Somente -in 'ambos', 'api') {
  if (-not $Imagem) {
    Passo "Construir a imagem da API ($repo`:$tag)" {
      docker build --build-arg APP_VERSION=$tag -t "${repo}:$tag" (Join-Path $raiz 'code\back\api')
    }
    Passo 'Enviar a imagem ao Docker Hub (exige docker login feito por você)' { docker push "${repo}:$tag" }
  }
  Passo 'Guardar a imagem e a versão atuais (para voltar se falhar)' {
    $consulta = "properties.template.containers[0].{image: image, version: env[?name=='APP_VERSION'] | [0]}"
    $estado = az containerapp show -g $GrupoRecursos -n $app --query $consulta -o json
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao consultar a configuração atual da API.' }
    $script:anterior = $estado | ConvertFrom-Json
    if (-not $script:anterior.image) { throw 'A imagem atual da API não foi encontrada.' }
    Write-Host "Imagem atual: $($script:anterior.image)"
  }
  Passo 'Trocar a imagem do Container App' {
    az containerapp update -g $GrupoRecursos -n $app --image "${repo}:$tag" --set-env-vars "APP_VERSION=$tag" `
      --revision-suffix ("v" + ($tag -replace '[^a-z0-9]', '').ToLower().Substring(0, [Math]::Min(18, ($tag -replace '[^a-z0-9]', '').Length))) -o none
  }
  Passo 'Esperar /health/ready com a versão nova (até 4 min; a 1ª resposta de réplica dormindo demora)' {
    $urlApi = 'https://' + (az containerapp show -g $GrupoRecursos -n $app --query properties.configuration.ingress.fqdn -o tsv)
    $ok = $false
    for ($i = 0; $i -lt 48 -and -not $ok; $i++) {
      try { $r = Invoke-RestMethod -Uri "$urlApi/health/ready" -TimeoutSec 20; if ($r.status -eq 'ok' -and $r.versao -eq $tag) { $ok = $true } } catch { }
      if (-not $ok) { Start-Sleep -Seconds 5 }
    }
    if (-not $ok) {
      Write-Host "API não ficou saudável. Voltando para $($script:anterior.image)" -ForegroundColor Red
      $versao = @('--remove-env-vars', 'APP_VERSION')
      if ($null -ne $script:anterior.version) {
        $valor = if ($script:anterior.version.secretRef) { "secretref:$($script:anterior.version.secretRef)" } else { $script:anterior.version.value }
        $versao = @('--set-env-vars', "APP_VERSION=$valor")
      }
      az containerapp update -g $GrupoRecursos -n $app --image $script:anterior.image @versao -o none
      if ($LASTEXITCODE -ne 0) { throw 'Falha ao reverter o deploy da API.' }
      throw 'Deploy da API revertido.'
    }
    Write-Host "API saudável: $urlApi (versão $tag)"
  }
}

if ($Somente -in 'ambos', 'web') {
  Passo 'Construir a web (variáveis públicas do ambiente; sem segredos)' {
    $s = LerSegredos $ArquivoSegredos
    $urlApi = 'https://' + (az containerapp show -g $GrupoRecursos -n $app --query properties.configuration.ingress.fqdn -o tsv)
    $urlWeb = (az storage account show -n $conta -g $GrupoRecursos --query primaryEndpoints.web -o tsv).Trim().TrimEnd('/')
    $env:VITE_API_URL = $urlApi
    $env:VITE_DEMO_LOGIN = 'true'                                   # painel de contas demo só na homologação
    $env:VITE_MICROSOFT_REDIRECT_URI = "$urlWeb/auth/callback"
    if ($s['MAPBOX_ACCESS_TOKEN'])   { $env:VITE_MAPBOX_ACCESS_TOKEN = $s['MAPBOX_ACCESS_TOKEN'] }
    if ($s['MICROSOFT_CLIENT_ID'])   { $env:VITE_MICROSOFT_CLIENT_ID = $s['MICROSOFT_CLIENT_ID'] }
    if ($s['MICROSOFT_TENANT_ID'])   { $env:VITE_MICROSOFT_TENANT_ID = $s['MICROSOFT_TENANT_ID'] }
    Push-Location (Join-Path $raiz 'code\front'); try { npm ci --no-audit --no-fund; npm run build } finally { Pop-Location }
    Write-Host "Web aponta para a API $urlApi; redirect Microsoft: $urlWeb/auth/callback"
  }
  Passo 'Publicar no site estático (container $web; chave da conta lida pela CLI, não impressa)' {
    $env:AZURE_STORAGE_KEY = az storage account keys list -n $conta -g $GrupoRecursos --query '[0].value' -o tsv
    try {
      $dist = Join-Path $raiz 'code\front\dist'
      # 'blob sync' não aceita cache-control: upload-batch aceita. Arquivos com hash no nome: cache longo; index.html: sem cache.
      az storage blob upload-batch --account-name $conta --destination '$web' --source $dist --overwrite true `
        --content-cache-control 'public, max-age=31536000, immutable' -o none
      if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar os arquivos da web.' }
      az storage blob upload --account-name $conta --container-name '$web' --file (Join-Path $dist 'index.html') --name index.html --overwrite `
        --content-cache-control 'no-cache' --content-type 'text/html; charset=utf-8' -o none
      if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar o index.html.' }
      # Remove do site o que não existe mais no build (arquivos antigos).
      $locais = Get-ChildItem $dist -Recurse -File | ForEach-Object { $_.FullName.Substring($dist.Length + 1).Replace([string][char]92, '/') }
      $remotos = az storage blob list --account-name $conta -c '$web' --query '[].name' -o tsv
      foreach ($n in $remotos) { if ($n -and $locais -notcontains $n) { az storage blob delete --account-name $conta -c '$web' -n $n -o none } }
    } finally { Remove-Item Env:\AZURE_STORAGE_KEY -ErrorAction SilentlyContinue }
  }
  Passo 'Verificar a web (raiz 200; /auth/callback devolve o app, mesmo com status 404)' {
    $urlWeb = (az storage account show -n $conta -g $GrupoRecursos --query primaryEndpoints.web -o tsv).Trim().TrimEnd('/')
    (Invoke-WebRequest -Uri "$urlWeb/" -UseBasicParsing -TimeoutSec 20).StatusCode | ForEach-Object { Write-Host "Raiz: $_" }
    $c = (curl.exe -s "$urlWeb/auth/callback") -join "`n"
    if ($c -notmatch 'id="root"') { throw '/auth/callback não devolveu o app.' } else { Write-Host '/auth/callback devolve o app (fallback ok).' }
    $js = [regex]::Match((curl.exe -s "$urlWeb/"), 'src="(/assets/[^"]+\.js)"').Groups[1].Value
    $codigoJs = curl.exe -s -o NUL -w "%{http_code}" "$urlWeb$js"
    if ($codigoJs -ne '200') { throw "O bundle $js respondeu HTTP $codigoJs." } else { Write-Host "Bundle principal ok (HTTP 200)." }
  }
}

Write-Host "`nPronto. Próximos testes: login demo protegido (chave no arquivo de segredos), rotas, SSE do feed." -ForegroundColor Green
