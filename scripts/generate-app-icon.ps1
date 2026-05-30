Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$assetDir = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngEntries = @()

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Convert-X {
  param([float]$Value, [float]$Scale, [float]$Offset)
  return ($Value * $Scale) + $Offset
}

function Convert-Y {
  param([float]$Value, [float]$Scale, [float]$Offset)
  return ($Value * $Scale) + $Offset
}

foreach ($size in $sizes) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $cornerRadius = $size * 0.22
  $bgPath = New-RoundedRectanglePath 0 0 $size $size $cornerRadius

  $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 17, 20, 24))
  $graphics.FillPath($bgBrush, $bgPath)

  $iconScale = $size / 24.0
  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 53, 210, 127)), ([Math]::Max(1.5, $size * 0.075))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $lines = @(
    @(3, 5, 21, 5),
    @(3, 12, 10, 12),
    @(3, 19, 10, 19)
  )

  foreach ($line in $lines) {
    $graphics.DrawLine(
      $linePen,
      (Convert-X $line[0] $iconScale 0),
      (Convert-Y $line[1] $iconScale 0),
      (Convert-X $line[2] $iconScale 0),
      (Convert-Y $line[3] $iconScale 0)
    )
  }

  $playPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $playPoints = @(
    (New-Object System.Drawing.PointF (Convert-X 15.2 $iconScale 0), (Convert-Y 11.2 $iconScale 0)),
    (New-Object System.Drawing.PointF (Convert-X 21.6 $iconScale 0), (Convert-Y 15.0 $iconScale 0)),
    (New-Object System.Drawing.PointF (Convert-X 15.2 $iconScale 0), (Convert-Y 18.8 $iconScale 0))
  )
  $playPath.AddPolygon($playPoints)

  $playBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 53, 210, 127))
  $graphics.FillPath($playBrush, $playPath)

  $pngPath = Join-Path $assetDir "app-icon-$size.png"
  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngEntries += [PSCustomObject]@{
    Size = $size
    Bytes = [System.IO.File]::ReadAllBytes($pngPath)
  }

  $playBrush.Dispose()
  $playPath.Dispose()
  $linePen.Dispose()
  $bgBrush.Dispose()
  $bgPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$icoPath = Join-Path $assetDir 'app-icon.ico'
$stream = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create), ([System.IO.FileAccess]::Write)
$writer = New-Object System.IO.BinaryWriter $stream

$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$pngEntries.Count)

$dataOffset = 6 + (16 * $pngEntries.Count)
foreach ($entry in $pngEntries) {
  $writer.Write([byte]$(if ($entry.Size -ge 256) { 0 } else { $entry.Size }))
  $writer.Write([byte]$(if ($entry.Size -ge 256) { 0 } else { $entry.Size }))
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$entry.Bytes.Length)
  $writer.Write([UInt32]$dataOffset)
  $dataOffset += $entry.Bytes.Length
}

foreach ($entry in $pngEntries) {
  $writer.Write($entry.Bytes)
}

$writer.Dispose()
$stream.Dispose()

Write-Host "Wrote $icoPath"
