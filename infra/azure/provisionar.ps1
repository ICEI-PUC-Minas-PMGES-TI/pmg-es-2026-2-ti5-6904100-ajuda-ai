<#
.SYNOPSIS
  Provisiona a hospedagem do Ajuda-aí no Azure com orçamento pessoal R$ 0.

.DESCRIPTION
  POR PADRÃO SÓ MOSTRA os comandos (simulação). Nada é criado sem -Executar.

  Desenho "custo zero":
  - Container Apps (consumo) com réplica mínima 0: sem uso, não cobra; o uso
    fica dentro da cota grátis mensal (180 mil vCPU-s, 360 mil GiB-s, 2 mi req).
  - Web: site estático do Azure Storage (conta Standard_LRS própria por ambiente).
    O Static Web Apps NÃO serve: a política do Azure for Students só permite as
    regiões southafricanorth, mexicocentral, brazilsouth, belgiumcentral e
    spaincentral, e o Static Web Apps não existe em nenhuma delas.
  - Sem Log Analytics (--logs-destination none): log ao vivo continua disponível.
  - Imagem em repositório PRIVADO grátis do Docker Hub (padrão). Use
    -Registro acr só se aceitar gastar ~US$ 5/mês do crédito estudantil.
  - Antes de criar algo, confere se a assinatura é Azure for Students (crédito
    com limite de gastos: quando acaba, a assinatura é desativada, não cobra).

  Segredos: lidos de -ArquivoSegredos (formato .env, FORA do Git), nunca impressos.
  Use infra/ambientes/<ambiente>.env.example como modelo. Para o Docker Hub,
  inclua REGISTRO_USUARIO e REGISTRO_SENHA (access token de leitura).

.EXAMPLE
  ./infra/azure/provisionar.ps1 -Ambiente homologacao                 # simulação
  az login
  ./infra/azure/provisionar.ps1 -Ambiente homologacao -ArquivoSegredos C:\seguro\homolog.env -Executar
#>
param(
  [Parameter(Mandatory)][ValidateSet('homologacao', 'producao')][string]$Ambiente,
  [string]$Regiao = 'brazilsouth',
  [string]$GrupoRecursos = 'rg-ajudaai',
  [ValidateSet('dockerhub', 'acr')][string]$Registro = 'dockerhub',
  [string]$NomeAcr = 'acrajudaai',           # só com -Registro acr (nome global único)
  [int]$ReplicasMinimas = 0,                 # 0 = custo zero sem uso; 1 só no dia da apresentação
  [string]$Repositorio = 'ICEI-PUC-Minas-PMGES-TI/pmg-es-2026-2-ti5-6904100-ajuda-ai',
  [string]$ArquivoSegredos,
  [string]$Imagem,                           # etapa api: imagem JÁ publicada, ex.: docker.io/usuario/ajudaai-api:tag
  # Etapas independentes, para autorizar cada operação externa separadamente:
  #  base     = provedores + grupo de recursos
  #  ambiente = ambiente PADRÃO (Workload Profiles, perfil Consumption) do Container Apps
  #  api      = Container App + credencial do Docker Hub
  #  web      = conta de storage do site estático
  #  segredos = segredos/variáveis da API e CORS (precisa de base, api e web)
  [ValidateSet('tudo', 'base', 'ambiente', 'api', 'web', 'segredos')][string]$Etapa = 'tudo',
  [switch]$ComOidc,                          # só com permissão para registrar apps no Entra (a PUC bloqueia; ver deploy-manual.ps1)
  [switch]$Executar
)
$ErrorActionPreference = 'Stop'

$sufixo = if ($Ambiente -eq 'producao') { '' } else { '-hml' }   # '-homolog' (Express) fica de lado
$ambAca = if ($Ambiente -eq 'producao') { 'cae-ajudaai' } else { 'cae-ajudaai-wp' }   # -homolog e -hml são Express (ficam de lado)
$app    = "ajudaai-api$sufixo"
$web    = if ($Ambiente -eq 'producao') { 'ajudaiweb' } else { 'ajudaiwebhomolog' }   # conta de storage (3-24, minúsculas)

function Passo([string]$descricao, [scriptblock]$comando) {
  if ($script:fase -ne 'sempre' -and $Etapa -ne 'tudo' -and $Etapa -ne $script:fase) { return }
  Write-Host "`n# $descricao" -ForegroundColor Cyan
  Write-Host ($comando.ToString().Trim())
  if ($Executar) {
    # Avisos da az CLI vão para o stderr; no PowerShell 5.1 isso viraria erro fatal. Vale o código de saída.
    $global:LASTEXITCODE = 0
    $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $comando } finally { $ErrorActionPreference = $anterior }
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Falhou: $descricao" }
  }
}

# Roda a az CLI sem deixar segredos aparecerem: a saída (stdout+stderr) é lida como texto, valores
# secretos e tokens conhecidos (dckr_pat_, ghp_) são trocados por <oculto> e só então exibida. Em caso de
# falha lança uma mensagem já limpa (sem ErrorRecord, que repetiria trechos da saída da az).
$script:valoresSecretos = @()
function RegistrarSegredos([hashtable]$valores, [string[]]$chaves) {
  foreach ($k in $chaves) { if ($valores[$k] -and $valores[$k].Length -ge 6) { $script:valoresSecretos += $valores[$k] } }
}
function Limpar([string]$texto) {
  foreach ($v in $script:valoresSecretos) { $texto = $texto.Replace($v, '<oculto>') }
  $texto = $texto -replace 'dckr_pat_[A-Za-z0-9_\-]+', 'dckr_pat_<oculto>' -replace 'gh[pousr]_[A-Za-z0-9]{20,}', 'gh_<oculto>'
  $texto -replace '\x1b\[[0-9;?]*[A-Za-z]', ''
}
function AzSeguro {
  $global:LASTEXITCODE = 0
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $saida = (& az @args 2>&1 | ForEach-Object { "$_" }) -join "`n" } finally { $ErrorActionPreference = $anterior }
  $codigo = $LASTEXITCODE
  $limpo = (Limpar $saida).Trim()
  if ($limpo) { Write-Host $limpo }
  if ($codigo -ne 0) { throw "az falhou (código $codigo): $((($limpo -split "`n") | Where-Object { $_ -match 'ERROR' } | Select-Object -First 1))" }
}

function LerSegredos([string]$caminho) {
  if (-not $caminho) { return @{} }
  if (-not (Test-Path $caminho)) { throw "Arquivo de segredos não encontrado: $caminho" }
  $valores = @{}
  foreach ($linha in Get-Content $caminho) {
    if ($linha -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$' -and $matches[2]) { $valores[$matches[1]] = $matches[2] }
  }
  return $valores
}

if (-not $Executar) {
  Write-Host 'SIMULAÇÃO: nenhum recurso será criado. Use -Executar após a autorização.' -ForegroundColor Yellow
}

$script:fase = 'sempre'   # leitura, roda em qualquer etapa
Passo 'Conferir a assinatura (precisa ser Azure for Students, com limite de gastos)' {
  $conta = az account show --query '{nome:name, id:id, estado:state}' -o json | ConvertFrom-Json
  $oferta = az rest --method get --url "https://management.azure.com/subscriptions/$($conta.id)?api-version=2022-12-01" --query 'subscriptionPolicies.spendingLimit' -o tsv
  Write-Host "Assinatura: $($conta.nome) | estado: $($conta.estado) | limite de gastos: $oferta"
  if ($oferta -ne 'On') { throw 'A assinatura NÃO tem limite de gastos ligado: parar (risco de cobrança pessoal).' }
}

$script:fase = 'base'
Passo "Registrar provedores usados (grátis, só habilita os serviços na assinatura)" {
  foreach ($p in 'Microsoft.App', 'Microsoft.OperationalInsights') { az provider register -n $p --wait -o none }
}

Passo 'Grupo de recursos (grátis)' { az group create -n $GrupoRecursos -l $Regiao -o none }

if ($Registro -eq 'acr') {
  Passo 'Container Registry Basic (~US$ 5/mês do crédito estudantil)' {
    az acr create -n $NomeAcr -g $GrupoRecursos --sku Basic --admin-enabled false -o none
  }
}

$script:fase = 'ambiente'
Passo 'Ambiente PADRÃO do Container Apps (Workload Profiles, só perfil Consumption), SEM Log Analytics' {
  # A CLI e o PUT sem modo explícito saíram em Express. Aqui o modo é PEDIDO (API estável 2026-07-01) e conferido depois.
  # Se vier outro modo, o script para sem repetir. Sem perfil dedicado = sem custo fixo.
  $id = az account show --query id -o tsv
  $base = "https://management.azure.com/subscriptions/$id/resourceGroups/$GrupoRecursos/providers/Microsoft.App/managedEnvironments/$ambAca"
  $url = "${base}?api-version=2026-07-01"                     # versão ESTÁVEL com environmentMode explícito
  $urlLeitura = $url
  $corpo = @{ location = $Regiao; properties = @{ environmentMode = 'WorkloadProfiles'; workloadProfiles = @(@{ name = 'Consumption'; workloadProfileType = 'Consumption' }) } } | ConvertTo-Json -Depth 6 -Compress
  $arq = Join-Path ([IO.Path]::GetTempPath()) ("env-" + [guid]::NewGuid().ToString('N') + '.json')
  try {
    [IO.File]::WriteAllText($arq, $corpo)
    az rest --method put --url $url --body "@$arq" -o none
    for ($i = 0; $i -lt 40; $i++) {
      $e = az rest --method get --url $urlLeitura -o json | ConvertFrom-Json
      if ($e.properties.provisioningState -in 'Succeeded', 'Failed') { break }
      Start-Sleep -Seconds 6
    }
  } finally { Remove-Item $arq -Force -ErrorAction SilentlyContinue }
  Write-Host "Ambiente $ambAca | modo: $($e.properties.environmentMode) | estado: $($e.properties.provisioningState) | perfis: $(($e.properties.workloadProfiles | ForEach-Object { $_.name + ':' + $_.workloadProfileType }) -join ',')"
  if ($e.properties.environmentMode -ne 'WorkloadProfiles' -or $e.properties.provisioningState -ne 'Succeeded') { throw 'Ambiente fora do esperado (modo WorkloadProfiles, Succeeded).' }
  if (@($e.properties.workloadProfiles | Where-Object { $_.workloadProfileType -ne 'Consumption' }).Count) { throw 'Há perfil dedicado: isso tem custo fixo. Parar.' }
}

$script:fase = 'api'
Passo "Container App $app com a imagem privada e o registro na CRIAÇÃO (0,25 vCPU / 0,5 GiB, réplicas $ReplicasMinimas..1)" {
  if ($Registro -eq 'acr') { throw 'Este fluxo usa o Docker Hub. Para ACR use a identidade gerenciada (não suportado aqui).' }
  if (-not $Imagem -or $Imagem -notmatch '^docker\.io/[^/]+/[^:]+:.+$') { throw 'Informe -Imagem docker.io/usuario/repositorio:tag (já publicada).' }
  $s = LerSegredos $ArquivoSegredos
  if (-not $s['REGISTRO_USUARIO'] -or -not $s['REGISTRO_SENHA']) { throw 'Faltam REGISTRO_USUARIO/REGISTRO_SENHA (Docker Hub) no arquivo de segredos.' }
  RegistrarSegredos $s @('REGISTRO_SENHA')
  # Uma única escrita: imagem + registry + secret. Sem variáveis de ambiente: a API falha fechada sem configuração e
  # com réplica mínima 0 nenhuma réplica sobe antes da etapa 'segredos'.
  AzSeguro containerapp create -n $app -g $GrupoRecursos --environment $ambAca --workload-profile-name Consumption `
    --image $Imagem --registry-server docker.io --registry-username $s['REGISTRO_USUARIO'] --registry-password $s['REGISTRO_SENHA'] `
    --target-port 3000 --ingress external --min-replicas $ReplicasMinimas --max-replicas 1 --cpu 0.25 --memory 0.5Gi -o none
  # Conferir sem ler segredos: o registro precisa existir e referenciar um secret existente (só nomes).
  $reg = az containerapp show -n $app -g $GrupoRecursos --query 'properties.configuration.registries[0].[server,passwordSecretRef]' -o tsv
  $nomes = az containerapp secret list -n $app -g $GrupoRecursos --query '[].name' -o tsv
  $partes = @($reg -split "\s+" | Where-Object { $_ })
  if ($partes.Count -lt 2 -or $partes[0] -ne 'docker.io' -or $nomes -notcontains $partes[1]) { throw 'O registro docker.io NÃO ficou gravado referenciando um secret existente. Parar; não repetir o comando.' }
  Write-Host "Registro docker.io gravado; referencia o secret $($partes[1])."
  Write-Host "Modo do ambiente: $(az containerapp env show -n $ambAca -g $GrupoRecursos --query 'properties.workloadProfiles[0].name' -o tsv) | réplicas ativas devem ser 0."
}

$script:fase = 'web'
Passo "Site estático da web: conta de storage $web (Standard_LRS, brazilsouth, só HTTPS)" {
  az storage account create -n $web -g $GrupoRecursos -l $Regiao --sku Standard_LRS --kind StorageV2 `
    --min-tls-version TLS1_2 --https-only true --allow-blob-public-access false -o none
  # index.html também como página de erro: as rotas do React (ex.: /auth/callback) abrem direto.
  az storage blob service-properties update --account-name $web --static-website `
    --index-document index.html --404-document index.html --auth-mode login -o none
  $script:urlWeb = (az storage account show -n $web -g $GrupoRecursos --query primaryEndpoints.web -o tsv).Trim().TrimEnd('/')
  Write-Host "Endereço da web: $script:urlWeb"
}

$script:fase = 'segredos'
Passo 'Segredos e variáveis do Container App (valores lidos do arquivo, não exibidos)' {
  $s = LerSegredos $ArquivoSegredos
  $segredos = @{ 'jwt-secret' = 'JWT_SECRET'; 'db-password' = 'DB_PASSWORD'; 'azure-storage' = 'AZURE_STORAGE_CONNECTION_STRING'; 'rabbitmq-url' = 'RABBITMQ_URL'; 'demo-chave' = 'DEMO_CHAVE_ACESSO' }
  # CORS_ORIGINS sai do endereço real da web (só existe depois de criar o storage).
  $ignorar = @('REGISTRO_USUARIO', 'REGISTRO_SENHA', 'CORS_ORIGINS', 'MAPBOX_ACCESS_TOKEN', 'MAP_ASSETS_BASE_URL', 'MAPBOX_STYLE_URI')
  $argsSegredos = @(); $argsEnv = @()
  foreach ($nome in $segredos.Keys) {
    $var = $segredos[$nome]
    if ($s[$var]) { $argsSegredos += "$nome=$($s[$var])"; $argsEnv += "$var=secretref:$nome" }
  }
  foreach ($var in $s.Keys) { if ($segredos.Values -notcontains $var -and $ignorar -notcontains $var) { $argsEnv += "$var=$($s[$var])" } }
  $urlWebAtual = if ($script:urlWeb) { $script:urlWeb } else { (az storage account show -n $web -g $GrupoRecursos --query primaryEndpoints.web -o tsv 2>$null) }
  if ($urlWebAtual) { $argsEnv += "CORS_ORIGINS=$(($urlWebAtual).Trim().TrimEnd('/'))" } else { throw 'Crie a etapa web antes: o CORS precisa do endereço do site.' }
  RegistrarSegredos $s @($s.Keys | Where-Object { $_ -match 'SENHA|PASSWORD|SECRET|URL|CONNECTION|CHAVE|TOKEN' })
  if ($argsSegredos.Count) { AzSeguro containerapp secret set -n $app -g $GrupoRecursos --secrets $argsSegredos -o none }
  AzSeguro containerapp update -n $app -g $GrupoRecursos --set-env-vars $argsEnv -o none
}

if (-not $ComOidc) {
  Write-Host "`n# (pulado) Login do GitHub Actions por OIDC: exige registrar um app no Entra, o que o diretório da PUC bloqueia para alunos." -ForegroundColor DarkGray
  Write-Host "#   Primeiro deploy: ./infra/azure/deploy-manual.ps1. OIDC só com -ComOidc, depois que a TI liberar." -ForegroundColor DarkGray
} else {
Passo 'Login do GitHub Actions no Azure por OIDC (sem senha). Exige permissão para registrar apps no diretório' {
  $nomeApp = "github-ajudaai-$Ambiente"
  $appId = az ad app list --display-name $nomeApp --query '[0].appId' -o tsv
  if (-not $appId) { $appId = az ad app create --display-name $nomeApp --query appId -o tsv }
  az ad sp show --id $appId -o none 2>$null; if ($LASTEXITCODE) { az ad sp create --id $appId -o none }
  $credencial = @{ name = "env-$Ambiente"; issuer = 'https://token.actions.githubusercontent.com';
    subject = "repo:${Repositorio}:environment:$Ambiente"; audiences = @('api://AzureADTokenExchange') } | ConvertTo-Json -Compress
  $tmp = New-TemporaryFile; Set-Content $tmp $credencial -Encoding utf8
  az ad app federated-credential create --id $appId --parameters "@$tmp" -o none; Remove-Item $tmp
  $rgId = az group show -n $GrupoRecursos --query id -o tsv
  az role assignment create --assignee $appId --role Contributor --scope $rgId -o none
  # Publicar a web: escrever blobs na conta do site estático (sem chave de acesso).
  $webId = az storage account show -n $web -g $GrupoRecursos --query id -o tsv
  az role assignment create --assignee $appId --role 'Storage Blob Data Contributor' --scope $webId -o none
  if ($Registro -eq 'acr') {
    $acrId = az acr show -n $NomeAcr --query id -o tsv
    az role assignment create --assignee $appId --role AcrPush --scope $acrId -o none
  }
  Write-Host "GitHub Environment '$Ambiente' → secrets AZURE_CLIENT_ID=$appId, AZURE_TENANT_ID e AZURE_SUBSCRIPTION_ID (az account show)."
}

}

Write-Host "`n# Próximos passos (manuais, ver docs/tecnico/infraestrutura/hospedagem.md):" -ForegroundColor Cyan
Write-Host "- URL da API:  az containerapp show -n $app -g $GrupoRecursos --query properties.configuration.ingress.fqdn -o tsv"
Write-Host "- Endereço da web (WEB_URL e CORS_ORIGINS, sem barra final): az storage account show -n $web -g $GrupoRecursos --query primaryEndpoints.web -o tsv"
Write-Host "- Login Microsoft (Entra ID): ADIADO. O acesso e pelo login demo protegido; veja docs/tecnico/infraestrutura/hospedagem.md"
Write-Host "- Log ao vivo: az containerapp logs show -n $app -g $GrupoRecursos --follow"
Write-Host "- Dia da apresentação: az containerapp update -n $app -g $GrupoRecursos --min-replicas 1  (voltar para 0 depois)"
