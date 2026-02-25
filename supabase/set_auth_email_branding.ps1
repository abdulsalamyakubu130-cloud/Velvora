param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$AccessToken,

  [string]$AppName = 'Velvora',
  [string]$LogoUrl = 'https://YOUR_DOMAIN/favicon.svg'
)

$ErrorActionPreference = 'Stop'

if ($ProjectRef -match '^YOUR_' -or $AccessToken -match '^YOUR_' -or $LogoUrl -match 'YOUR_') {
  throw 'Replace all placeholder values (YOUR_...) with real values before running.'
}

if ($ProjectRef -match 'https?://' -or $ProjectRef -match 'supabase\.co') {
  throw 'ProjectRef must be your project ref only (for example: abcdefghijklmnopqrst), not a URL.'
}

if ($AccessToken -notmatch '^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$') {
  throw 'AccessToken must be a Supabase personal access token JWT from your Supabase account settings, not anon/service_role key.'
}

$templatePath = Join-Path $PSScriptRoot 'email_templates\confirmation_velvora.html'
if (!(Test-Path -Path $templatePath)) {
  throw "Template not found: $templatePath"
}

$templateHtml = Get-Content -Path $templatePath -Raw
$templateHtml = $templateHtml.Replace('__APP_NAME__', $AppName).Replace('__LOGO_URL__', $LogoUrl)

$payload = @{
  mailer_subjects_confirmation = "Your $AppName verification code"
  mailer_templates_confirmation_content = $templateHtml
} | ConvertTo-Json -Depth 10

$headers = @{
  Authorization = "Bearer $AccessToken"
  'Content-Type' = 'application/json'
}

$endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"
try {
  Invoke-RestMethod -Method Patch -Uri $endpoint -Headers $headers -Body $payload | Out-Null
} catch {
  $errorBody = ''
  try {
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $errorBody = $reader.ReadToEnd()
      $reader.Close()
    }
  } catch {
    # Ignore stream parse errors.
  }

  if ($errorBody) {
    throw "Failed to update template. API response: $errorBody"
  }
  throw
}

Write-Host "Supabase Auth confirmation template updated for $AppName."
Write-Host "If sender still shows Supabase, configure Custom SMTP + sender name in Supabase Auth settings."
