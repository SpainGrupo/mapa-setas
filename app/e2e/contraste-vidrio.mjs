// Contraste del texto sobre el vidrio (Liquid Glass), medido sobre teselas reales (no es un test).
// Para cada escenario (mapa claro y satélite PNOA, con la hoja de acceso, las capas, la pista y la tarjeta de zona):
// 1) anota las cajas de cada línea de texto dentro de .vidrio y su color; 2) vuelve el texto transparente y captura;
// 3) dentro de cada caja busca el píxel de fondo más desfavorable y calcula el contraste WCAG con el color del texto.
// Salida: design/capturas/<carpeta>/contraste-vidrio.json y un resumen por consola. Requiere el servidor de `npm run servir`.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const CARPETA = process.argv[2] ?? 'final';
const DIR = join(AQUI, '../design/capturas', CARPETA);
mkdirSync(DIR, { recursive: true });
const HOY = '2026-10-14';
const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + `?e2e=1&hoy=${HOY}`;
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'fixtures/open-meteo.json'), 'utf8'));
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const ACCESO = { lat: 36.61083, lon: -5.24579 };
const PUNTO = { latitude: 36.589, longitude: -5.244 };

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  geolocation: PUNTO, permissions: ['geolocation'], locale: 'es-ES', timezoneId: 'Europe/Madrid' });
let puntosMeteo = null;
await ctx.route('**/api.open-meteo.com/**', async (r) => {
  puntosMeteo ??= await (await fetch(new URL('data/meteo_puntos.json', URL_APP))).json();
  const u = new URL(r.request().url());
  const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
  const rel = Array.from({ length: 46 }, (_, i) => i - 30);
  const una = (la, i) => ({ latitude: la, longitude: lon[i], elevation: puntosMeteo.find((q) => q.lat === la && q.lon === lon[i])?.alt_media ?? 0,
    daily: { time: rel.map((k) => sumar(HOY, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
      temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin),
      et0_fao_evapotranspiration: rel.map(() => FIXTURE.et0), relative_humidity_2m_min: rel.map(() => FIXTURE.hr_min) },
    hourly: { time: rel.flatMap((k) => Array.from({ length: 24 }, (_, h) => `${sumar(HOY, k)}T${String(h).padStart(2, '0')}:00`)),
      soil_moisture_9_to_27cm: rel.flatMap(() => Array(24).fill(FIXTURE.suelo)) } });
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(lat.length === 1 ? una(lat[0], 0) : lat.map(una)) });
});
const p = await ctx.newPage();
const reposo = () => p.evaluate(() => new Promise((r) => { const m = window.__setas.mapa; m.loaded() && m.areTilesLoaded() ? r() : m.once('idle', r); }));
const pulsarLargo = async (lat, lon) => {
  const pt = await p.evaluate(([la, lo]) => { const m = window.__setas.mapa, r = m.getCanvas().getBoundingClientRect(), q = m.project([lo, la]);
    return { x: r.left + q.x, y: r.top + q.y }; }, [lat, lon]);
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
};

/** Cajas de texto visibles dentro del vidrio, con el color del texto en sRGB. */
const cajas = () => p.evaluate(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true });
  const rgb = (c) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
  const out = [];
  for (const raiz of document.querySelectorAll('.vidrio')) {
    if (!raiz.checkVisibility()) continue;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement.checkVisibility() || n.parentElement.closest('.sr')) continue;   // .sr: solo lector de pantalla
      const cs = getComputedStyle(n.parentElement);
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
        out.push({ raiz: raiz.id || raiz.className.split(' ')[0], texto: n.textContent.trim().slice(0, 40), color: rgb(cs.color),
          peso: cs.fontWeight, tam: parseFloat(cs.fontSize), x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }
  }
  return out;
});

async function medir(nombre) {
  await p.waitForTimeout(700);
  const bs = await cajas();
  await p.addStyleTag({ content: '.vidrio, .vidrio * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } .vidrio input::after { opacity: 1; }', });
  await p.waitForTimeout(150);
  const png = await p.screenshot({ path: join(DIR, `contraste-${nombre}.png`) });
  await p.evaluate(() => document.querySelectorAll('style').forEach((s) => { if (s.textContent.includes('-webkit-text-fill-color: transparent')) s.remove(); }));
  return { nombre, bs, png };
}

/** Píxeles de la captura, decodificados en la propia página (canvas): sin dependencias extra. */
async function decodificar(buf) {
  const datos = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, data: Array.from(g.getImageData(0, 0, img.width, img.height).data) };
  }, buf.toString('base64'));
  return datos;
}

async function analizar({ nombre, bs, png }) {
  const img = await decodificar(png);
  const px = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  const filas = [];
  for (const b of bs) {
    let peor = Infinity, fondo = null;
    for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(img.height, Math.ceil(b.y + b.h)); y++)
      for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(img.width, Math.ceil(b.x + b.w)); x++) {
        const c = px(x, y), k = cr(b.color, c);
        if (k < peor) { peor = k; fondo = c; }
      }
    const grande = b.tam >= 24 || (b.tam >= 18.66 && +b.peso >= 700);
    filas.push({ ...b, contraste: +peor.toFixed(2), fondo, aa: peor >= (grande ? 3 : 4.5), grande });
  }
  const min = filas.reduce((m, f) => (f.contraste < m.contraste ? f : m), filas[0]);
  return { nombre, n: filas.length, minimo: min && { contraste: min.contraste, texto: min.texto, raiz: min.raiz, fondo: min.fondo, color: min.color },
    fallan: filas.filter((f) => !f.aa).map((f) => `${f.raiz} «${f.texto}» ${f.contraste}:1`), filas };
}

await p.goto(URL_APP);
await p.getByRole('button', { name: 'Entendido' }).click();
await p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
await p.evaluate(() => localStorage.removeItem('setas:pista-acceso'));
const informe = [];
for (const base of ['mapa', 'satelite']) {
  await p.evaluate((b) => localStorage.setItem('setas:base', b), base);
  await p.reload();
  await p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
  await p.waitForSelector(`body[data-base=${base}]`, { state: 'attached', timeout: 30000 });
  await p.evaluate(() => localStorage.removeItem('setas:pista-acceso'));
  await p.evaluate(() => { document.querySelector('#pista-acceso').hidden = false; });
  // Escenario 1: cromo en reposo (píldora, botones, pista, botones flotantes, pestañas) sobre una zona variada.
  for (const [i, z] of [14.2, 12].entries()) {
    await p.evaluate(({ lat, lon, z }) => window.__setas.mapa.jumpTo({ center: [lon, lat], zoom: z }), { ...ACCESO, z });
    await reposo();
    informe.push(await analizar(await medir(`${base}-reposo-${i + 1}`)));
  }
  await p.evaluate(({ lat, lon }) => window.__setas.mapa.jumpTo({ center: [lon, lat], zoom: 14.2 }), ACCESO);
  await reposo();
  await pulsarLargo(ACCESO.lat, ACCESO.lon);
  await p.locator('#tarjeta-acceso[data-estado=ok]').waitFor({ timeout: 15000 });
  await reposo();
  informe.push(await analizar(await medir(`${base}-acceso`)));
  await p.locator('#ta-cerrar').click();
  await p.locator('#btn-capas').click();
  informe.push(await analizar(await medir(`${base}-capas`)));
  await p.locator('#btn-capas').click();
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 10 }), PUNTO);
  await reposo();
  const caja = await p.locator('#mapa canvas').boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.locator('#tarjeta-zona').waitFor();
  informe.push(await analizar(await medir(`${base}-zona`)));
  await p.locator('#tz-cerrar').click();
}
writeFileSync(join(DIR, 'contraste-vidrio.json'), JSON.stringify(informe.map(({ filas, ...r }) => ({ ...r, filas: filas.map(({ x, y, w, h, ...f }) => f) })), null, 1));
for (const r of informe) console.log(`${r.nombre.padEnd(18)} ${String(r.n).padStart(3)} líneas · mínimo ${r.minimo?.contraste}:1 («${r.minimo?.texto}» en ${r.minimo?.raiz})${r.fallan.length ? ' · FALLAN: ' + r.fallan.join('; ') : ' · todo AA'}`);
await nav.close();
