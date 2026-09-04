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

function Convert-ToJpeg($image, $path) {
  $jpeg = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
  }
  $format = ''
  try { $format = [string]$image.FormatID } catch { $format = '' }
  if ($format -eq $jpeg) {
    [void]$image.SaveFile($path)
    return
  }
  $ip = New-Object -ComObject WIA.ImageProcess
  [void]$ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
  $ip.Filters.Item(1).Properties.Item('FormatID').Value = $jpeg
  try {
    $ip.Filters.Item(1).Properties.Item('Quality').Value = 90
  } catch { }
  $converted = $ip.Apply($image)
  [void]$converted.SaveFile($path)
}

function Connect-Scanner([string]$id) {
  $mgr = New-Object -ComObject WIA.DeviceManager
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
  $paths = New-Object System.Collections.Generic.List[string]

  $device = $null
  try {
    $device = Connect-Scanner $DeviceId
  } catch {
    $device = $null
  }

  if ($device) {
    if ($useFeeder) {
      Set-WiaProp $device 3088 1 | Out-Null
    } else {
      Set-WiaProp $device 3088 2 | Out-Null
    }
    $item = $device.Items.Item(1)
    Set-WiaProp $item 6146 $intent | Out-Null
    Set-WiaProp $item 6147 $Dpi | Out-Null
    Set-WiaProp $item 6148 $Dpi | Out-Null
    Reset-WiaExtents $item
    if ($hasRegion -and -not $Preview) {
      $regionApplied = Apply-WiaRegion $item $RegionX $RegionY $RegionW $RegionH
    }

    $n = 0
    $limit = if ($useFeeder) { $MaxPages } else { 1 }
    while ($n -lt $limit) {
      $image = $null
      try {
        $raw = @(Transfer-WithRetry $item $preferSilent)
        $image = $raw | Select-Object -Last 1
      } catch {
        if ($n -eq 0) { throw }
        break
      }
      if ($null -eq $image) { break }
      $n++
      $path = Join-Path $OutDir ('scan_{0:D3}.jpg' -f $n)
      Convert-ToJpeg $image $path
      $paths.Add($path)
      if (-not $useFeeder) { break }
    }
  }

  if ($paths.Count -eq 0) {
    if ($Preview -or $hasRegion) {
      throw 'Scanner did not return a preview. Check that the device is on and selected.'
    }
    $image = $null
    try {
      $image = Acquire-WithCommonDialog
    } catch {
      throw
    }
    if ($null -eq $image) {
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
  if ($msg -match 'cancelled by the user|0x80210064|0x80210017') {
    Write-ScanJson -Ok $true -Cancelled $true
    exit 0
  }
  Write-ScanJson -Ok $false -ErrorText $msg
  exit 1
}
