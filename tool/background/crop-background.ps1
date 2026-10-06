param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][double]$Aspect,
  [int]$Y = -1,                 # fixed crop top; -1 = auto-pick the brightest header zone
  [int]$OutWidth = 1200,
  [int]$Quality = 80
)
# ASCII-only: crop a window of the requested aspect (fixed Y or brightest-header-zone) and save as JPEG.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Lum([System.Drawing.Color]$c) { return (0.2126 * $c.R + 0.7152 * $c.G + 0.0722 * $c.B) / 255.0 }

$img = [System.Drawing.Image]::FromFile($Src)
$srcW = $img.Width; $srcH = $img.Height
$winH = [int][math]::Floor($srcW / $Aspect)
if ($winH -gt $srcH) { $winH = $srcH }
$winW = [int][math]::Floor($winH * $Aspect)
if ($winW -gt $srcW) { $winW = $srcW }

if ($Y -ge 0) {
  $bestY = [math]::Min($Y, $srcH - $winH)
} else {
  $bestY = 0; $best = -1.0
  for ($y = 0; $y -le ($srcH - $winH); $y += [int][math]::Max(60, $winH / 12)) {
    $sum = 0.0; $n = 0
    for ($gy = 0; $gy -lt 14; $gy++) {
      $py = $y + [int][math]::Floor(($gy + 0.5) * $winH * 0.2 / 14)
      if ($py -ge $srcH) { continue }
      for ($gx = 0; $gx -lt 14; $gx++) {
        $px = [int][math]::Floor(($gx + 0.5) * $winW / 14)
        if ($px -ge $srcW) { continue }
        $sum += Lum $img.GetPixel($px, $py); $n++
      }
    }
    $m = $sum / [math]::Max(1, $n)
    if ($m -gt $best) { $best = $m; $bestY = $y }
  }
  Write-Output ("auto y={0} headerLum={1}" -f $bestY, [math]::Round($best, 3))
}
Write-Output ("window {0}x{1} at y={2} of {3}x{4}" -f $winW, $winH, $bestY, $srcW, $srcH)

$outW = [int][math]::Min($OutWidth, $winW)
$outH = [int][math]::Round($outW / $Aspect)
$bmp = New-Object System.Drawing.Bitmap($outW, $outH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $outW, $outH)), (New-Object System.Drawing.Rectangle(0, $bestY, $winW, $winH)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters(1)
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int]$Quality)
$bmp.Save($Out, $codec, $p)
$bmp.Dispose(); $img.Dispose()
Write-Output ("saved {0} ({1}x{2}, {3} KB)" -f $Out, $outW, $outH, [math]::Round((Get-Item $Out).Length / 1KB))
