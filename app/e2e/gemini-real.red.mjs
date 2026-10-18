// e2e OPCIONAL y con red (no entra en `npm run e2e`): la app contra el Worker de Gemini REAL con una foto real.
// Reproduce el fallo «Gemini no funciona en la app» (2026-10-18): fotos → «Reconocer» → la app manda la petición tal
// como la mandaría desde GitHub Pages y debe pintar la respuesta de Gemini como primera opinión.
//
// El Worker solo acepta el origen https://spaingrupo.github.io: el test intercepta la petición de la app, la reenvía
// al Worker real con ese Origin (cuerpo y cabeceras de la app intactos) y devuelve la respuesta real con CORS para el
// origen local. Gasta una consulta del cupo diario del Worker.
//
//   FOTO=/ruta/a/foto.jpg URL_APP=http://127.0.0.1:8765/ node e2e/gemini-real.red.mjs
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const WORKER = process.env.WORKER_REAL ?? 'https://setas-identificar.setas-worker.workers.dev/identificar';
const ORIGEN = process.env.ORIGEN_REAL ?? 'https://spaingrupo.github.io';
const FOTO = process.env.FOTO ?? '';
const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + '?e2e=1';
const CAPTURAS = join(dirname(fileURLToPath(import.meta.url)), 'capturas-red');
const PROHIBIDO = /comestible|se puede comer/i;

if (!FOTO || !existsSync(FOTO)) {
  console.log(`OMITIDO: falta la foto (FOTO=${FOTO || '—'}). Este test es opcional.`);
  process.exit(0);
}
mkdirSync(CAPTURAS, { recursive: true });

let paso = 0;
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); console.log(`✔ ${++paso}. ${m}`); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['iPhone 13'], locale: 'es-ES', timezoneId: 'Europe/Madrid',
  geolocation: { latitude: 36.55, longitude: -4.95 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
const peticiones = [];
await ctx.route(WORKER, async (r) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-expose-headers': 'X-Restantes-Hoy' };
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const cuerpo = r.request().postData() ?? '';
  peticiones.push({ bytes: cuerpo.length, cabeceras: r.request().headers() });
  const t0 = Date.now();
  const resp = await r.fetch({ headers: { ...r.request().headers(), origin: ORIGEN }, timeout: 60000 });
  console.log(`  Worker real: HTTP ${resp.status()} en ${((Date.now() - t0) / 1000).toFixed(1)} s, cuerpo enviado ${(cuerpo.length / 1024).toFixed(0)} KB, restantes hoy ${resp.headers()['x-restantes-hoy'] ?? '—'}`);
  await r.fulfill({ status: resp.status(), body: await resp.body(), headers: { 'content-type': 'application/json', ...cors } });
});

try {
  await p.goto(URL_APP);
  await p.evaluate((u) => { localStorage.setItem('setas:e2e-worker-url', u); localStorage.setItem('setas:aviso-visto', '1'); }, WORKER);
  await p.reload();
  await p.waitForTimeout(1500);
  // Sin región elegida ni mapas descargados (como un iPhone recién instalado): se cierran los diálogos de arranque.
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.getByRole('button', { name: /Reconocer/ }).click();
  comprobar(/Con conexión responde Gemini/.test(await p.locator('#rec-estado').textContent()), 'con conexión, la app usa Gemini aunque el reconocedor no esté descargado');
  await p.locator('#rec-galeria').setInputFiles(FOTO);
  comprobar(await p.locator('#rec-analizar').isEnabled(), '«Reconocer» activo sin el reconocedor descargado');
  await p.locator('#rec-analizar').click();
  await p.waitForFunction(() => document.body.dataset.motor || document.querySelector('#rec-progreso')?.dataset.error, null, { timeout: 90000 });
  const r = await p.evaluate(() => ({ motor: document.body.dataset.motor ?? '', gemini: document.body.dataset.gemini ?? '',
    error: document.querySelector('#rec-progreso')?.dataset.error ? document.querySelector('#rec-progreso').textContent : '',
    cand: [...document.querySelectorAll('.rec-cand')].map((l) => `${l.dataset.nombre} (${l.dataset.confianza})`),
    dobles: [...document.querySelectorAll('#rec-peligrosas .peligrosa')].map((l) => l.dataset.id),
    otras: [...document.querySelectorAll('#rec-otras-mortales li')].map((l) => l.dataset.id),
    texto: document.querySelector('#p-reconocer').innerText }));
  await p.screenshot({ path: join(CAPTURAS, 'gemini-real.png'), fullPage: true });
  comprobar(peticiones.length === 1 && peticiones[0].bytes < 2 * 1024 * 1024, `una petición de ${(peticiones[0]?.bytes / 1024).toFixed(0)} KB`);
  comprobar(r.motor === 'gemini' && r.gemini === 'ok', `responde Gemini (motor=${r.motor}, gemini=${r.gemini}${r.error ? `, error: ${r.error}` : ''})`);
  comprobar(r.cand.length > 0, `candidatos: ${r.cand.join(', ')}`);
  comprobar(r.dobles.length > 0, `dobles peligrosos: ${r.dobles.join(', ')} · mortales aparte: ${r.otras.join(', ')}`);
  comprobar(!PROHIBIDO.test(r.texto), 'sin «comestible» ni «se puede comer»');
  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('e2e Gemini real OK');
} catch (e) {
  await p.screenshot({ path: join(CAPTURAS, 'gemini-real-error.png'), fullPage: true }).catch(() => {});
  console.error(e.message, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
