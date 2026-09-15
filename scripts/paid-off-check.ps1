# ------------------------------------------------------------------
#  Funded Capital - confirm the participant web app is serving the
#  three Paid Off fields after the Apps Script redeploy.
#
#  PRIVACY: this script reads PARTICIPANT_WEBAPP_SECRET so it can call
#  the endpoint, and never prints it, never prints the full URL, and
#  never writes either to a file. What it prints is a yes/no report.
# ------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\luis\repos\funded-capital'
$envFile = Join-Path $repo '.env.local'

Write-Host ''
Write-Host '============================================'
Write-Host '  PAID OFF - WEB APP FIELD CHECK'
Write-Host '============================================'
Write-Host ''

if (-not (Test-Path $envFile)) {
  Write-Host 'Could not find .env.local. Nothing to test with.' -ForegroundColor Red
  exit 1
}

$cfg = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*#') { continue }
  $i = $line.IndexOf('=')
  if ($i -lt 1) { continue }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  $cfg[$k] = $v
}

$url    = $cfg['PARTICIPANT_WEBAPP_URL']
$secret = $cfg['PARTICIPANT_WEBAPP_SECRET']

if ([string]::IsNullOrWhiteSpace($url) -or [string]::IsNullOrWhiteSpace($secret)) {
  Write-Host 'PARTICIPANT_WEBAPP_URL or PARTICIPANT_WEBAPP_SECRET is missing from .env.local.' -ForegroundColor Red
  exit 1
}

Write-Host ('Endpoint  : ...' + $url.Substring([Math]::Max(0, $url.Length - 12)))
Write-Host 'Calling the web app...'
Write-Host ''

try {
  $resp = Invoke-WebRequest -Uri ($url + '?secret=' + $secret + '&action=book') `
                            -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 60
} catch {
  Write-Host 'REQUEST FAILED - the endpoint did not answer.' -ForegroundColor Red
  Write-Host ('  ' + $_.Exception.Message)
  exit 1
}

$body = $resp.Content
if ($body -notmatch '^\s*[\{\[]') {
  Write-Host 'The endpoint answered, but with a web page instead of data.' -ForegroundColor Red
  Write-Host 'That usually means the deployment is not live, or the URL points at an old version.'
  Write-Host ''
  Write-Host ('First 200 characters: ' + $body.Substring(0, [Math]::Min(200, $body.Length)))
  exit 1
}

$data = $body | ConvertFrom-Json

if (-not $data.ok) {
  Write-Host ('The web app answered with an error: ' + $data.error) -ForegroundColor Red
  Write-Host '("unauthorized" means the secret in .env.local no longer matches the script.)'
  exit 1
}

$rows = @($data.participants)
Write-Host ('Rows returned : ' + $rows.Count)
Write-Host ''

if ($rows.Count -eq 0) {
  Write-Host 'No participant rows came back - cannot check the fields.' -ForegroundColor Red
  exit 1
}

$names = $rows[0].PSObject.Properties.Name
$want  = @('payoffDate', 'capitalReturnDue', 'capitalReturned')
$allOk = $true

Write-Host 'Paid Off fields on the wire:'
foreach ($f in $want) {
  if ($names -contains $f) {
    Write-Host ('  [OK]      ' + $f) -ForegroundColor Green
  } else {
    Write-Host ('  [MISSING] ' + $f) -ForegroundColor Red
    $allOk = $false
  }
}

Write-Host ''
$paid = @($rows | Where-Object { $_.status -eq 'Paid Off' -or $_.payoffDate })
Write-Host ('Rows currently marked paid off: ' + $paid.Count)
foreach ($p in $paid) {
  Write-Host ('  ' + $p.participantId + '  loan ' + $p.loanReference +
              '  payoff ' + $p.payoffDate + '  due back ' + $p.capitalReturnDue +
              '  returned ' + $(if ($p.capitalReturned) { $p.capitalReturned } else { '(not yet)' }))
}

Write-Host ''
Write-Host '============================================'
if ($allOk) {
  Write-Host '  RESULT: DEPLOYMENT IS SERVING THE NEW FIELDS' -ForegroundColor Green
} else {
  Write-Host '  RESULT: OLD CODE STILL LIVE' -ForegroundColor Red
  Write-Host '  Deploy > Manage deployments > edit the live'
  Write-Host '  one > Version: New version > Deploy.'
}
Write-Host '============================================'
Write-Host ''
