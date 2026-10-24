# Generates the app icons (PNG) into ../icons
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $out | Out-Null

foreach ($size in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(47, 111, 94))

  $s = $size / 100.0
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  # house: roof + body
  $roof = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (50 * $s), (20 * $s)),
    (New-Object System.Drawing.PointF (84 * $s), (48 * $s)),
    (New-Object System.Drawing.PointF (16 * $s), (48 * $s)))
  $g.FillPolygon($white, $roof)
  $g.FillRectangle($white, (24 * $s), (46 * $s), (52 * $s), (36 * $s))
  # check mark
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(47, 111, 94)), (7 * $s)
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $g.DrawLines($pen, [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF (37 * $s), (63 * $s)),
    (New-Object System.Drawing.PointF (47 * $s), (72 * $s)),
    (New-Object System.Drawing.PointF (64 * $s), (54 * $s))))

  $bmp.Save((Join-Path $out "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output "icons written to $out"
