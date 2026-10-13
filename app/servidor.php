<?php
// Router para `php -S 127.0.0.1:8765 -t dist servidor.php`: el servidor integrado de PHP no
// atiende peticiones Range, y PMTiles las necesita. Solo intercepta los .pmtiles.
$ruta = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (str_ends_with($ruta, '.webmanifest')) { header('Content-Type: application/manifest+json'); return false; }
if (!str_ends_with($ruta, '.pmtiles')) return false;
if (str_contains($ruta, '..')) { http_response_code(400); return true; }
$f = realpath($_SERVER['DOCUMENT_ROOT'] . $ruta);
if ($f === false || !is_file($f)) { http_response_code(404); return true; }
$tam = filesize($f);
header('Accept-Ranges: bytes');
header('Content-Type: application/octet-stream');
header('Cache-Control: no-cache');
$ini = 0; $fin = $tam - 1;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
  if ($m[1] === '') { $ini = max(0, $tam - (int)$m[2]); }
  else { $ini = (int)$m[1]; if ($m[2] !== '') $fin = min((int)$m[2], $tam - 1); }
  if ($ini > $fin || $ini >= $tam) { http_response_code(416); header("Content-Range: bytes */$tam"); return true; }
  http_response_code(206);
  header("Content-Range: bytes $ini-$fin/$tam");
}
$n = $fin - $ini + 1;
header("Content-Length: $n");
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') return true;
$h = fopen($f, 'rb'); fseek($h, $ini);
while ($n > 0 && !feof($h)) { $trozo = fread($h, min(1 << 20, $n)); echo $trozo; $n -= strlen($trozo); flush(); }
fclose($h);
return true;
