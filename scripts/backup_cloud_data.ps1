[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$CloudBaseEnvId = 'techphant-bom-v3-d9e3pqqb0b46c88',
    [string]$D1Database = 'bom-db-v3',
    [string]$DomesticExcelDirectory
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $repoRoot "backups\$(Get-Date -Format 'yyyy-MM-dd')"
}
$outputRootPath = [System.IO.Path]::GetFullPath($OutputRoot)
$domesticDir = Join-Path $outputRootPath 'domestic-cloudbase'
$overseasDir = Join-Path $outputRootPath 'overseas-cloudflare'

New-Item -ItemType Directory -Force -Path $domesticDir, $overseasDir | Out-Null

function Invoke-NpxJson {
    param([string[]]$Arguments)

    $output = & npx @Arguments 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "npx command failed with exit code $LASTEXITCODE`n$output"
    }
    return $output | ConvertFrom-Json
}

function Export-CloudBaseTable {
    param(
        [string]$Table,
        [string]$OrderBy
    )

    $result = Invoke-NpxJson @(
        '--yes', '--package', '@cloudbase/cli', 'tcb', 'db', 'execute',
        '-e', $CloudBaseEnvId,
        '--sql', "SELECT * FROM $Table ORDER BY $OrderBy",
        '--json'
    )

    $columns = @($result.data.Columns)
    $rows = foreach ($encodedRow in @($result.data.Rows)) {
        $values = @($encodedRow | ConvertFrom-Json)
        $record = [ordered]@{}
        for ($index = 0; $index -lt $columns.Count; $index++) {
            $record[$columns[$index]] = if ($index -lt $values.Count) { $values[$index] } else { $null }
        }
        [pscustomobject]$record
    }

    $target = Join-Path $domesticDir "$Table.json"
    @($rows) | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $target -Encoding utf8
    return @($rows).Count
}

$cloudBaseCounts = [ordered]@{}
$cloudBaseCounts.users = Export-CloudBaseTable -Table 'users' -OrderBy 'id'
$cloudBaseCounts.material_library = Export-CloudBaseTable -Table 'material_library' -OrderBy 'id'
$cloudBaseCounts.audit_log = Export-CloudBaseTable -Table 'audit_log' -OrderBy 'id'
$cloudBaseCounts.login_attempts = Export-CloudBaseTable -Table 'login_attempts' -OrderBy 'id'

if ($DomesticExcelDirectory) {
    $dateSuffix = Get-Date -Format 'yyyy-MM-dd'
    $excelFiles = Get-ChildItem -LiteralPath $DomesticExcelDirectory -File -Filter "*$dateSuffix.xlsx"
    foreach ($file in $excelFiles) {
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $domesticDir $file.Name) -Force
    }
}

$d1Target = Join-Path $overseasDir 'bom-db-v3.sql'
Push-Location (Join-Path $repoRoot 'cloudflare-worker')
try {
    & npx --yes wrangler d1 export $D1Database --remote --output=$d1Target --skip-confirmation
    if ($LASTEXITCODE -ne 0) {
        throw "Cloudflare D1 export failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$d1Counts = [ordered]@{}
foreach ($table in @('users', 'material_library', 'audit_log', 'login_attempts')) {
    $pattern = '^INSERT INTO "' + [regex]::Escape($table) + '"'
    $d1Counts[$table] = @(Select-String -LiteralPath $d1Target -Pattern $pattern).Count
}

$manifest = [ordered]@{
    created_at = (Get-Date).ToString('o')
    git_commit = (& git -C $repoRoot rev-parse HEAD).Trim()
    cloudbase_environment = $CloudBaseEnvId
    cloudbase_counts = $cloudBaseCounts
    cloudflare_database = $D1Database
    cloudflare_counts = $d1Counts
    cloudflare_sql_sha256 = (Get-FileHash -LiteralPath $d1Target -Algorithm SHA256).Hash.ToLowerInvariant()
    exclusions = @(
        'CloudBase and Cloudflare login tokens',
        'LCSC API credentials',
        'browser sessions',
        'Codex auth.json'
    )
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputRootPath 'manifest.json') -Encoding utf8

Write-Host "Backup completed: $outputRootPath"
Write-Host ("CloudBase rows: users={0}, materials={1}, audit={2}, login_attempts={3}" -f $cloudBaseCounts.users, $cloudBaseCounts.material_library, $cloudBaseCounts.audit_log, $cloudBaseCounts.login_attempts)
