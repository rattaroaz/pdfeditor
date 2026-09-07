param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('list', 'scan')]
  [string]$Action,
  [string]$OutDir = '',
  [int]$Dpi = 300,
  [ValidateSet('color', 'grayscale', 'blackwhite')]
  [string]$ColorMode = 'color',
  [ValidateSet('auto', 'flatbed', 'feeder')]
  [string]$Source = 'auto',
  [string]$DeviceId = '',
  [int]$MaxPages = 1,
  [switch]$Preview,
  [double]$RegionX = 0,
  [double]$RegionY = 0,
  [double]$RegionW = 1,
  [double]$RegionH = 1
)

$ErrorActionPreference = 'Stop'

function Escape-Json([string]$text) {
  if ($null -eq $text) { return '' }
  $text = $text.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
  return $text
}

function Write-ScanJson {
  param(
    [bool]$Ok,
    [bool]$Cancelled = $false,
    [string]$ErrorText = '',
    [object[]]$Scanners = @(),
    [string[]]$Images = @(),
    [bool]$RegionApplied = $false
  )
  $scannerParts = @()
  foreach ($s in @($Scanners)) {
    if ($null -eq $s) { continue }
    $scannerParts += ('{"id":"' + (Escape-Json ([string]$s.id)) + '","name":"' + (Escape-Json ([string]$s.name)) + '"}')
  }
  $imageParts = @()
  foreach ($p in @($Images)) {
    if ([string]::IsNullOrWhiteSpace($p)) { continue }
    $imageParts += ('"' + (Escape-Json $p) + '"')
  }
  $err = if ($ErrorText) { ',"error":"' + (Escape-Json $ErrorText) + '"' } else { '' }
  $okJson = if ($Ok) { 'true' } else { 'false' }
  $cancelJson = if ($Cancelled) { 'true' } else { 'false' }
  $regionJson = if ($RegionApplied) { 'true' } else { 'false' }
  $text = '{"ok":' + $okJson + ',"cancelled":' + $cancelJson + $err + ',"regionApplied":' + $regionJson + ',"scanners":[' + ($scannerParts -join ',') + '],"images":[' + ($imageParts -join ',') + ']}'
  if ($OutDir) {
    try {
      [System.IO.File]::WriteAllText((Join-Path $OutDir 'result.json'), $text)
    } catch { }
  }
  Write-Output $text
}

function Ensure-WiaService {
  try {
    $svc = Get-Service -Name 'stisvc' -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne 'Running') {
      Start-Service -Name 'stisvc' -ErrorAction SilentlyContinue | Out-Null
    }
  } catch {
    # listing/scanning can still work if the service is already available
  }
}

function Get-Scanners {
  $mgr = New-Object -ComObject WIA.DeviceManager
  $items = @()
  for ($i = 1; $i -le $mgr.DeviceInfos.Count; $i++) {
    $info = $mgr.DeviceInfos.Item($i)
    $type = 0
    try { $type = [int]$info.Type } catch { $type = 0 }
    # 0 = unspecified (some MFPs), 1 = scanner
    if ($type -ne 0 -and $type -ne 1) { continue }
    $name = [string]$info.DeviceID
    try { $name = [string]$info.Properties.Item('Name').Value } catch { }
    $items += [pscustomobject]@{
      id   = [string]$info.DeviceID
      name = $name
    }
  }
  return @($items)
}

function Set-WiaProp($obj, $propId, $value) {
  try {
    $obj.Properties.Item($propId).Value = $value
    return $true
  } catch {
    return $false
  }
}

function Ensure-Drawing {
  if (-not ('System.Drawing.Image' -as [type])) {
    Add-Type -AssemblyName System.Drawing
  }
}

function Convert-FileToJpegs([string]$sourcePath, [string]$outDir, [int]$startN) {
  Ensure-Drawing
  $result = New-Object System.Collections.Generic.List[string]
  $img = $null
  $stream = $null
  try {
    $bytes = [System.IO.File]::ReadAllBytes($sourcePath)
    $stream = New-Object System.IO.MemoryStream(,$bytes)
    $img = [System.Drawing.Image]::FromStream($stream)
    $frameCount = 1
    $dim = $null
    try {
      $guid = $img.FrameDimensionsList[0]
      $dim = New-Object System.Drawing.Imaging.FrameDimension($guid)
      $frameCount = [Math]::Max(1, $img.GetFrameCount($dim))
    } catch {
      $frameCount = 1
    }
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' } |
      Select-Object -First 1
    $enc = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $enc.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
      [System.Drawing.Imaging.Encoder]::Quality,
      [long]85
    )
    for ($i = 0; $i -lt $frameCount; $i++) {
      if ($dim -and $frameCount -gt 1) {
        [void]$img.SelectActiveFrame($dim, $i)
      }
      $path = Join-Path $outDir ('scan_{0:D3}.jpg' -f ($startN + $i))
      if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
      }
      if ($codec) {
        $img.Save($path, $codec, $enc)
      } else {
        $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      }
      $result.Add($path)
    }
  } finally {
    if ($img) { $img.Dispose() }
    if ($stream) { $stream.Dispose() }
  }
  return @($result.ToArray())
}

function Save-WiaImageAsJpegs($image, [string]$outDir, [int]$startN) {
  if ($null -eq $image) { return @() }
  $raw = Join-Path $outDir ('wia_raw_{0}.bin' -f $startN)
  try {
    if (Test-Path -LiteralPath $raw) {
      Remove-Item -LiteralPath $raw -Force
    }
    try {
      [void]$image.SaveFile($raw)
    } catch {
      $bmpId = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'
      $ip = New-Object -ComObject WIA.ImageProcess
      [void]$ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
      $ip.Filters.Item(1).Properties.Item('FormatID').Value = $bmpId
      $converted = $ip.Apply($image)
      if (Test-Path -LiteralPath $raw) {
        Remove-Item -LiteralPath $raw -Force
      }
      [void]$converted.SaveFile($raw)
    }
    return @(Convert-FileToJpegs $raw $outDir $startN)
  } catch {
    $jpeg = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
    $dest = Join-Path $outDir ('scan_{0:D3}.jpg' -f $startN)
    if (Test-Path -LiteralPath $dest) {
      Remove-Item -LiteralPath $dest -Force
    }
    $ip = New-Object -ComObject WIA.ImageProcess
    [void]$ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
    $ip.Filters.Item(1).Properties.Item('FormatID').Value = $jpeg
    try { $ip.Filters.Item(1).Properties.Item('Quality').Value = 85 } catch { }
    $converted = $ip.Apply($image)
    [void]$converted.SaveFile($dest)
    return @($dest)
  } finally {
    if (Test-Path -LiteralPath $raw) {
      Remove-Item -LiteralPath $raw -Force -ErrorAction SilentlyContinue
    }
  }
}

function Convert-ToJpeg($image, $path) {
  $dir = Split-Path -Parent $path
  $startN = 1
  if ($path -match 'scan_(\d+)') {
    $startN = [int]$Matches[1]
  }
  $saved = @(Save-WiaImageAsJpegs $image $dir $startN)
  if ($saved.Count -eq 0) {
    throw 'Scanner returned an image that could not be saved as JPEG.'
  }
  if ($saved[0] -ne $path -and (Test-Path -LiteralPath $saved[0])) {
    Copy-Item -LiteralPath $saved[0] -Destination $path -Force
  }
}

function Get-DeviceInfoName($info) {
  try { return [string]$info.Properties.Item('Name').Value } catch { return [string]$info.DeviceID }
}

function Name-LooksLikeFeeder([string]$name) {
  return ($name -match 'feeder|adf|document feed|rr-\d|receipt')
}

function Name-LooksLikeDedicatedFeeder([string]$name) {
  return ($name -match 'rr-\d|receipt')
}

function Device-IsFeederOnly($device, [string]$name) {
  if (Name-LooksLikeDedicatedFeeder $name) { return $true }
  try {
    $caps = [int]$device.Properties.Item(3086).Value
    return ((($caps -band 1) -ne 0) -and (($caps -band 2) -eq 0))
  } catch {
    return $false
  }
}

function Show-HostWindow {
  try {
    if (-not ('PdfScanWin' -as [type])) {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PdfScanWin {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
}
"@
    }
    $hwnd = [PdfScanWin]::GetConsoleWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
      [void][PdfScanWin]::ShowWindow($hwnd, 5)
      [void][PdfScanWin]::SetForegroundWindow($hwnd)
    }
  } catch { }
}

function Connect-Scanner([string]$id, [bool]$wantFeeder) {
  $mgr = New-Object -ComObject WIA.DeviceManager
  $selected = $null
  $adfInfos = @()
  for ($i = 1; $i -le $mgr.DeviceInfos.Count; $i++) {
    $info = $mgr.DeviceInfos.Item($i)
    $type = 0
    try { $type = [int]$info.Type } catch { $type = 0 }
    if ($type -ne 0 -and $type -ne 1) { continue }
    $name = Get-DeviceInfoName $info
    if ($id -and $info.DeviceID -eq $id) { $selected = $info }
    if (Name-LooksLikeFeeder $name) { $adfInfos += $info }
  }

  if ($wantFeeder) {
    if ($selected -and (Name-LooksLikeFeeder (Get-DeviceInfoName $selected))) {
      return $selected.Connect()
    }
    $stem = ''
    if ($selected) {
      $stem = ((Get-DeviceInfoName $selected) -replace '(?i)[\s\-_]*(?:\(|\[)?(?:adf|feeder|document feeder).*$', '').Trim()
    }
    foreach ($adf in $adfInfos) {
      $adfName = Get-DeviceInfoName $adf
      if ($stem -and ($adfName -like "*$stem*")) { return $adf.Connect() }
    }
    if ($adfInfos.Count -gt 0) { return $adfInfos[0].Connect() }
    if ($selected) { return $selected.Connect() }
  } elseif ($selected) {
    return $selected.Connect()
  }

  if ($id) {
    for ($i = 1; $i -le $mgr.DeviceInfos.Count; $i++) {
      $info = $mgr.DeviceInfos.Item($i)
      if ($info.DeviceID -eq $id) {
        return $info.Connect()
      }
    }
  }
  if ($mgr.DeviceInfos.Count -eq 1) {
    return $mgr.DeviceInfos.Item(1).Connect()
  }
  $dialog = New-Object -ComObject WIA.CommonDialog
  # No extra args — PowerShell COM cannot coerce format GUIDs on this method.
  return $dialog.ShowSelectDevice()
}

function Get-WiaProp($obj, $propId) {
  try {
    return $obj.Properties.Item($propId)
  } catch {
    return $null
  }
}

function Reset-WiaExtents($item) {
  $xpos = Get-WiaProp $item 6149
  $ypos = Get-WiaProp $item 6150
  $xext = Get-WiaProp $item 6151
  $yext = Get-WiaProp $item 6152
  if ($xpos) { try { $xpos.Value = $xpos.SubTypeMin } catch { Set-WiaProp $item 6149 0 | Out-Null } }
  if ($ypos) { try { $ypos.Value = $ypos.SubTypeMin } catch { Set-WiaProp $item 6150 0 | Out-Null } }
  if ($xext) { try { $xext.Value = $xext.SubTypeMax } catch { } }
  if ($yext) { try { $yext.Value = $yext.SubTypeMax } catch { } }
}

function Test-FullRegion([double]$x, [double]$y, [double]$w, [double]$h) {
  return ($x -le 0.005 -and $y -le 0.005 -and $w -ge 0.995 -and $h -ge 0.995)
}

function Apply-WiaRegion($item, [double]$rx, [double]$ry, [double]$rw, [double]$rh) {
  Reset-WiaExtents $item
  $xext = Get-WiaProp $item 6151
  $yext = Get-WiaProp $item 6152
  if (-not $xext -or -not $yext) { return $false }
  $maxW = 0
  $maxH = 0
  try { $maxW = [int]$xext.SubTypeMax } catch { return $false }
  try { $maxH = [int]$yext.SubTypeMax } catch { return $false }
  if ($maxW -lt 8 -or $maxH -lt 8) { return $false }
  $x = [int][Math]::Floor($rx * $maxW)
  $y = [int][Math]::Floor($ry * $maxH)
  $w = [int][Math]::Ceiling($rw * $maxW)
  $h = [int][Math]::Ceiling($rh * $maxH)
  if ($x -lt 0) { $x = 0 }
  if ($y -lt 0) { $y = 0 }
  if ($w -lt 8) { $w = 8 }
  if ($h -lt 8) { $h = 8 }
  if (($x + $w) -gt $maxW) { $w = $maxW - $x }
  if (($y + $h) -gt $maxH) { $h = $maxH - $y }
  if ($w -lt 8 -or $h -lt 8) { return $false }
  $okX = Set-WiaProp $item 6149 $x
  $okY = Set-WiaProp $item 6150 $y
  $okW = Set-WiaProp $item 6151 $w
  $okH = Set-WiaProp $item 6152 $h
  return ($okX -and $okY -and $okW -and $okH)
}

function Get-ItemName($item) {
  try { return [string]$item.Properties.Item('Name').Value } catch { return '' }
}

function Get-ItemCategory($item) {
  try { return ([string]$item.Properties.Item(4123).Value).ToUpper() } catch { return '' }
}

function Item-LooksLikeFeeder($item) {
  $cat = Get-ItemCategory $item
  # WIA_CATEGORY_FEEDER / FEEDER_FRONT / FEEDER_BACK
  if ($cat -match 'FE131934|48290527|61CA74A0') { return $true }
  $name = Get-ItemName $item
  return ($name -match 'feeder|adf|document feed')
}

function Get-DeviceItems($device) {
  $count = 0
  try { $count = [int]$device.Items.Count } catch { return }
  for ($i = 1; $i -le $count; $i++) {
    try { $device.Items.Item($i) } catch { }
  }
}

function Item-LooksLikeFinished($item) {
  $cat = Get-ItemCategory $item
  return ($cat -match 'FF2B77BD')
}

function Set-FeederHandling($obj) {
  $ok = Set-WiaProp $obj 3088 1
  if (-not $ok) {
    try {
      $obj.Properties.Item('Document Handling Select').Value = 1
      $ok = $true
    } catch { }
  }
  return $ok
}

function Get-DeviceName($device) {
  try { return [string]$device.Properties.Item('Name').Value } catch { return '' }
}

function Prepare-FeederItem($device, $item, $intent, $dpi) {
  $name = Get-DeviceName $device
  if (-not (Device-IsFeederOnly $device $name)) {
    Set-FeederHandling $device | Out-Null
    Set-FeederHandling $item | Out-Null
  }
  Set-WiaProp $item 6146 $intent | Out-Null
  Set-WiaProp $item 6147 $dpi | Out-Null
  Set-WiaProp $item 6148 $dpi | Out-Null
}

function Find-ScanItem($device, [bool]$wantFeeder) {
  $name = Get-DeviceName $device
  if ($wantFeeder) {
    if (-not (Device-IsFeederOnly $device $name)) {
      Set-FeederHandling $device | Out-Null
      Start-Sleep -Milliseconds 200
    }
  } else {
    Set-WiaProp $device 3088 2 | Out-Null
  }

  $items = @(Get-DeviceItems $device | Where-Object { $_ -and -not (Item-LooksLikeFinished $_) })
  if ($items.Count -lt 1) { return $null }

  if ($wantFeeder) {
    foreach ($candidate in $items) {
      if (Item-LooksLikeFeeder $candidate) {
        return $candidate
      }
    }
    return $items[0]
  }

  foreach ($candidate in $items) {
    if (-not (Item-LooksLikeFeeder $candidate)) {
      return $candidate
    }
  }
  return $items[0]
}

function Is-FeederFinished($err) {
  $msg = [string]$err
  return ($msg -match '0x80210003|0x80210004|paper empty|no paper|WIA_ERROR_PAPER_EMPTY|no more pages')
}

function Transfer-FeederPage($item) {
  Show-HostWindow
  $dialog = New-Object -ComObject WIA.CommonDialog
  try {
    $script:wiaTransfer = $dialog.ShowTransfer($item)
  } catch {
    if (Is-FeederFinished $_) { throw }
    $script:wiaTransfer = $item.Transfer()
  }
  return $script:wiaTransfer
}

function Transfer-Image($item) {
  $dialog = New-Object -ComObject WIA.CommonDialog
  try {
    $script:wiaTransfer = $dialog.ShowTransfer($item)
  } catch {
    $script:wiaTransfer = $item.Transfer()
  }
  return $script:wiaTransfer
}

function Transfer-Best($item, [bool]$preferSilent) {
  $script:wiaTransfer = $null
  if ($preferSilent) {
    try {
      $script:wiaTransfer = $item.Transfer()
    } catch {
      # some network scanners only succeed through the WIA transfer dialog
    }
  }
  if ($null -eq $script:wiaTransfer) {
    [void](Transfer-Image $item)
  }
  return $script:wiaTransfer
}

function Transfer-WithRetry($item, [bool]$preferSilent) {
  $lastError = $null
  foreach ($attempt in 1..3) {
    try {
      $image = Transfer-Best $item $preferSilent
      if ($null -ne $image) { return $image }
    } catch {
      $lastError = $_
    }
    Start-Sleep -Milliseconds (300 * $attempt)
  }
  if ($lastError) { throw $lastError }
  return $null
}

function Acquire-WithCommonDialog {
  Show-HostWindow
  $dialog = New-Object -ComObject WIA.CommonDialog
  # Parameterless call is the only ShowAcquireImage form that works from Windows PowerShell 5.1.
  return $dialog.ShowAcquireImage()
}

if ($Action -eq 'list') {
  try {
    Ensure-WiaService
    $scanners = @(Get-Scanners)
    Write-ScanJson -Ok $true -Scanners $scanners
    exit 0
  } catch {
    Write-ScanJson -Ok $false -ErrorText ([string]$_.Exception.Message)
    exit 1
  }
}

$regionApplied = $false
$useFeeder = $false
$triedAcquire = $false
$paths = New-Object System.Collections.Generic.List[string]
try {
  Ensure-WiaService
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  if ($Preview) {
    $Dpi = 75
    $Source = 'flatbed'
    $MaxPages = 1
  }
  $intent = @{ color = 1; grayscale = 2; blackwhite = 4 }[$ColorMode]
  $useFeeder = (-not $Preview) -and (($Source -eq 'feeder') -or ($MaxPages -gt 1 -and $Source -eq 'auto'))
  $hasRegion = -not (Test-FullRegion $RegionX $RegionY $RegionW $RegionH)
  $preferSilent = $Preview -or $hasRegion

  $device = $null
  try {
    $device = Connect-Scanner $DeviceId $useFeeder
  } catch {
    $device = $null
  }

  if ($device) {
    $item = Find-ScanItem $device $useFeeder
    if ($item) {
      if ($useFeeder) {
        Prepare-FeederItem $device $item $intent $Dpi
      } else {
        Set-WiaProp $item 6146 $intent | Out-Null
        Set-WiaProp $item 6147 $Dpi | Out-Null
        Set-WiaProp $item 6148 $Dpi | Out-Null
        Reset-WiaExtents $item
        if ($hasRegion -and -not $Preview) {
          $regionApplied = Apply-WiaRegion $item $RegionX $RegionY $RegionW $RegionH
        }
      }

      $n = 0
      $limit = if ($useFeeder) { $MaxPages } else { 1 }
      while ($n -lt $limit) {
        $image = $null
        try {
          if ($useFeeder) {
            $image = Transfer-FeederPage $item
          } else {
            $raw = @(Transfer-WithRetry $item $preferSilent)
            $image = $raw | Select-Object -Last 1
          }
        } catch {
          if ($useFeeder -and $n -gt 0 -and (Is-FeederFinished $_)) { break }
          if ($useFeeder -and $n -gt 0) { break }
          if ($n -eq 0) { throw }
          break
        }
        if ($null -eq $image) { break }
        if ($useFeeder) {
          $saved = @(Save-WiaImageAsJpegs $image $OutDir ($n + 1))
          foreach ($p in $saved) { $paths.Add($p) }
          if ($saved.Count -lt 1) { break }
          $n += $saved.Count
          if ($saved.Count -gt 1) { break }
          Start-Sleep -Milliseconds 120
        } else {
          $n++
          $path = Join-Path $OutDir ('scan_{0:D3}.jpg' -f $n)
          Convert-ToJpeg $image $path
          $paths.Add($path)
          break
        }
      }
    }
  }

  if ($paths.Count -eq 0) {
    if ($Preview -or $hasRegion) {
      throw 'Scanner did not return a preview. Check that the device is on and selected.'
    }
    $image = $null
    try {
      $triedAcquire = $true
      $image = Acquire-WithCommonDialog
    } catch {
      if ($useFeeder) {
        throw ("Document feeder did not start: " + [string]$_.Exception.Message)
      }
      throw
    }
    if ($null -eq $image) {
      if ($useFeeder) {
        throw 'Document feeder dialog returned no page. Select EPSOND686BA (RR-600W) in the Windows scan dialog if it appears.'
      }
      Write-ScanJson -Ok $true -Cancelled $true
      exit 0
    }
    $path = Join-Path $OutDir 'scan_001.jpg'
    Convert-ToJpeg $image $path
    $paths.Add($path)
  }

  Write-ScanJson -Ok $true -Images @($paths.ToArray()) -RegionApplied $regionApplied
  exit 0
} catch {
  $msg = [string]$_.Exception.Message
  $existing = @()
  if ($OutDir -and (Test-Path -LiteralPath $OutDir)) {
    $existing = @(Get-ChildItem -LiteralPath $OutDir -Filter 'scan_*.jpg' | ForEach-Object { $_.FullName })
  }
  if ($existing.Count -gt 0) {
    Write-ScanJson -Ok $true -Images $existing -RegionApplied $regionApplied
    exit 0
  }
  if ($useFeeder -and $paths.Count -eq 0 -and -not $triedAcquire) {
    try {
      $fallback = Acquire-WithCommonDialog
      if ($null -ne $fallback) {
        $path = Join-Path $OutDir 'scan_001.jpg'
        Convert-ToJpeg $fallback $path
        Write-ScanJson -Ok $true -Images @($path)
        exit 0
      }
    } catch { }
    $detail = if ($msg) { $msg } else { 'the Windows scan dialog did not return an image' }
    Write-ScanJson -Ok $false -ErrorText ("Document feeder did not capture a page ($detail). Load paper in the Epson RR-600W, pick that scanner in the Windows dialog, and try again.")
    exit 1
  }
  if ($msg -match 'cancelled by the user|0x80210064') {
    Write-ScanJson -Ok $true -Cancelled $true
    exit 0
  }
  Write-ScanJson -Ok $false -ErrorText $msg
  exit 1
}
