# รันชุดทดสอบ tests/index.html จากบรรทัดคำสั่ง โดยไม่ต้องติดตั้งอะไรเพิ่ม
#   jwebserver (มากับ JDK) เสิร์ฟโฟลเดอร์โปรเจกต์ + Edge/Chrome แบบไม่มีหน้าต่าง คุยผ่าน DevTools Protocol
#   ใช้: powershell -ExecutionPolicy Bypass -File scripts\test.ps1
#   exit code: 0 = ผ่านทั้งหมด, 1 = มีข้อไม่ผ่าน, 2 = รันไม่ได้/ไม่จบในเวลา
#   (ไฟล์นี้ต้องบันทึกเป็น UTF-8 แบบมี BOM เพราะ Windows PowerShell 5.1 อ่านภาษาไทยจากไฟล์ที่ไม่มี BOM เพี้ยน)
param([int]$Port = 5199, [int]$DebugPort = 9333, [int]$TimeoutSec = 240)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot

$browser = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'ไม่พบ Edge/Chrome'; exit 2 }
if (-not (Get-Command jwebserver -ErrorAction SilentlyContinue)) { Write-Host 'ไม่พบ jwebserver (ต้องมี JDK 18+)'; exit 2 }

$srv = $null; $edge = $null; $ws = $null
$profileDir = Join-Path $env:TEMP ('reday-edge-' + [guid]::NewGuid().ToString('N'))
$script:msgId = 0

function Send-Cdp($method, $params) {
  $script:msgId++
  $id = $script:msgId
  $json = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $null = $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, [Threading.CancellationToken]::None).Result
  $buf = New-Object byte[] 262144
  while ($true) {
    $sb = New-Object Text.StringBuilder
    do {
      $r = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), [Threading.CancellationToken]::None).Result
      [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
    } until ($r.EndOfMessage)
    $msg = $sb.ToString() | ConvertFrom-Json
    if ($msg.id -eq $id) { return $msg }   # ข้ามข้อความ event ที่ไม่ใช่คำตอบของเรา
  }
}

try {
  $srv = Start-Process jwebserver -ArgumentList '-p', $Port, '-b', '127.0.0.1', '-d', "`"$root`"" -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$env:TEMP\reday-jws.out" -RedirectStandardError "$env:TEMP\reday-jws.err"
  Start-Sleep -Milliseconds 1500
  if ($srv.HasExited) { Write-Host "เปิดเซิร์ฟเวอร์ที่พอร์ต $Port ไม่ได้ (พอร์ตถูกใช้อยู่?)"; exit 2 }

  $edge = Start-Process $browser -PassThru -WindowStyle Hidden -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    "--remote-debugging-port=$DebugPort", "--user-data-dir=`"$profileDir`"", 'about:blank')

  $target = $null
  for ($i = 0; $i -lt 30 -and -not $target; $i++) {
    Start-Sleep -Milliseconds 500
    try { $target = (Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/list") | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 } catch { }
  }
  if (-not $target) { Write-Host 'เชื่อมต่อเบราว์เซอร์ไม่ได้'; exit 2 }

  $ws = [Net.WebSockets.ClientWebSocket]::new()
  $null = $ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Result
  $null = Send-Cdp 'Page.navigate' @{ url = "http://127.0.0.1:$Port/tests/index.html" }

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $res = $null
  while ((Get-Date) -lt $deadline -and -not $res) {
    Start-Sleep -Seconds 1
    $ans = Send-Cdp 'Runtime.evaluate' @{ expression = 'JSON.stringify(window.__results || null)'; returnByValue = $true }
    $val = $ans.result.result.value
    if ($val -and $val -ne 'null') { $res = $val | ConvertFrom-Json }
  }
  if (-not $res) { Write-Host "รันชุดทดสอบไม่จบใน $TimeoutSec วินาที (ลองเพิ่ม -TimeoutSec)"; exit 2 }

  $failed = @($res.failed)
  if ($failed.Count -eq 0) { Write-Host "ผ่านทั้งหมด $($res.total) ข้อ"; exit 0 }
  Write-Host "ไม่ผ่าน $($failed.Count) จาก $($res.total) ข้อ"
  foreach ($f in $failed) { Write-Host ('  ✗ ' + $f.name); Write-Host ('      ' + ($f.error -replace '\s+', ' ')) }
  exit 1
}
finally {
  if ($ws) { try { $ws.Dispose() } catch { } }
  if ($edge -and -not $edge.HasExited) { Stop-Process -Id $edge.Id -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$profileDir*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($srv -and -not $srv.HasExited) { Stop-Process -Id $srv.Id -Force }
  Start-Sleep -Milliseconds 300
  if (Test-Path $profileDir) { Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue }
}
