param(
  [Parameter(Mandatory = $true)][string]$BgRank,
  [Parameter(Mandatory = $true)][string]$BgHelp
)
# ASCII-only: hero-band text contrast computed from the SOURCE artwork + the CSS scrim formula
# (no glyph pixels involved). Scrim stops: 34% -> 0, 62% -> 0.55, 100% -> 0.88.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Srgb([double]$c) {
  $v = $c / 255.0
  if ($v -le 0.03928) { return $v / 12.92 }
  return [math]::Pow((($v + 0.055) / 1.055), 2.4)
}
function Lum([int]$r, [int]$g, [int]$b) { return 0.2126 * (Srgb $r) + 0.7152 * (Srgb $g) + 0.0722 * (Srgb $b) }

function ScrimAlpha([double]$frac) {
  if ($frac -le 0.34) { return 0.0 }
  if ($frac -le 0.62) { return 0.72 * ($frac - 0.34) / 0.28 }
  if ($frac -le 0.72) { return 0.72 + (0.85 - 0.72) * ($frac - 0.62) / 0.10 }
  if ($frac -le 1.0) { return 0.85 + (0.90 - 0.85) * ($frac - 0.72) / 0.28 }
  return 0.90
}

function Get-HeroContrast(
  [string]$path,
  [int]$bandTop, [int]$bandHeight,   # visible source band inside the crop image
  [double]$scale,                    # CSS px per source px (cover scale)
  [double]$bannerH,                  # banner height in CSS px
  [int]$txtTop, [int]$txtBottom,     # text band in source px
  [string]$label, [double]$need
) {
  $bmp = [System.Drawing.Bitmap]::new($path)
  $w = $bmp.Width
  $worst = 0.0; $worstRgb = @(0, 0, 0)
  for ($y = [math]::Max($bandTop, $txtTop); $y -le [math]::Min($bandTop + $bandHeight, $txtBottom); $y += 2) {
    $cssY = ($y - $bandTop) * $scale
    $a = ScrimAlpha ($cssY / $bannerH)
    for ($x = 0; $x -lt $w; $x += 4) {
      $px = $bmp.GetPixel($x, $y)
      $r = $px.R * (1 - $a) + 8 * $a
      $g = $px.G * (1 - $a) + 12 * $a
      $b = $px.B * (1 - $a) + 24 * $a
      $l = Lum ([int]$r) ([int]$g) ([int]$b)
      if ($l -gt $worst) { $worst = $l; $worstRgb = @([int]$r, [int]$g, [int]$b) }
    }
  }
  $bmp.Dispose()
  $ratio = 1.05 / ($worst + 0.05)
  $ok = $ratio -ge $need
  Write-Output ("{0,-28} worstBg={1,-14} whiteText={2,5:N2}:1  need {3}  {4}" -f $label, ($worstRgb -join ','), $ratio, $need, $(if ($ok) { 'PASS' } else { 'FAIL' }))
}

# rank banner: bg-rank.jpg 1200x2000 -> cover into 1086x210 CSS
#   scale = 1086/1200 = 0.905 ; visible band = 210/0.905 = 232 src px ; position 15% -> top = 265
Get-HeroContrast -path $BgRank -bandTop 265 -bandHeight 232 -scale 0.905 -bannerH 210 -txtTop 420 -txtBottom 490 -label 'rank hero title+subtitle' -need 4.5

# help banner: bg-help.jpg 1080x941 -> cover into 1156x250 CSS
#   scale = 1156/1080 = 1.074 ; visible band = 250/1.074 = 233 src px ; position 26% -> top = 184
Get-HeroContrast -path $BgHelp -bandTop 184 -bandHeight 233 -scale 1.074 -bannerH 250 -txtTop 380 -txtBottom 415 -label 'help hero title (34px)' -need 3.0




