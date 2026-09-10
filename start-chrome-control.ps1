$ErrorActionPreference = 'Stop'

$env:CODEX_HOME = 'C:\Users\LENOVO\.antigravity_cockpit\instances\codex\cli-api-service-dd70b6f4c0cf'
Set-Location -LiteralPath 'D:\Aeck_Pre'

$port = 4500
$endpoint = "ws://127.0.0.1:$port"

$cmd = (Get-Command codex.cmd -ErrorAction Stop).Source
$npmBin = Split-Path -Parent $cmd
$nativeCli = Join-Path $npmBin 'node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe'

$cli = if (Test-Path -LiteralPath $nativeCli) {
  $nativeCli
} else {
  $cmd
}

function Get-RelayPids {
  @(
    Get-NetTCPConnection `
      -LocalAddress 127.0.0.1 `
      -LocalPort $port `
      -State Listen `
      -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
}

function Stop-ProcessTree([int]$ProcessId) {
  taskkill.exe /PID $ProcessId /T /F *> $null
}

# Port 4500 is dedicated to this relay. Clean old Codex relay processes only.
foreach ($ownerPid in @(Get-RelayPids)) {
  $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue

  if ($process -and $process.ProcessName -ne 'codex') {
    throw "Port $port is held by a non-Codex process (PID $ownerPid)."
  }

  if ($process) {
    Stop-ProcessTree $ownerPid
  }
}

Start-Sleep -Milliseconds 500

if (@(Get-RelayPids).Count -gt 0) {
  throw "Could not free port $port."
}

$server = Start-Process `
  -FilePath $cli `
  -ArgumentList @('app-server', '--listen', $endpoint) `
  -WindowStyle Hidden `
  -PassThru

try {
  $ready = $false

  for ($i = 0; $i -lt 40; $i++) {
    if ($server.HasExited) {
      throw 'app-server exited before opening the port.'
    }

    if (Test-NetConnection `
      -ComputerName 127.0.0.1 `
      -Port $port `
      -InformationLevel Quiet `
      -WarningAction SilentlyContinue) {
      $ready = $true
      break
    }

    Start-Sleep -Milliseconds 250
  }

  if (-not $ready) {
    throw "app-server did not start on port $port."
  }

  Write-Host "Chrome control relay ready: $endpoint"
  & $cli '--remote' $endpoint
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-ProcessTree $server.Id
  }

  foreach ($leftPid in @(Get-RelayPids)) {
    $leftProcess = Get-Process -Id $leftPid -ErrorAction SilentlyContinue
    if ($leftProcess -and $leftProcess.ProcessName -eq 'codex') {
      Stop-ProcessTree $leftPid
    }
  }
}
