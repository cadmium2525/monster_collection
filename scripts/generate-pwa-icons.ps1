param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$iconDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'assets/icons'))
if (-not $iconDirectory.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Icon output directory must stay inside the project'
}
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

$sourcePath = Join-Path $iconDirectory 'app-icon-source.png'
if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing app icon source: $sourcePath" }
$source = [System.Drawing.Image]::FromFile($sourcePath)

function New-PwaIcon([int]$size, [string]$fileName, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  try {
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#020713'))
    $scale = if ($maskable) { 0.88 } else { 1.0 }
    $drawSize = [int][Math]::Round($size * $scale)
    $offset = [int][Math]::Round(($size - $drawSize) / 2)
    $destination = [System.Drawing.Rectangle]::new($offset, $offset, $drawSize, $drawSize)
    $graphics.DrawImage($source, $destination, 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $output = Join-Path $iconDirectory $fileName
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    foreach ($resource in @($graphics, $bitmap)) {
      if ($null -ne $resource) { $resource.Dispose() }
    }
  }
}

try {
  New-PwaIcon 192 'icon-192.png' $false
  New-PwaIcon 512 'icon-512.png' $false
  New-PwaIcon 512 'maskable-icon-512.png' $true
  New-PwaIcon 1024 'maskable-icon-1024.png' $true
  New-PwaIcon 180 'apple-touch-icon.png' $false
}
finally {
  $source.Dispose()
}

Write-Output "Generated PWA icons in $iconDirectory"
