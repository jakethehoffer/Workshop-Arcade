param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$Fix
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

function Get-JsString([string]$Value) {
  return '"' + (($Value -replace '\\', '\\') -replace '"', '\"') + '"'
}

function Get-JsArray($Values) {
  $items = @($Values | ForEach-Object { Get-JsString ([string]$_) })
  return "[" + ($items -join ",") + "]"
}

function Get-FallbackJson($Games) {
  $rows = New-Object System.Collections.Generic.List[string]
  foreach ($game in $Games) {
    $id = Get-JsonValue $game "id"
    $defaultUrl = "websites/$id.html"
    $defaultCover = "covers/$id.svg"
    $url = Get-JsonValue $game "url"
    $cover = Get-JsonValue $game "cover"
    $coverId = if ($cover -match '^covers/([^/]+)\.svg$') { $Matches[1] } else { $cover }
    $items = @(
      (ConvertTo-Json -InputObject $id -Compress),
      (ConvertTo-Json -InputObject (Get-JsonValue $game "title") -Compress),
      (ConvertTo-Json -InputObject ([object[]]@($game.tags)) -Compress),
      (ConvertTo-Json -InputObject (Get-JsonValue $game "addedAt") -Compress),
      ([string][int]$game.popularity)
    )
    if ($url -ne $defaultUrl -or $cover -ne $defaultCover) {
      if ($url -ne $defaultUrl) {
        $items += (ConvertTo-Json -InputObject $url -Compress)
      } else {
        $items += "null"
      }
      if ($cover -ne $defaultCover) {
        $items += (ConvertTo-Json -InputObject $coverId -Compress)
      }
    }
    $rows.Add("[" + ($items -join ",") + "]") | Out-Null
  }
  return "[" + ($rows -join ",") + "]"
}

function Get-JsSingleQuotedString([string]$Value) {
  return "'" + (($Value -replace "\\", "\\") -replace "'", "\'") + "'"
}

function Update-FallbackCatalog($Games, [string]$IndexPath) {
  $indexText = Get-Content -Raw -LiteralPath $IndexPath
  $fallbackJson = Get-FallbackJson $Games
  $fallback = "const FALLBACK_GAMES = JSON.parse($(Get-JsSingleQuotedString $fallbackJson)).map(r=>({id:r[0],title:r[1],subtitle:'',tags:r[2],slug:r[0],url:r[5]||'websites/'+r[0]+'.html',cover:'covers/'+(r[6]||r[0])+'.svg',addedAt:r[3],popularity:r[4]}));"
  $pattern = '(?s)const FALLBACK_GAMES = (?:JSON\.parse\(''.*?''\)(?:\.map\([^;]+?\))?|\[.*?\]);'
  if ($indexText -notmatch $pattern) {
    Add-Error "Could not find FALLBACK_GAMES block in index.html."
    return
  }
  $updated = [regex]::Replace($indexText, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $fallback }, 1)
  if ($updated -ne $indexText) {
    Set-Content -LiteralPath $IndexPath -Value $updated -NoNewline
    Write-Host "Updated FALLBACK_GAMES from websites/manifest.json." -ForegroundColor Cyan
  }
}

function Update-CatalogCsp([string]$IndexPath) {
  $generatorPath = Join-Path $PSScriptRoot "catalog-csp.mjs"
  & node $generatorPath $IndexPath
  if ($LASTEXITCODE -ne 0) {
    Add-Error "Could not refresh the catalog CSP after updating FALLBACK_GAMES."
  }
}

function Resolve-ResourcePath([string]$GameUrl, [string]$Resource) {
  if ([string]::IsNullOrWhiteSpace($Resource)) { return $null }
  $clean = ($Resource -split "[?#]")[0]
  if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
  if ($clean -match "^(data|blob|mailto|tel|javascript):") { return "external" }
  if ($clean -match "^https?://") { return "remote" }
  if ($clean.StartsWith("//")) { return "remote" }

  $baseDir = Split-Path -Parent $GameUrl
  $relative = if ($clean.StartsWith("/")) { $clean.TrimStart("/") } else { ($baseDir + "/" + $clean) }
  $relative = $relative -replace "\\", "/"

  $segments = New-Object System.Collections.Generic.List[string]
  foreach ($segment in ($relative -split "/")) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq ".") { continue }
    if ($segment -eq "..") {
      if ($segments.Count -eq 0) { return $null }
      $segments.RemoveAt($segments.Count - 1)
    } else {
      $segments.Add($segment)
    }
  }
  return Resolve-RepoPath ($segments -join "/")
}

function Test-Subresources($Game) {
  $gameId = Get-JsonValue $Game "id"
  $url = Get-JsonValue $Game "url"
  $gamePath = Resolve-RepoPath $url
  if ($null -eq $gamePath -or -not (Test-Path -LiteralPath $gamePath)) { return }

  $html = Get-Content -Raw -LiteralPath $gamePath
  $pattern = '<(?<tag>script|link|img|audio|video|source)\b[^>]*(?<attr>src|href)=["''](?<value>[^"'']+)["'']'
  foreach ($match in [regex]::Matches($html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $tag = $match.Groups["tag"].Value.ToLowerInvariant()
    $resource = $match.Groups["value"].Value
    $fullMatch = $match.Value
    # <link rel="canonical|alternate"> intentionally points to the live
    # deployment for SEO / feed-reader metadata; not a subresource fetch.
    if ($tag -eq "link" -and $fullMatch -match 'rel=["''](canonical|alternate)["'']') { continue }
    $resolved = Resolve-ResourcePath $url $resource
    if ($resolved -eq "external") { continue }
    if ($resolved -eq "remote") {
      if ($tag -eq "script") {
        Add-Error "Remote script is not allowed in '$gameId': $resource"
      } elseif ($resource -match "google-analytics|googletagmanager|doubleclick|facebook|meta\.com") {
        Add-Error "Remote tracker is not allowed in '$gameId': $resource"
      } else {
        Add-Warning "Remote asset in '$gameId': $resource"
      }
      continue
    }
    if ($null -eq $resolved -or -not (Test-Path -LiteralPath $resolved)) {
      Add-Error "Missing local subresource for '$gameId': $resource"
    }
  }

  $cssImportPattern = '@import\s+(?:url\()?["'']?(?<value>[^"''\);]+)'
  foreach ($match in [regex]::Matches($html, $cssImportPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $resource = $match.Groups["value"].Value.Trim()
    $resolved = Resolve-ResourcePath $url $resource
    if ($resolved -eq "external") { continue }
    if ($resolved -eq "remote") {
      Add-Error "Remote CSS import is not allowed in '$gameId': $resource"
      continue
    }
    if ($null -eq $resolved -or -not (Test-Path -LiteralPath $resolved)) {
      Add-Error "Missing local CSS import for '$gameId': $resource"
    }
  }
}

$manifestPath = Join-Path (Join-Path $Root "websites") "manifest.json"
$indexPath = Join-Path $Root "index.html"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  Add-Error "Missing websites/manifest.json"
  $games = @()
} else {
  try {
    $games = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  } catch {
    Add-Error "websites/manifest.json is not valid JSON: $($_.Exception.Message)"
    $games = @()
  }
}

if ($null -eq $games -or $games.Count -eq 0) {
  Add-Error "Catalog is empty."
}

if ($Fix -and (Test-Path -LiteralPath $indexPath) -and $errors.Count -eq 0) {
  Update-FallbackCatalog $games $indexPath
  if ($errors.Count -eq 0) {
    Update-CatalogCsp $indexPath
  }
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

  Test-Subresources $game
}

if (Test-Path -LiteralPath $indexPath) {
  $fallbackRows = @()
  $indexText = Get-Content -Raw -LiteralPath $indexPath
  $compactMatch = [regex]::Match($indexText, "const FALLBACK_GAMES = JSON\.parse\('(?<json>.*?)'\)(?:\.map\([^;]+?\))?;", [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($compactMatch.Success) {
    try {
      $parsedFallback = (ConvertFrom-Json -InputObject ('{"rows":' + $compactMatch.Groups["json"].Value + '}')).rows
      $fallbackRows = @()
      foreach ($row in $parsedFallback) {
        if ($row -is [System.Array]) {
          $rowId = [string]$row[0]
          $rowUrl = if ($row.Count -gt 5 -and $null -ne $row[5] -and [string]$row[5] -ne "") { [string]$row[5] } else { "websites/$rowId.html" }
          $rowCoverId = if ($row.Count -gt 6 -and $null -ne $row[6] -and [string]$row[6] -ne "") { [string]$row[6] } else { $rowId }
          $fallbackRows += [pscustomobject]@{
            id = $rowId
            url = $rowUrl
            cover = "covers/$rowCoverId.svg"
          }
        } else {
          $fallbackRows += $row
        }
      }
    } catch {
      Add-Error "FALLBACK_GAMES compact JSON could not be parsed. Run scripts/validate-catalog.ps1 -Fix."
    }
  } else {
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
  }

  if ($fallbackRows.Count -ne $games.Count) {
    Add-Error "FALLBACK_GAMES count ($($fallbackRows.Count)) does not match manifest count ($($games.Count)). Run scripts/validate-catalog.ps1 -Fix."
  }

  foreach ($game in $games) {
    $id = Get-JsonValue $game "id"
    $url = Get-JsonValue $game "url"
    $cover = Get-JsonValue $game "cover"
    $fallback = $fallbackRows | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if ($null -eq $fallback) {
      Add-Error "FALLBACK_GAMES is missing '$id'. Run scripts/validate-catalog.ps1 -Fix."
    } elseif ($fallback.url -ne $url -or $fallback.cover -ne $cover) {
      Add-Error "FALLBACK_GAMES is stale for '$id'. Run scripts/validate-catalog.ps1 -Fix."
    }
  }
} else {
  Add-Error "Missing index.html"
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
