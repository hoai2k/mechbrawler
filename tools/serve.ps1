# JJK Brawler II — zero-dependency static server for Windows (PowerShell only).
# Started by play-windows.bat when neither node nor python is installed.
param([int]$Port = 5174)

$root = Split-Path -Parent $PSScriptRoot   # tools\ -> game root
$rootFull = (Resolve-Path $root).Path
$url = "http://localhost:$Port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".mp3"  = "audio/mpeg"
  ".wav"  = "audio/wav"
  ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  # Port taken? The game is probably already running — just open it.
  Write-Host "Could not start on port $Port (already in use?). Opening browser anyway."
  Start-Process $url
  exit 0
}

Start-Process $url
Write-Host ""
Write-Host "JJK Brawler II is running at $url"
Write-Host "Keep this window open while playing. Close it to stop."

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
    $full = ""
    try { $full = [IO.Path]::GetFullPath($file) } catch {}

    if ($full -and $full.StartsWith($rootFull) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      else { $ctx.Response.ContentType = "application/octet-stream" }
      if ($ext -match "^\.(png|jpg|jpeg|webp|mp3|wav)$") {
        $ctx.Response.Headers.Add("Cache-Control", "max-age=3600")
      }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {
    # keep serving through individual request errors
  }
}
