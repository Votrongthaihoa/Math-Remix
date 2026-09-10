@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Codex Chrome Control - SAFE Repair + Run

set "CODEX_HOME=C:\Users\LENOVO\.antigravity_cockpit\instances\codex\cli-api-service-dd70b6f4c0cf"
set "PROJECT_DIR=D:\Aeck_Pre"
set "PROMPT_FILE=%~dp0PROMPT_CODEX_CHROME_REPAIR.txt"

echo ============================================================
echo  CODEX CHROME CONTROL - SAFE REPAIR (NO CHROME KILL)
echo  CODEX_HOME=%CODEX_HOME%
echo  PROJECT=%PROJECT_DIR%
echo ============================================================
echo.
echo Chrome will NOT be force-closed. Only extension-host and related Codex runtime locks are handled.
echo Backups and logs will be stored inside CODEX_HOME.
echo This script does NOT disable or bypass Codex/Chrome safety checks.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Stop'; try { $raw=[IO.File]::ReadAllText('%~f0'); $marker=':__POWER'+'SHELL_PAYLOAD__'; $i=$raw.IndexOf($marker); if($i -lt 0){throw 'Embedded PowerShell marker missing'}; $code=$raw.Substring($i+$marker.Length); $payload=[ScriptBlock]::Create($code); & $payload; if(-not $?){exit 91}; exit 0 } catch { [Console]::Error.WriteLine(('[ERROR] Repair payload failed: '+$_.Exception.Message)); exit 91 }"

set "REPAIR_RC=%ERRORLEVEL%"
echo.
if not "%REPAIR_RC%"=="0" (
    echo [WARN] Repair phase returned code %REPAIR_RC%.
    echo        Codex will still be opened so you can use the diagnostic prompt.
) else (
    echo [OK] Local repair phase completed in SAFE mode.
)

if exist "%PROMPT_FILE%" (
    powershell.exe -NoLogo -NoProfile -Command "Get-Content -LiteralPath '%PROMPT_FILE%' -Raw | Set-Clipboard" >nul 2>&1
    echo [OK] Repair prompt copied to clipboard. Paste it into Codex if deeper repair is needed.
)

if /I "%~1"=="repair-only" (
    echo [OK] Repair-only mode requested; Codex will not be started from this batch.
    exit /b %REPAIR_RC%
)

if not exist "%PROJECT_DIR%" (
    echo [ERROR] Project directory does not exist: %PROJECT_DIR%
    pause
    exit /b 20
)

echo.
echo Starting Codex with the requested environment...
cd /d "%PROJECT_DIR%"
set "CODEX_HOME=C:\Users\LENOVO\.antigravity_cockpit\instances\codex\cli-api-service-dd70b6f4c0cf"
codex
exit /b %ERRORLEVEL%

:__POWERSHELL_PAYLOAD__
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$CodexHome = $env:CODEX_HOME
$ProjectDir = $env:PROJECT_DIR
if ([string]::IsNullOrWhiteSpace($CodexHome)) { throw 'CODEX_HOME is empty.' }
if (-not (Test-Path -LiteralPath $CodexHome)) { throw "CODEX_HOME does not exist: $CodexHome" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $CodexHome "repair-backups\$stamp"
$logDir = Join-Path $CodexHome 'repair-logs'
$logFile = Join-Path $logDir "chrome-repair-$stamp.log"
New-Item -ItemType Directory -Force -Path $backupDir, $logDir | Out-Null

function Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Backup-Path([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $safe = ($Path -replace '[:\\\/]+','_').Trim('_')
    $dest = Join-Path $backupDir $safe
    try {
        $item = Get-Item -LiteralPath $Path -Force
        if ($item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            Copy-Item -LiteralPath $Path -Destination $dest -Recurse -Force
        } else {
            Copy-Item -LiteralPath $Path -Destination $dest -Force
        }
        Log "Backup: $Path -> $dest"
    } catch {
        Log "Backup warning for $Path : $($_.Exception.Message)"
    }
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $dir = Split-Path -Parent $Path
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $Text, $enc)
}

function Copy-PlainTree([string]$Source, [string]$Destination) {
    if (-not (Test-Path -LiteralPath $Source)) { throw "Source tree does not exist: $Source" }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $sourceRoot = (Get-Item -LiteralPath $Source -Force).FullName.TrimEnd('\')
    foreach ($dir in @(Get-ChildItem -LiteralPath $Source -Directory -Recurse -Force -ErrorAction Stop)) {
        $relative = $dir.FullName.Substring($sourceRoot.Length).TrimStart('\')
        New-Item -ItemType Directory -Force -Path (Join-Path $Destination $relative) | Out-Null
    }
    foreach ($file in @(Get-ChildItem -LiteralPath $Source -File -Recurse -Force -ErrorAction Stop)) {
        $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\')
        $target = Join-Path $Destination $relative
        $targetDir = Split-Path -Parent $target
        if ($targetDir) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
        # WindowsApps may mark the source tree as EFS-encrypted. Reading bytes
        # and writing a new ordinary cache file avoids copying that attribute.
        [IO.File]::WriteAllBytes($target, [IO.File]::ReadAllBytes($file.FullName))
    }
}

function Try-Run([string]$Label, [scriptblock]$Action) {
    try {
        Log "RUN: $Label"
        $global:LASTEXITCODE = 0
        $out = & $Action 2>&1
        if ($out) {
            $out | ForEach-Object { Add-Content -LiteralPath $logFile -Value ("    " + $_.ToString()) -Encoding UTF8 }
        }
        if ($LASTEXITCODE -ne 0) { throw "process exited with code $LASTEXITCODE" }
        Log "OK: $Label"
        return $true
    } catch {
        Log "WARN: $Label -> $($_.Exception.Message)"
        return $false
    }
}

function Get-LatestFile([string[]]$Roots, [string]$Filter) {
    $all = @()
    foreach ($r in $Roots) {
        if (Test-Path -LiteralPath $r) {
            try {
                $all += Get-ChildItem -LiteralPath $r -Recurse -File -Filter $Filter -ErrorAction SilentlyContinue
            } catch {}
        }
    }
    $all | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Get-ExistingPathFromJson([string[]]$JsonFiles, [string]$PropertyName) {
    foreach ($jf in $JsonFiles) {
        if (-not (Test-Path -LiteralPath $jf)) { continue }
        try {
            $obj = Get-Content -LiteralPath $jf -Raw | ConvertFrom-Json
            $stack = New-Object System.Collections.Stack
            $stack.Push($obj)
            while ($stack.Count -gt 0) {
                $cur = $stack.Pop()
                if ($null -eq $cur) { continue }
                if ($cur -is [System.Collections.IEnumerable] -and -not ($cur -is [string]) -and -not ($cur -is [pscustomobject])) {
                    foreach ($x in $cur) { if ($null -ne $x) { $stack.Push($x) } }
                    continue
                }
                if ($cur -is [pscustomobject]) {
                    foreach ($p in $cur.PSObject.Properties) {
                        if ($p.Name -eq $PropertyName -and $p.Value -is [string] -and (Test-Path -LiteralPath $p.Value)) {
                            return [string]$p.Value
                        }
                        if ($p.Value -is [pscustomobject] -or ($p.Value -is [System.Collections.IEnumerable] -and -not ($p.Value -is [string]))) {
                            $stack.Push($p.Value)
                        }
                    }
                }
            }
        } catch {}
    }
    return $null
}

function Patch-JsonKnownPaths([string]$JsonPath, [hashtable]$Replacements, [string]$BrowserHash) {
    if (-not (Test-Path -LiteralPath $JsonPath)) { return $false }
    Backup-Path $JsonPath
    try { $obj = Get-Content -LiteralPath $JsonPath -Raw | ConvertFrom-Json } catch {
        Log "JSON parse failed, leaving untouched: $JsonPath"
        return $false
    }

    $script:__CodexChromePatchChanged = $false
    function Recurse($node) {
        if ($null -eq $node) { return }
        if ($node -is [System.Collections.IEnumerable] -and -not ($node -is [string]) -and -not ($node -is [pscustomobject])) {
            foreach ($x in $node) { Recurse $x }
            return
        }
        if ($node -isnot [pscustomobject]) { return }
        foreach ($prop in @($node.PSObject.Properties)) {
            $name = $prop.Name
            if ($Replacements.ContainsKey($name) -and $Replacements[$name]) {
                $old = $prop.Value
                $new = $Replacements[$name]
                if ($old -is [string] -and $old -ne $new) {
                    $prop.Value = $new
                    $script:__CodexChromePatchChanged = $true
                }
            } elseif ($name -eq 'trustedBrowserClientSha256s' -and $BrowserHash) {
                $prop.Value = @($BrowserHash)
                $script:__CodexChromePatchChanged = $true
            } else {
                Recurse $prop.Value
            }
        }
    }

    Recurse $obj
    if ($script:__CodexChromePatchChanged) {
        $json = $obj | ConvertTo-Json -Depth 100
        Write-Utf8NoBom $JsonPath $json
        try { Get-Content -LiteralPath $JsonPath -Raw | ConvertFrom-Json | Out-Null } catch {
            throw "Patched JSON became invalid: $JsonPath"
        }
        Log "Patched known current paths in: $JsonPath"
    } else {
        Log "No known-path changes needed in: $JsonPath"
    }
    $result = $script:__CodexChromePatchChanged
    Remove-Variable __CodexChromePatchChanged -Scope Script -ErrorAction SilentlyContinue
    return $result
}

Log "Starting repair. CODEX_HOME=$CodexHome"
Log "Project=$ProjectDir"
Log "BackupDir=$backupDir"

$nativeManifest = Join-Path $env:LOCALAPPDATA 'OpenAI\extension\com.openai.codexextension.json'
$localV2 = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\chrome-native-hosts-v2.json'
$homeV2 = Join-Path $CodexHome 'chrome-native-hosts-v2.json'
$defaultV2 = Join-Path $env:USERPROFILE '.codex\chrome-native-hosts-v2.json'
$v2Candidates = @($homeV2, $localV2, $defaultV2) | Select-Object -Unique

# 1) Inventory before changes
$codexCmd = Get-Command codex -ErrorAction SilentlyContinue
if ($codexCmd) {
    Log "codex command: $($codexCmd.Source)"
    Try-Run 'codex --version' { & $codexCmd.Source --version } | Out-Null
    Try-Run 'codex plugin list --json (pre)' { & $codexCmd.Source plugin list --json } | Out-Null
} else {
    Log 'WARN: codex command not found on PATH.'
}

# 2) Stop only the owned extension host lock holder SAFELY.
# IMPORTANT: Chrome and the Codex/Node agent services are intentionally NOT
# terminated. In particular, do not kill a node.exe merely because its command
# line mentions CODEX_HOME: that can be the browser-control session itself.
Log 'SAFE MODE: Chrome will not be force-closed.'
try {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -ieq 'extension-host.exe' -and
            $_.CommandLine -and
            ($_.CommandLine.IndexOf($CodexHome, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
             $_.CommandLine.IndexOf((Join-Path $CodexHome 'plugins\cache\openai-bundled\chrome'), [StringComparison]::OrdinalIgnoreCase) -ge 0)
        }
    foreach ($p in $procs) {
        try {
            Invoke-CimMethod -InputObject $p -MethodName Terminate | Out-Null
            Log "Stopped related process $($p.Name) PID=$($p.ProcessId)"
        } catch {}
    }
} catch {}

$chromeWasRunning = [bool](Get-Process chrome -ErrorAction SilentlyContinue)
if ($chromeWasRunning) {
    Log 'Chrome is currently running and will be left open.'
}

# 3) Back up critical state
foreach ($p in @(
    (Join-Path $CodexHome 'config.toml'),
    $nativeManifest,
    $homeV2,
    $localV2
)) { Backup-Path $p }

# 4) Preserve the bundled marketplace. A previous repair could have rotated it
# away before plugin reconciliation, leaving the configured marketplace empty.
# Restore the newest intact backup when the configured marketplace is missing.
$tmpMarket = Join-Path $CodexHome '.tmp\bundled-marketplaces'
$tmpOpenAi = Join-Path $tmpMarket 'openai-bundled'
$marketplaceManifest = Join-Path $tmpOpenAi '.agents\plugins\marketplace.json'
if (-not (Test-Path -LiteralPath $marketplaceManifest)) {
    $backupRoots = Get-ChildItem -LiteralPath (Join-Path $CodexHome '.tmp') -Directory -Filter 'bundled-marketplaces.bak.*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    $restoreRoot = $null
    foreach ($backupRoot in $backupRoots) {
        $candidate = Join-Path $backupRoot.FullName 'openai-bundled'
        if (Test-Path -LiteralPath (Join-Path $candidate '.agents\plugins\marketplace.json')) {
            $restoreRoot = $candidate
            break
        }
    }
    if ($restoreRoot -and -not (Test-Path -LiteralPath $tmpOpenAi)) {
        New-Item -ItemType Directory -Force -Path $tmpMarket | Out-Null
        Copy-Item -LiteralPath $restoreRoot -Destination $tmpOpenAi -Recurse -Force
        Log "Restored bundled marketplace: $restoreRoot -> $tmpOpenAi"
    } elseif ($restoreRoot) {
        Log "SAFE-SKIP: bundled marketplace directory exists but is missing its manifest; it was not overwritten: $tmpOpenAi"
    }
}
if (Test-Path -LiteralPath $marketplaceManifest) {
    Log "Bundled marketplace validated: $marketplaceManifest"
} else {
    Log "WARN: bundled marketplace manifest is missing: $marketplaceManifest"
}

# 5) Do not mutate the marketplace during local repair.
# The installed instance already has a complete Chrome bundle; this avoids the
# known failure where CLI 0.153.x cannot resolve chrome@openai-bundled from the
# local marketplace and prevents an unnecessary plugin rotation.
Log 'Skipping codex plugin add: using the existing complete Chrome bundle.'

# 6) Reconcile the cache with the installed Codex App bundle when available.
# The Windows AppX resources are the local source of truth after an app update;
# the cache can otherwise retain an older native-host/browser-client pair.
$chromeRoot = Join-Path $CodexHome 'plugins\cache\openai-bundled\chrome'
if (-not (Test-Path -LiteralPath $chromeRoot)) {
    New-Item -ItemType Directory -Force -Path $chromeRoot | Out-Null
}

$appxChromePlugin = $null
try {
    $appx = Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue |
        Sort-Object Version -Descending | Select-Object -First 1
    if ($appx) {
        $candidate = Join-Path $appx.InstallLocation 'app\resources\plugins\openai-bundled\plugins\chrome'
        if (Test-Path -LiteralPath (Join-Path $candidate '.codex-plugin\plugin.json')) {
            $appxChromePlugin = $candidate
        }
    }
} catch {
    Log "WARN: could not inspect installed Codex App bundle: $($_.Exception.Message)"
}

if ($appxChromePlugin) {
    try {
        $appxPluginMeta = Get-Content -LiteralPath (Join-Path $appxChromePlugin '.codex-plugin\plugin.json') -Raw | ConvertFrom-Json
        $appxPluginVersion = [string]$appxPluginMeta.version
        $appxVersionDir = Join-Path $chromeRoot $appxPluginVersion
        $appxRequired = @(
            (Join-Path $appxChromePlugin '.codex-plugin\plugin.json'),
            (Join-Path $appxChromePlugin 'scripts\browser-client.mjs'),
            (Join-Path $appxChromePlugin 'scripts\browser-service.mjs'),
            (Join-Path $appxChromePlugin 'extension-host\windows\x64\extension-host.exe')
        )
        if ($appxPluginVersion -and (($appxRequired | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -eq 0)) {
            $cacheRequired = @(
                (Join-Path $appxVersionDir '.codex-plugin\plugin.json'),
                (Join-Path $appxVersionDir 'scripts\browser-client.mjs'),
                (Join-Path $appxVersionDir 'scripts\browser-service.mjs'),
                (Join-Path $appxVersionDir 'extension-host\windows\x64\extension-host.exe')
            )
            $cacheNeedsSync = (($cacheRequired | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -gt 0)
            if (-not $cacheNeedsSync) {
                $cacheClientHash = (Get-FileHash -LiteralPath (Join-Path $appxVersionDir 'scripts\browser-client.mjs') -Algorithm SHA256).Hash
                $appxClientHash = (Get-FileHash -LiteralPath (Join-Path $appxChromePlugin 'scripts\browser-client.mjs') -Algorithm SHA256).Hash
                $cacheNeedsSync = $cacheClientHash -ne $appxClientHash
            }
            if ($cacheNeedsSync) {
                $syncBackup = Join-Path $backupDir "appx-chrome-$appxPluginVersion"
                if (Test-Path -LiteralPath $appxVersionDir) {
                    Copy-Item -LiteralPath $appxVersionDir -Destination $syncBackup -Recurse -Force
                    Log "Backed up stale cache Chrome bundle: $appxVersionDir -> $syncBackup"
                }
                $stage = Join-Path $chromeRoot ".staging-$appxPluginVersion-$stamp"
                if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
                Copy-PlainTree $appxChromePlugin $stage
                if (Test-Path -LiteralPath $appxVersionDir) { Remove-Item -LiteralPath $appxVersionDir -Recurse -Force }
                Move-Item -LiteralPath $stage -Destination $appxVersionDir -Force
                Log "Synchronized official AppX Chrome bundle: $appxChromePlugin -> $appxVersionDir"
            } else {
                Log "Official AppX Chrome bundle already synchronized: $appxVersionDir"
            }
        } else {
            Log "WARN: AppX Chrome bundle is incomplete or has no version: $appxChromePlugin"
        }
    } catch {
        Log "WARN: AppX Chrome bundle sync failed: $($_.Exception.Message)"
    }
} else {
    Log 'WARN: installed Codex App Chrome bundle was not found; using cache only.'
}

# Keep the Browser service used by node_repl on the same AppX/plugin build as
# the Chrome client. A stale browser-service path makes setupBrowserRuntime()
# close its transport even when native-host diagnostics pass.
$browserRoot = Join-Path $CodexHome 'plugins\cache\openai-bundled\browser'
if (-not (Test-Path -LiteralPath $browserRoot)) {
    New-Item -ItemType Directory -Force -Path $browserRoot | Out-Null
}
$trustedBrowserServicePath = $null
if ($appx) {
    try {
        $appxBrowserPlugin = Join-Path $appx.InstallLocation 'app\resources\plugins\openai-bundled\plugins\browser'
        $browserMetaPath = Join-Path $appxBrowserPlugin '.codex-plugin\plugin.json'
        $appxBrowserMeta = if (Test-Path -LiteralPath $browserMetaPath) { Get-Content -LiteralPath $browserMetaPath -Raw | ConvertFrom-Json } else { $null }
        $appxBrowserVersion = if ($appxBrowserMeta) { [string]$appxBrowserMeta.version } else { $null }
        $appxBrowserVersionDir = if ($appxBrowserVersion) { Join-Path $browserRoot $appxBrowserVersion } else { $null }
        $browserRequired = @(
            (Join-Path $appxBrowserPlugin '.codex-plugin\plugin.json'),
            (Join-Path $appxBrowserPlugin 'scripts\browser-client.mjs'),
            (Join-Path $appxBrowserPlugin 'scripts\browser-service.mjs')
        )
        if ($appxBrowserVersionDir -and (($browserRequired | Where-Object { -not (Test-Path -LiteralPath $_) }).Count -eq 0)) {
            $cachedBrowserClient = Join-Path $appxBrowserVersionDir 'scripts\browser-client.mjs'
            $syncBrowser = -not (Test-Path -LiteralPath $cachedBrowserClient)
            if (-not $syncBrowser) {
                $syncBrowser = (Get-FileHash -LiteralPath $cachedBrowserClient -Algorithm SHA256).Hash -ne
                    (Get-FileHash -LiteralPath (Join-Path $appxBrowserPlugin 'scripts\browser-client.mjs') -Algorithm SHA256).Hash
            }
            if ($syncBrowser) {
                $browserStage = Join-Path $browserRoot ".staging-$appxBrowserVersion-$stamp"
                Copy-PlainTree $appxBrowserPlugin $browserStage
                if (-not (Test-Path -LiteralPath $appxBrowserVersionDir)) {
                    Move-Item -LiteralPath $browserStage -Destination $appxBrowserVersionDir -Force
                } else {
                    Log "WARN: browser target appeared during sync; leaving target unchanged: $appxBrowserVersionDir"
                }
                Log "Synchronized official AppX Browser bundle: $appxBrowserPlugin -> $appxBrowserVersionDir"
            } else {
                Log "Official AppX Browser bundle already synchronized: $appxBrowserVersionDir"
            }
            $trustedBrowserServicePath = Join-Path $appxBrowserVersionDir 'scripts\browser-service.mjs'
        }
    } catch {
        Log "WARN: AppX Browser bundle sync failed: $($_.Exception.Message)"
    }
}
if (-not $trustedBrowserServicePath -or -not (Test-Path -LiteralPath $trustedBrowserServicePath)) {
    $browserService = Get-ChildItem -LiteralPath $browserRoot -Recurse -File -Filter 'browser-service.mjs' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($browserService) { $trustedBrowserServicePath = $browserService.FullName }
}
if (-not $trustedBrowserServicePath -or -not (Test-Path -LiteralPath $trustedBrowserServicePath)) {
    Log 'WARN: no browser-service.mjs found for node_repl trust configuration.'
}

$versionDirs = Get-ChildItem -LiteralPath $chromeRoot -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'latest' -and $_.Name -notlike '.staging-*' }

$complete = foreach ($d in $versionDirs) {
    $pluginJson = Join-Path $d.FullName '.codex-plugin\plugin.json'
    $browserClient = Join-Path $d.FullName 'scripts\browser-client.mjs'
    $hostExe = Join-Path $d.FullName 'extension-host\windows\x64\extension-host.exe'
    if ((Test-Path -LiteralPath $pluginJson) -and
        (Test-Path -LiteralPath $browserClient) -and
        (Test-Path -LiteralPath $hostExe)) {
        $v = $null
        try { $v = [version]$d.Name } catch { $v = [version]'0.0' }
        [pscustomobject]@{ Dir=$d; Version=$v }
    }
}

$selectedObj = $complete | Sort-Object Version -Descending | Select-Object -First 1
if (-not $selectedObj) { throw "No COMPLETE Chrome plugin version found under $chromeRoot" }
$selected = $selectedObj.Dir.FullName
Log "Selected COMPLETE Chrome plugin: $selected"

$latest = Join-Path $chromeRoot 'latest'
if (Test-Path -LiteralPath $latest) {
    try {
        $li = Get-Item -LiteralPath $latest -Force
        $targetInfo = if ($li.Target) { ($li.Target -join ';') } else { '<not a link or target unavailable>' }
        Write-Utf8NoBom (Join-Path $backupDir 'chrome-latest-target.txt') $targetInfo
        if ($li.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            cmd.exe /c "rmdir `"$latest`"" | Out-Null
        } else {
            $oldLatest = "$latest.dir.bak.$stamp"
            Move-Item -LiteralPath $latest -Destination $oldLatest -Force
            Log "Existing non-junction latest directory moved to $oldLatest"
        }
    } catch {
        Log "WARN: could not remove old latest: $($_.Exception.Message)"
    }
}
New-Item -ItemType Junction -Path $latest -Target $selected -Force | Out-Null
Log "Recreated junction: $latest -> $selected"

$browserClientPath = Join-Path $latest 'scripts\browser-client.mjs'
$browserServicePath = Join-Path $latest 'scripts\browser-service.mjs'
$extensionHostPath = Join-Path $latest 'extension-host\windows\x64\extension-host.exe'
if (-not (Test-Path -LiteralPath $browserClientPath)) { throw "Missing browser-client through latest: $browserClientPath" }
if (-not (Test-Path -LiteralPath $extensionHostPath)) { throw "Missing extension host through latest: $extensionHostPath" }
$browserHash = (Get-FileHash -LiteralPath $browserClientPath -Algorithm SHA256).Hash
Log "browser-client SHA256=$browserHash"

# 7) Discover current runtime paths. Prefer the newest COMPLETE runtime so a
# stale v2 entry cannot silently put the browser bridge back on a partial
# runtime that is missing node.exe or node_modules.
$codexCliPath = $null
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes\cua_node'
$completeRuntimes = @()
if (Test-Path -LiteralPath $runtimeRoot) {
    $completeRuntimes = @(Get-ChildItem -LiteralPath $runtimeRoot -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike '.staging-*' } |
        ForEach-Object {
            $runtimeDir = $_.FullName
            $candidateNode = Join-Path $runtimeDir 'bin\node.exe'
            $candidateRepl = Join-Path $runtimeDir 'bin\node_repl.exe'
            $candidateModules = Join-Path $runtimeDir 'bin\node_modules'
            if ((Test-Path -LiteralPath $candidateNode) -and
                (Test-Path -LiteralPath $candidateRepl) -and
                (Test-Path -LiteralPath $candidateModules)) {
                [pscustomobject]@{
                    Root = $runtimeDir
                    Node = $candidateNode
                    Repl = $candidateRepl
                    Modules = $candidateModules
                    LastWriteTime = $_.LastWriteTime
                }
            }
        } | Sort-Object LastWriteTime -Descending)
}

$selectedRuntime = $completeRuntimes | Select-Object -First 1
$nodePath = if ($selectedRuntime) { $selectedRuntime.Node } else { Get-ExistingPathFromJson $v2Candidates 'nodePath' }
$nodeReplPath = if ($selectedRuntime) { $selectedRuntime.Repl } else { Get-ExistingPathFromJson $v2Candidates 'nodeReplPath' }
$nodeModuleDir = if ($selectedRuntime) { $selectedRuntime.Modules } else { $null }

# Prefer the newest hashed Codex binary shipped by the current desktop install;
# the un-hashed compatibility binary may still exist but can be several builds
# behind (and was the stale path in the existing v2 entry).
$codexBinRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
$codexCandidates = @()
if (Test-Path -LiteralPath $codexBinRoot) {
    $codexCandidates = @(Get-ChildItem -LiteralPath $codexBinRoot -Recurse -File -Filter 'codex.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending)
}
if ($codexCandidates.Count -gt 0) {
    $codexCliPath = $codexCandidates[0].FullName
} elseif ($codexCmd -and $codexCmd.Source -match '\.exe$' -and (Test-Path -LiteralPath $codexCmd.Source)) {
    $codexCliPath = $codexCmd.Source
} else {
    $codexCliPath = Get-ExistingPathFromJson $v2Candidates 'codexCliPath'
    if (-not $codexCliPath) {
        $f = Get-LatestFile @($codexBinRoot, $CodexHome) 'codex.exe'
        if ($f) { $codexCliPath = $f.FullName }
    }
}

if (-not $nodeReplPath) {
    $f = Get-LatestFile @((Join-Path $env:LOCALAPPDATA 'OpenAI\Codex'), $CodexHome) 'node_repl.exe'
    if ($f) { $nodeReplPath = $f.FullName }
}
if (-not $nodePath) {
    $roots = @((Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes'), (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex'), $CodexHome)
    $f = Get-LatestFile $roots 'node.exe'
    if ($f) { $nodePath = $f.FullName }
}
$resourcesPath = $null
if (-not $resourcesPath) {
    try {
        $appx = Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue |
            Sort-Object Version -Descending | Select-Object -First 1
        if ($appx) {
            $candidate = Join-Path $appx.InstallLocation 'app\resources'
            if (Test-Path -LiteralPath $candidate) { $resourcesPath = $candidate }
        }
    } catch {}
}

Log "codexCliPath=$codexCliPath"
Log "nodePath=$nodePath"
Log "nodeReplPath=$nodeReplPath"
Log "nodeModuleDir=$nodeModuleDir"
Log "resourcesPath=$resourcesPath"
Log "extensionHostPath=$extensionHostPath"

if (-not $codexCliPath -or -not (Test-Path -LiteralPath $codexCliPath)) { throw "Current Codex CLI binary was not found: $codexCliPath" }
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath)) { throw "Current Node binary was not found: $nodePath" }
if (-not $nodeReplPath -or -not (Test-Path -LiteralPath $nodeReplPath)) { throw "Current node-repl binary was not found: $nodeReplPath" }
if (-not $nodeModuleDir -or -not (Test-Path -LiteralPath $nodeModuleDir)) { throw "Current Node module directory was not found: $nodeModuleDir" }
if (-not $resourcesPath -or -not (Test-Path -LiteralPath $resourcesPath)) { throw "Current Codex resources path was not found: $resourcesPath" }

# 8) Repair Chrome Native Messaging manifest + HKCU registry
Backup-Path $nativeManifest
$allowedOrigins = @('chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/')
if (Test-Path -LiteralPath $nativeManifest) {
    try {
        $oldManifest = Get-Content -LiteralPath $nativeManifest -Raw | ConvertFrom-Json
        if ($oldManifest.allowed_origins) {
            $allowedOrigins = @($oldManifest.allowed_origins + $allowedOrigins | Select-Object -Unique)
        }
    } catch {}
}
$nativeObj = [ordered]@{
    name = 'com.openai.codexextension'
    description = 'ChatGPT Chrome native messaging host'
    path = $extensionHostPath
    type = 'stdio'
    allowed_origins = $allowedOrigins
}
Write-Utf8NoBom $nativeManifest ($nativeObj | ConvertTo-Json -Depth 8)
Log "Rebuilt native messaging manifest: $nativeManifest"

$regKey = 'HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension'
$regPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension'
$regOutput = & reg.exe add $regKey /ve /t REG_SZ /d $nativeManifest /f 2>&1
if ($regOutput) { $regOutput | ForEach-Object { Add-Content -LiteralPath $logFile -Value ("    " + $_.ToString()) -Encoding UTF8 } }
if ($LASTEXITCODE -ne 0) { throw "Failed to register Chrome Native Messaging Host (reg.exe exit $LASTEXITCODE)." }
Log "Registered HKCU NativeMessagingHost -> $nativeManifest"

# 9) Rebuild the schema-v1 host config beside the selected native host.
# This is the exact set of fields emitted by the bundled installer and keeps
# every runtime path tied to the same immutable plugin/runtime versions.
$hostConfigPath = Join-Path $selected 'extension-host\windows\x64\extension-host-config.json'
Backup-Path $hostConfigPath
$hostConfig = [ordered]@{
    schemaVersion = 1
    channel = 'prod'
    browserClientPath = $browserClientPath
    codexCliPath = $codexCliPath
    nodePath = $nodePath
    nodeReplPath = $nodeReplPath
    proxyHost = '127.0.0.1'
    proxyPort = 0
}
Write-Utf8NoBom $hostConfigPath ($hostConfig | ConvertTo-Json -Depth 8)
Log "Rebuilt schema-v1 host config: $hostConfigPath"

# 10) Patch any additional config files conservatively; do not invent unknown schema
$configCandidates = @()
try {
    $configCandidates += Get-ChildItem -LiteralPath $selected -Recurse -File -Filter 'extension-host-config.json' -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
} catch {}
$configCandidates = @($configCandidates | Select-Object -Unique)

$repl = @{
    'browserClientPath' = $browserClientPath
    'browserServicePath' = $(if (Test-Path -LiteralPath $browserServicePath) { $browserServicePath } else { $null })
    'codexCliPath' = $codexCliPath
    'codexHome' = $CodexHome
    'extensionHostPath' = $extensionHostPath
    'nodePath' = $nodePath
    'nodeReplPath' = $nodeReplPath
    'resourcesPath' = $resourcesPath
}
foreach ($cfg in $configCandidates) {
    Patch-JsonKnownPaths $cfg $repl $browserHash | Out-Null
}

# 11) Rebuild both schema-v2 app-server manifests from existing, valid paths.
# A stale entry can win selection even when a newer entry is also present, so
# keep one current entry for this active CODEX_HOME instead of patching stale
# entries in place.
$existingEntry = $null
foreach ($vf in @($v2Candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $vf)) { continue }
    try {
        $candidateDoc = Get-Content -LiteralPath $vf -Raw | ConvertFrom-Json
        foreach ($candidateEntry in @($candidateDoc.entries)) {
            if ($candidateEntry.paths -and [string]::Equals([string]$candidateEntry.paths.codexHome, $CodexHome, [StringComparison]::OrdinalIgnoreCase)) {
                $existingEntry = $candidateEntry
                break
            }
        }
    } catch {}
    if ($existingEntry) { break }
}

$entryId = if ($existingEntry -and $existingEntry.entryId) { [string]$existingEntry.entryId } else { 'codex-runtime-' + ([guid]::NewGuid().ToString('N')) }
$installId = if ($existingEntry -and $existingEntry.installId) { [string]$existingEntry.installId } else { 'codex-install-' + ([guid]::NewGuid().ToString('N')) }
$appVersion = $selectedObj.Dir.Name
$v2Paths = [ordered]@{
    browserClientPath = $browserClientPath
    browserServicePath = $browserServicePath
    codexCliPath = $codexCliPath
    codexHome = $CodexHome
    extensionHostPath = $extensionHostPath
    nodePath = $nodePath
    nodeModuleDirs = @($nodeModuleDir)
    nodeReplPath = $nodeReplPath
    resourcesPath = $resourcesPath
}
$v2Entry = [ordered]@{
    schemaVersion = 2
    appServerProtocolVersion = 2
    appVersion = $appVersion
    channel = 'prod'
    cliVersion = $appVersion
    entryId = $entryId
    extensionBuildChannels = @('prod')
    extensionIds = @('hehggadaopoacecdllhhajmbjkdcmajg','odlomjlbamekndcpllcnffbgeohgkmjh')
    installId = $installId
    nativeHostNames = @('com.openai.codexextension')
    nativeHostProtocolVersion = 2
    nativeHostVersion = $appVersion
    paths = $v2Paths
    proxyHost = '127.0.0.1'
    proxyPort = 0
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    trustedBrowserClientSha256s = @($browserHash)
}
$v2Document = [ordered]@{ schemaVersion = 2; entries = @($v2Entry) }
$v2WriteTargets = @($localV2, $defaultV2, $homeV2) | Select-Object -Unique
foreach ($vf in $v2WriteTargets) {
    Backup-Path $vf
    Write-Utf8NoBom $vf ($v2Document | ConvertTo-Json -Depth 30)
    Log "Rebuilt schema-v2 app-server manifest: $vf"
}

# 13) Align the active node_repl trust configuration with the same bundle.
# This is intentionally a narrow line-based update so unrelated user settings
# in config.toml are preserved.
$configPath = Join-Path $CodexHome 'config.toml'
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    Backup-Path $configPath
    try {
        $configText = [IO.File]::ReadAllText($configPath)
        $serviceForConfig = if ($trustedBrowserServicePath) { $trustedBrowserServicePath -replace '\\','/' } else { $null }
        $configText = [regex]::Replace($configText, '(?m)^BROWSER_USE_CODEX_APP_VERSION\s*=\s*"[^"]*"\s*$', ('BROWSER_USE_CODEX_APP_VERSION = "' + $appVersion + '"'))
        $configText = [regex]::Replace($configText, '(?m)^CODEX_CLI_PATH\s*=\s*''[^'']*''\s*$', ("CODEX_CLI_PATH = '" + $codexCliPath + "'"))
        $configText = [regex]::Replace($configText, '(?m)^NODE_REPL_NODE_MODULE_DIRS\s*=\s*''[^'']*''\s*$', ("NODE_REPL_NODE_MODULE_DIRS = '" + $nodeModuleDir + "'"))
        $configText = [regex]::Replace($configText, '(?m)^NODE_REPL_NODE_PATH\s*=\s*''[^'']*''\s*$', ("NODE_REPL_NODE_PATH = '" + $nodePath + "'"))
        $configText = [regex]::Replace($configText, '(?m)^NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S\s*=\s*"[^"]*"\s*$', ('NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S = "' + $browserHash + '"'))
        if ($serviceForConfig) {
            $trustedObject = ([ordered]@{ browser = $serviceForConfig; sky = '@oai/sky/service' } | ConvertTo-Json -Compress)
            $trustedServices = "NODE_REPL_TRUSTED_SERVICES = '$trustedObject'"
            $configText = [regex]::Replace($configText, '(?m)^NODE_REPL_TRUSTED_SERVICES\s*=\s*''[^'']*''\s*$', $trustedServices)
        }

        # Browser Use needs the ChatGPT auth manager even when model traffic is
        # sent through a custom provider with its own bearer token. Keep the
        # active provider/endpoint unchanged and only enable that auth manager.
        $providerMatch = [regex]::Match($configText, '(?m)^\s*model_provider\s*=\s*"([^"]+)"\s*$')
        if ($providerMatch.Success) {
            $providerId = $providerMatch.Groups[1].Value
            $providerSectionPattern = '(?ms)(^\s*\[model_providers\.' + [regex]::Escape($providerId) + '\]\s*\r?\n)(.*?)(?=^\s*\[|\z)'
            $configText = [regex]::Replace($configText, $providerSectionPattern, {
                param($match)
                $header = $match.Groups[1].Value
                $body = $match.Groups[2].Value
                if ($body -match '(?m)^\s*experimental_bearer_token\s*=') {
                    if ($body -match '(?m)^\s*requires_openai_auth\s*=') {
                        $body = [regex]::Replace($body, '(?m)^\s*requires_openai_auth\s*=\s*(?:true|false)\s*$', 'requires_openai_auth = true', 1)
                    } else {
                        $body = "requires_openai_auth = true`r`n" + $body
                    }
                }
                return $header + $body
            }, 1)
        }
        Write-Utf8NoBom $configPath $configText
        Log "Aligned node_repl trust configuration: $configPath"
    } catch {
        Log "WARN: could not align node_repl trust configuration: $($_.Exception.Message)"
    }
}

# 13b) Preserve the custom model-provider token in config.toml while supplying
# the separate ChatGPT OAuth session required by Browser Use safety checks.
function Test-ChatGptAuthFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $auth = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        return ($auth.tokens -and
            -not [string]::IsNullOrWhiteSpace([string]$auth.tokens.access_token) -and
            -not [string]::IsNullOrWhiteSpace([string]$auth.tokens.refresh_token))
    } catch {
        return $false
    }
}

$activeAuthPath = Join-Path $CodexHome 'auth.json'
$officialAuthPath = Join-Path $env:USERPROFILE '.codex\auth.json'
if (-not (Test-ChatGptAuthFile $activeAuthPath)) {
    if (-not [string]::Equals($activeAuthPath, $officialAuthPath, [StringComparison]::OrdinalIgnoreCase) -and
        (Test-ChatGptAuthFile $officialAuthPath)) {
        Backup-Path $activeAuthPath
        Copy-Item -LiteralPath $officialAuthPath -Destination $activeAuthPath -Force
        Log 'Activated the existing ChatGPT OAuth session for Browser Use; custom model-provider credentials remain in config.toml.'
    } else {
        Log 'WARN: no ChatGPT OAuth session is available for Browser Use. Sign in with ChatGPT in Codex, then rerun repair.'
    }
} else {
    Log 'ChatGPT OAuth session is available for Browser Use.'
}

# 14) Read-only diagnostics after latest/native-host repair.
if ($codexCmd) {
    Try-Run 'codex plugin list --json (post)' { & $codexCmd.Source plugin list --json } | Out-Null
    Try-Run 'codex doctor --json' { & $codexCmd.Source doctor --json } | Out-Null
}

# 15) Run bundled diagnostics when present
$scriptDir = Join-Path $latest 'scripts'
if ($nodePath -and (Test-Path -LiteralPath $nodePath) -and (Test-Path -LiteralPath $scriptDir)) {
    foreach ($name in @('check-extension-installed.js','check-native-host-manifest.js','check-extension-installed.mjs','check-native-host-manifest.mjs')) {
        $diag = Join-Path $scriptDir $name
        if (Test-Path -LiteralPath $diag) {
            Try-Run "bundled diagnostic $name" { & $nodePath $diag --json } | Out-Null
        }
    }
}

# 16) Static validation
$issues = New-Object System.Collections.Generic.List[string]
if (-not (Test-Path -LiteralPath $extensionHostPath)) { $issues.Add("extension-host missing: $extensionHostPath") }
if (-not (Test-Path -LiteralPath $browserClientPath)) { $issues.Add("browser-client missing: $browserClientPath") }
if (-not (Test-Path -LiteralPath $nativeManifest)) { $issues.Add("native manifest missing: $nativeManifest") }
if (-not (Test-Path -LiteralPath $hostConfigPath)) { $issues.Add("schema-v1 host config missing: $hostConfigPath") }
try {
    $regValue = (Get-Item -LiteralPath $regPath).GetValue('')
    if ($regValue -ne $nativeManifest) { $issues.Add("registry manifest mismatch: $regValue") }
} catch { $issues.Add('native messaging registry key unreadable') }

foreach ($vf in @($localV2, $defaultV2, $homeV2) | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $vf)) {
        $issues.Add("v2 manifest missing: $vf")
        continue
    }
    try {
        $v2obj = Get-Content -LiteralPath $vf -Raw | ConvertFrom-Json
        $matching = @($v2obj.entries | Where-Object { $_.paths -and [string]::Equals([string]$_.paths.codexHome, $CodexHome, [StringComparison]::OrdinalIgnoreCase) })
        if ($matching.Count -ne 1) { $issues.Add("v2 manifest does not contain exactly one active CODEX_HOME entry: $vf") }
        if ($matching.Count -eq 1) {
            foreach ($required in @('browserClientPath','browserServicePath','codexCliPath','extensionHostPath','nodePath','nodeReplPath','resourcesPath')) {
                $pathValue = [string]$matching[0].paths.$required
                if (-not $pathValue -or -not (Test-Path -LiteralPath $pathValue)) { $issues.Add("v2 path missing ($required): $pathValue") }
            }
            $moduleDir = [string]@($matching[0].paths.nodeModuleDirs)[0]
            if (-not $moduleDir -or -not (Test-Path -LiteralPath $moduleDir)) { $issues.Add("v2 nodeModuleDirs path missing: $moduleDir") }
        }
    } catch {
        $issues.Add("v2 manifest invalid JSON: $vf")
    }
}

# 17) Summary report
$summary = @()
$summary += "# Codex Chrome local repair"
$summary += ""
$summary += "- Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$summary += "- CODEX_HOME: $CodexHome"
$summary += "- Project: $ProjectDir"
$summary += "- Chrome plugin selected: $selected"
$summary += "- latest: $latest -> $selected"
$summary += "- browserClientPath: $browserClientPath"
$summary += "- browserClient SHA256: $browserHash"
$summary += "- extensionHostPath: $extensionHostPath"
$summary += "- codexCliPath: $codexCliPath"
$summary += "- nodePath: $nodePath"
$summary += "- nodeReplPath: $nodeReplPath"
$summary += "- resourcesPath: $resourcesPath"
$summary += "- Native manifest: $nativeManifest"
$summary += "- Backup: $backupDir"
$summary += "- Full log: $logFile"
$summary += ""
if ($issues.Count -eq 0) {
    $summary += "## Static result"
    $summary += "LOCAL STATIC STATE REPAIRED / VALIDATED."
    Log 'Static local repair checks passed.'
} else {
    $summary += "## Remaining checks/issues"
    foreach ($i in $issues) { $summary += "- $i"; Log "REMAINING: $i" }
    $summary += ""
    $summary += "One or more required local paths or manifests still need attention; see the remaining issues above and the repair log."
}
$summaryPath = Join-Path $logDir 'chrome-control-latest.md'
Write-Utf8NoBom $summaryPath ($summary -join [Environment]::NewLine)
Log "Summary: $summaryPath"

# 18) Start Chrome only if it was not already running.
if (-not $chromeWasRunning) {
    $chromeCandidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if ($chromeCandidates.Count -gt 0) {
        try {
            Start-Process -FilePath $chromeCandidates[0]
            Log "Chrome started: $($chromeCandidates[0])"
        } catch {
            Log "WARN: Chrome start failed: $($_.Exception.Message)"
        }
    }
} else {
    Log 'Chrome was already open; no restart was forced.'
}

Log 'Repair phase finished. The BAT launcher will now start Codex in D:\Aeck_Pre.'
exit 0
