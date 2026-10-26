# Export the Cloudflare D1 ranking table (osaka-ranking) to a CSV file.
# Normally you do not run this directly: double-click export_ranking.bat instead.
# Output: ..\ranking_backup\ranking_YYYY-MM-DD_HHmm.csv  (UTF-8 with BOM, opens fine in Excel)
param([string]$FromJson = '')   # for testing: read the wrangler JSON output from a file instead of calling Cloudflare
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'ranking_backup'
New-Item -ItemType Directory -Force $outDir | Out-Null
$file = Join-Path $outDir ('ranking_{0}.csv' -f (Get-Date -Format 'yyyy-MM-dd_HHmm'))

if ($FromJson) {
  $raw = Get-Content $FromJson -Raw -Encoding UTF8
} else {
  Write-Host 'Reading the ranking from Cloudflare D1 (osaka-ranking) ...'
  $sql = 'SELECT stage, id, name, score, level, updated FROM scores ORDER BY stage, score DESC'
  $raw = (& npx --yes wrangler d1 execute osaka-ranking --remote --json --command $sql) | Out-String
  if ($LASTEXITCODE -ne 0) { throw "wrangler failed (exit code $LASTEXITCODE). Run 'npx wrangler login' once, and check database_id in wrangler.toml." }
}

# wrangler may print banner lines before the JSON, so cut out the JSON array
$m = [regex]::Match($raw, '(?s)\[\s*\{.*\]')
if (-not $m.Success) { throw "Could not find JSON in the wrangler output:`n$raw" }
$rows = @((($m.Value | ConvertFrom-Json)[0]).results)

$cols = 'stage', 'id', 'name', 'score', 'level', 'updated'
if ($rows.Count -gt 0) {
  $rows | Select-Object $cols | Export-Csv -Path $file -NoTypeInformation -Encoding UTF8
} else {
  [IO.File]::WriteAllText($file, (($cols | ForEach-Object { '"' + $_ + '"' }) -join ',') + "`r`n", (New-Object Text.UTF8Encoding($true)))
}
Write-Host ''
Write-Host ('Saved {0} rows to:' -f $rows.Count)
Write-Host $file
if (-not $FromJson) { Start-Process explorer.exe "/select,`"$file`"" }
