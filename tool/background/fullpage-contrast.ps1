param(
  [Parameter(Mandatory = $true)][string]$BgRank,
  [Parameter(Mandatory = $true)][string]$BgHelp,
  [double]$Veil = 0.44,
  [int]$Downscale = 28
)
# ASCII-only: contrast audit for the FULL-PAGE artwork design.
# The page background is the artwork blurred by --bg-blur; blurring compresses luminance toward the
# local mean, so we model it by downscaling the artwork to 1/N and reading those pixels.
# Worst case for dark text = darkest blurred pixel (after the white veil).
# Element colours are NOT audited here: they only appear on the light build page (no artwork).
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Srgb([double]$c) {
  $v = $c / 255.0
  if ($v -le 0.03928) { return $v / 12.92 }
  return [math]::Pow((($v + 0.055) / 1.055), 2.4)
}
function RelLum($rgb) { return 0.2126 * (Srgb $rgb[0]) + 0.7152 * (Srgb $rgb[1]) + 0.0722 * (Srgb $rgb[2]) }
function HexRgb([string]$hex) {
  $h = $hex.TrimStart('#')
  return , @([Convert]::ToInt32($h.Substring(0, 2), 16), [Convert]::ToInt32($h.Substring(2, 2), 16), [Convert]::ToInt32($h.Substring(4, 2), 16))
}
function Contrast($fg, $bg) {
  $l1 = RelLum $fg; $l2 = RelLum $bg
  return ([math]::Max($l1, $l2) + 0.05) / ([math]::Min($l1, $l2) + 0.05)
}
function BlurredMin([string]$path) {
  $src = [System.Drawing.Bitmap]::new($path)
  $w = [math]::Max(8, [int]($src.Width / $Downscale)); $h = [math]::Max(8, [int]($src.Height / $Downscale))
  $small = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($small)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $min = $null; $max = $null; $minL = [double]::MaxValue; $maxL = -1.0
  for ($y = 0; $y -lt $h; $y += 2) {
    for ($x = 0; $x -lt $w; $x += 2) {
      $p = $small.GetPixel($x, $y)
      $rgb = @($p.R, $p.G, $p.B)
      $l = RelLum $rgb
      if ($l -lt $minL) { $minL = $l; $min = $rgb }
      if ($l -gt $maxL) { $maxL = $l; $max = $rgb }
    }
  }
  $small.Dispose(); $src.Dispose()
  return @{ min = $min; max = $max }
}

$T = @{
  text = '#1e2230'; text2 = '#4c5265'; muted = '#525965'; muted2 = '#555c68'
  accent = '#144f96'; accent2 = '#6139a8'; gold = '#6f4c00'; green = '#0b6445'; red = '#99332e'
}

$specs = @(
  @{ n = 'text 20px'; fg = 'text'; size = 20; bold = $false },
  @{ n = 'text-2 15px'; fg = 'text2'; size = 15; bold = $false },
  @{ n = 'muted 17px'; fg = 'muted'; size = 17; bold = $false },
  @{ n = 'muted-2 18px'; fg = 'muted2'; size = 18; bold = $false },
  @{ n = 'accent 18px bold'; fg = 'accent'; size = 18; bold = $true },
  @{ n = 'accent-2 16px'; fg = 'accent2'; size = 16; bold = $false },
  @{ n = 'gold 19px bold'; fg = 'gold'; size = 19; bold = $true },
  @{ n = 'green 16px'; fg = 'green'; size = 16; bold = $false },
  @{ n = 'red 15px'; fg = 'red'; size = 15; bold = $false }
)

foreach ($case in @(@{ name = 'rank'; path = $BgRank }, @{ name = 'help'; path = $BgHelp })) {
  $r = BlurredMin $case.path
  $lo = @(
    [int]($r.min[0] * (1 - $Veil) + 255 * $Veil),
    [int]($r.min[1] * (1 - $Veil) + 255 * $Veil),
    [int]($r.min[2] * (1 - $Veil) + 255 * $Veil))
  Write-Output ("== {0} ==  blurred {1} .. {2}  ->  after veil {3}" -f $case.name, ($r.min -join ','), ($r.max -join ','), ($lo -join ','))
  $fail = 0
  foreach ($spec in $specs) {
    $ratio = Contrast (HexRgb $T[$spec.fg]) $lo
    $need = if (($spec.size -ge 24) -or ($spec.bold -and $spec.size -ge 18.66)) { 3.0 } else { 4.5 }
    $ok = $ratio -ge $need
    if (-not $ok) { $fail++ }
    Write-Output ("   {0,-18} worst={1,5:N2}  need {2}  {3}" -f $spec.n, $ratio, $need, $(if ($ok) { 'PASS' } else { 'FAIL' }))
  }
  Write-Output ("   -> FAILED {0} / {1}" -f $fail, $specs.Count)
}
