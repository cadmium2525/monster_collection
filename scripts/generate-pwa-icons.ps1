param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$iconDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'assets/icons'))
if (-not $iconDirectory.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Icon output directory must stay inside the project'
}
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

function New-RoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-PwaIcon([int]$size, [string]$fileName, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#07111f'))
    $margin = if ($maskable) { $size * 0.18 } else { $size * 0.07 }
    $radius = $size * 0.16
    $panel = New-RoundedRectanglePath $margin $margin ($size - 2 * $margin) ($size - 2 * $margin) $radius
    $panelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0d2234'))
    $goldPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#e8ba62'), [Math]::Max(4, $size * 0.024))
    $tealPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#69d8cd'), [Math]::Max(2, $size * 0.012))
    $graphics.FillPath($panelBrush, $panel)
    $graphics.DrawPath($goldPen, $panel)

    $fontSize = if ($maskable) { $size * 0.27 } else { $size * 0.31 }
    $font = [System.Drawing.Font]::new('Georgia', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $goldBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f2ca78'))
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = [System.Drawing.RectangleF]::new(0, -$size * 0.025, $size, $size)
    $graphics.DrawString('MC', $font, $goldBrush, $textRect, $format)
    $lineY = $size * 0.68
    $graphics.DrawLine($tealPen, $size * 0.34, $lineY, $size * 0.66, $lineY)

    $output = Join-Path $iconDirectory $fileName
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    foreach ($resource in @($format, $goldBrush, $font, $tealPen, $goldPen, $panelBrush, $panel, $graphics, $bitmap)) {
      if ($null -ne $resource) { $resource.Dispose() }
    }
  }
}

New-PwaIcon 192 'icon-192.png' $false
New-PwaIcon 512 'icon-512.png' $false
New-PwaIcon 512 'maskable-icon-512.png' $true
New-PwaIcon 1024 'maskable-icon-1024.png' $true
New-PwaIcon 180 'apple-touch-icon.png' $false

Write-Output "Generated PWA icons in $iconDirectory"
