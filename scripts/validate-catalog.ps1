param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Error([string]$Message) { $script:errors.Add($Message) }
function Add-Warning([string]$Message) { $script:warnings.Add($Message) }

function Get-JsonValue($Object, [string]$Name) {
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop -or $null -eq $prop.Value) { return "" }
  return [string]$prop.Value
}

function Resolve-RepoPath([string]$RelativePath) {
  if ([string]::IsNullOrWhiteSpace($RelativePath)) { return $null }
  if ($RelativePath -match "^[a-zA-Z]+:" -or $RelativePath.StartsWith("/") -or $RelativePath.Contains("..")) {
    return $null
  }
  $resolved = $Root
  foreach ($part in ($RelativePath -split "/")) {
    if ([string]::IsNullOrWhiteSpace($part)) { return $null }
    $resolved = Join-Path $resolved $part
  }
  return $resolved
}

$manifestPath = Join-Path (Join-Path $Root "websites") "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Add-Error "Missing websites/manifest.json"
} else {
  try {
    $games = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  } catch {
    Add-Error "websites/manifest.json is not valid JSON: $($_.Exception.Message)"
    $games = @()
  }

  if ($null -eq $games -or $games.Count -eq 0) {
    Add-Error "Catalog is empty."
  }

  $ids = New-Object System.Collections.Generic.HashSet[string]
  $slugs = New-Object System.Collections.Generic.HashSet[string]

  foreach ($game in $games) {
    foreach ($field in @("id", "title", "slug", "url", "cover", "addedAt")) {
      if ([string]::IsNullOrWhiteSpace((Get-JsonValue $game $field))) {
        Add-Error "Catalog entry is missing '$field': $($game | ConvertTo-Json -Compress)"
      }
    }

    $id = Get-JsonValue $game "id"
    $slug = Get-JsonValue $game "slug"
    $url = Get-JsonValue $game "url"
    $cover = Get-JsonValue $game "cover"

    if ($id -and -not $ids.Add($id)) {
      Add-Error "Duplicate game id '$id'."
    }
    if ($slug -and -not $slugs.Add($slug)) {
      Add-Error "Duplicate game slug '$slug'."
    }
    if ($url -and $url -notmatch "^websites/[A-Za-z0-9._-]+\.html$") {
      Add-Error "Unsafe or unsupported game URL for '$id': $url"
    }

    $urlPath = Resolve-RepoPath $url
    if ($null -eq $urlPath -or -not (Test-Path -LiteralPath $urlPath)) {
      Add-Error "Missing game file for '$id': $url"
    }

    $coverPath = Resolve-RepoPath $cover
    if ($null -eq $coverPath -or -not (Test-Path -LiteralPath $coverPath)) {
      Add-Error "Missing cover for '$id': $cover"
    } elseif ((Get-Item -LiteralPath $coverPath).Length -gt 512KB) {
      Add-Warning "Large cover asset for '$id': $cover"
    }
  }

  $indexPath = Join-Path $Root "index.html"
  if (Test-Path -LiteralPath $indexPath) {
    $fallbackRows = @()
    foreach ($line in Get-Content -LiteralPath $indexPath) {
      $match = [regex]::Match($line, 'id:"([^"]+)".*url:"([^"]+)".*cover:"([^"]*)"')
      if ($match.Success) {
        $fallbackRows += [pscustomobject]@{
          id = $match.Groups[1].Value
          url = $match.Groups[2].Value
          cover = $match.Groups[3].Value
        }
      }
    }

    if ($fallbackRows.Count -ne $games.Count) {
      Add-Error "FALLBACK_GAMES count ($($fallbackRows.Count)) does not match manifest count ($($games.Count))."
    }

    foreach ($game in $games) {
      $id = Get-JsonValue $game "id"
      $url = Get-JsonValue $game "url"
      $cover = Get-JsonValue $game "cover"
      $fallback = $fallbackRows | Where-Object { $_.id -eq $id } | Select-Object -First 1
      if ($null -eq $fallback) {
        Add-Error "FALLBACK_GAMES is missing '$id'."
      } elseif ($fallback.url -ne $url -or $fallback.cover -ne $cover) {
        Add-Error "FALLBACK_GAMES is stale for '$id'."
      }
    }
  } else {
    Add-Error "Missing index.html"
  }
}

$dotnetPath = Join-Path (Join-Path $Root "websites") "dotnet"
if (Test-Path -LiteralPath $dotnetPath) {
  Add-Error "Local runtime folder should not live under websites/: websites/dotnet"
}

foreach ($warning in $warnings) {
  Write-Warning $warning
}

if ($errors.Count) {
  Write-Host "Catalog validation failed:" -ForegroundColor Red
  foreach ($errorItem in $errors) {
    Write-Host " - $errorItem" -ForegroundColor Red
  }
  exit 1
}

Write-Host "Catalog validation passed for $($games.Count) games." -ForegroundColor Green
