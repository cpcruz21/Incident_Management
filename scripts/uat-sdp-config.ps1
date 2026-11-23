param([string]$FromEnvFile)

$ErrorActionPreference = 'Stop'
$keys = @(
    'SDP_BASE_URL', 'SDP_ACCOUNTS_URL', 'SDP_PORTAL', 'SDP_OAUTH_GRANT_TYPE',
    'SDP_CLIENT_ID', 'SDP_CLIENT_SECRET', 'SDP_REFRESH_TOKEN'
)
$credentialsPath = Join-Path $PSScriptRoot '../.uat-runtime/credentials/sdp-oauth.dpapi'

Get-ChildItem Env: | Where-Object Name -Like 'SDP_*' | ForEach-Object {
    Remove-Item -LiteralPath ('Env:' + $_.Name)
}

if ($FromEnvFile) {
    $source = (Resolve-Path -LiteralPath $FromEnvFile).Path
    $readSettings = "process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('SDP_')))))"
    $payload = & node "--env-file=$source" -e $readSettings
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the SDP settings from the environment file.' }
} else {
    if (-not (Test-Path -LiteralPath $credentialsPath -PathType Leaf)) { return }
    try {
        $encrypted = (Get-Content -Raw -LiteralPath $credentialsPath).Trim()
        $secure = ConvertTo-SecureString -String $encrypted
        $payload = [Net.NetworkCredential]::new('', $secure).Password
    } catch {
        throw 'Could not decrypt the UAT SDP settings under this Windows account.'
    }
}

try {
    $settings = ConvertFrom-Json -InputObject $payload
} catch {
    throw 'The saved UAT SDP settings are invalid.'
}

$grant = $settings.SDP_OAUTH_GRANT_TYPE
if (-not $settings.SDP_CLIENT_ID -or -not $settings.SDP_CLIENT_SECRET -or
    ($grant -and $grant -notin @('client_credentials', 'refresh_token')) -or
    ($grant -ne 'client_credentials' -and -not $settings.SDP_REFRESH_TOKEN)) {
    throw 'The UAT SDP settings are missing credentials for the selected OAuth grant.'
}

if ($FromEnvFile) {
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $credentialsPath)
    ConvertTo-SecureString -String $payload -AsPlainText -Force |
        ConvertFrom-SecureString |
        Set-Content -LiteralPath $credentialsPath
}

foreach ($name in $keys) {
    [Environment]::SetEnvironmentVariable($name, $settings.$name, 'Process')
}
