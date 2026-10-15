// Capturas del rediseño (no es un test): todas las pantallas a 430×932 (iPhone Pro Max) en
// design/capturas/<carpeta>/ (primer argumento; por defecto «final»). Simula las zonas seguras del iPhone
// (59 px arriba, 34 abajo) y dibuja la isla dinámica y el indicador de inicio encima, para juzgar el cromo.
// Usa la red real (teselas, satélite PNOA, Open-Meteo). Requiere `npm run build` y el servidor de `npm run servir`.
// Opciones: --solo=mapa,hoy,… para repetir solo unas pantallas; --sin-modelo para saltar el reconocedor.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const CARPETA = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'final';
const SOLO = (process.argv.find((a) => a.startsWith('--solo='))?.slice(7) ?? '').split(',').filter(Boolean);
const quiere = (x) => !SOLO.length || SOLO.includes(x);
const DIR = join(AQUI, '../design/capturas', CARPETA);
mkdirSync(DIR, { recursive: true });
const HOY = '2026-10-14';
const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + `?e2e=1&hoy=${HOY}`;
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'fixtures/open-meteo.json'), 'utf8'));
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const FOTOS_GUIA = join(AQUI, '../../guia/fotos');
const PUNTO = { latitude: 36.589, longitude: -5.244 };
const ACCESO = { lat: 36.61083, lon: -5.24579 };

const MARCO = `
  :root { --sup: 59px !important; --inf: 34px !important; }
  body::after { content: ''; position: fixed; z-index: 2147483647; left: 50%; top: 11px; width: 126px; height: 37px; margin-left: -63px; border-radius: 20px; background: #000; pointer-events: none; }
  html::after { content: ''; position: fixed; z-index: 2147483647; left: 50%; bottom: 8px; width: 140px; height: 5px; margin-left: -70px; border-radius: 3px; background: #111; pointer-events: none; }`;

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  geolocation: PUNTO, permissions: ['geolocation'], locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: process.env.TEMA === 'oscuro' ? 'dark' : 'light',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
// Open-Meteo con el fixture del e2e (los mismos días y estados que la prueba): las capturas no dependen del tiempo real.
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
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
const marco = () => p.addStyleTag({ content: MARCO });
const cap = async (n) => { await p.waitForTimeout(450); await p.screenshot({ path: join(DIR, `${n}.png`) }); console.log('📷', n); };
const tab = (id) => p.locator(`.pestanas button[data-p=${id}]`).click();
const reposo = () => p.evaluate(() => new Promise((r) => { const m = window.__setas.mapa; m.loaded() && m.areTilesLoaded() ? r() : m.once('idle', r); }));
const pulsarLargo = async (lat, lon) => {
  const pt = await p.evaluate(([la, lo]) => { const m = window.__setas.mapa, r = m.getCanvas().getBoundingClientRect(), q = m.project([lo, la]);
    return { x: r.left + q.x, y: r.top + q.y }; }, [lat, lon]);
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
};
const scrollA = (sel, extra = 0) => p.evaluate(([s, e]) => { const el = document.querySelector(s); const pan = el.closest('.pantalla');
  pan.scrollTo(0, el.getBoundingClientRect().top + pan.scrollTop - 110 - e); }, [sel, extra]);

await p.goto(URL_APP);
await marco();
await p.getByRole('button', { name: 'Entendido' }).click();
await p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
await p.evaluate(() => localStorage.removeItem('setas:pista-acceso'));

if (quiere('mapa')) {
  await p.reload(); await marco();
  await p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
  await p.evaluate(({ lat, lon }) => window.__setas.mapa.jumpTo({ center: [lon, lat], zoom: 14.2 }), ACCESO);
  await reposo();
  await cap('01-mapa');
  await p.locator('#btn-mira').click();
  await cap('02-mapa-aqui');
  await p.locator('#mira-cancelar').click();
  await pulsarLargo(ACCESO.lat, ACCESO.lon);
  await p.locator('#tarjeta-acceso[data-estado=ok]').waitFor({ timeout: 15000 });
  await reposo();
  await cap('03-mapa-acceso');
  await p.locator('#ta-ruta').click();
  await p.waitForSelector('body[data-ruta=ok]', { state: 'attached', timeout: 15000 });
  await reposo();
  await cap('04-ruta-a-pie');
  // Hoja a pantalla completa (arrastre) para ver el perfil entero
  const asa = await p.locator('#tarjeta-ruta .hoja-asa').boundingBox();
  await p.mouse.move(asa.x + 40, asa.y + 20); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(asa.x + 40, asa.y + 20 - i * 50);
  await p.mouse.up();
  await p.waitForTimeout(600);
  await cap('05-ruta-perfil');
  const lin = await p.evaluate(() => window.__setas.ruta().linea);
  await p.locator('#ru-seguir-btn').click();
  await ctx.setGeolocation({ latitude: lin[4][1], longitude: lin[4][0], accuracy: 8 });
  await p.waitForFunction(() => window.__setas.seguimiento());
  await cap('06-ruta-gps');
  await ctx.setGeolocation({ latitude: lin[4][1] + 0.0015, longitude: lin[4][0], accuracy: 8 });
  await p.waitForFunction(() => window.__setas.seguimiento()?.fuera);
  await cap('06b-ruta-gps-fuera');
  await p.locator('#ru-seguir-btn').click();
  await p.locator('#ru-cerrar').click();
  await ctx.setGeolocation(PUNTO);
  await p.locator('#btn-capas').click();
  await cap('07-capas');
  await p.locator('.base-mapa span', { hasText: 'Satélite' }).click();
  await p.locator('#btn-capas').click();
  await pulsarLargo(ACCESO.lat, ACCESO.lon);
  await p.locator('#tarjeta-acceso[data-estado=ok]').waitFor({ timeout: 15000 });
  await reposo();
  await cap('08-satelite-acceso');
  await p.locator('#ta-cerrar').click();
  await p.locator('#btn-capas').click();
  await p.locator('.base-mapa span', { hasText: 'Mapa' }).click();
  await p.locator('#btn-capas').click();
  await p.locator('#btn-especie').click();
  await p.locator('#dlg-especie[open]').waitFor();
  await cap('09-elegir-especie');
  await p.keyboard.press('Escape');
}

if (quiere('hoy')) {
  await tab('p-hoy');
  await p.waitForSelector('#top-general .top-fila', { timeout: 30000 });
  await cap('10-hoy');
  await p.locator('#top-general .top-fila .tf-mas').first().click();
  await cap('11-hoy-mas');
  await p.locator('#top-general .top-fila .tf-mas').first().click();
  await scrollA('#tit-calendario');
  await cap('12-calendario');
  await tab('p-mapa');
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 10 }), PUNTO);
  await reposo();
  const caja = await p.locator('#mapa canvas').boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.locator('#tarjeta-zona').waitFor();
  await cap('13a-mapa-zona');
  await p.locator('#tz-cerrar').click();
  await tab('p-hoy');
  await p.locator('#hoy-zona').click();
  await p.waitForTimeout(800);
  await cap('13-zona');
}

if (quiere('ventana')) {
  // Ficha con «Cuándo está activa» (desde el calendario de Hoy) y selector con las activas hoy arriba.
  await p.waitForSelector('body[data-meteo]', { state: 'attached', timeout: 30000 });
  await tab('p-hoy');
  await p.waitForSelector('#top-general .top-fila', { timeout: 30000 });
  await p.locator('#calendario .cal-fila[data-especie=boletus_aereus]').click();
  await p.locator('#guia-ficha[data-id=boletus_aereus] .cuando').waitFor();
  await p.evaluate(() => { const s = document.querySelector('#guia-ficha .cuando'), pan = s.closest('.pantalla');
    pan.scrollTo(0, s.getBoundingClientRect().top + pan.scrollTop - 230); });
  await cap('ficha-calendario');
  await p.locator('#guia-ficha .btn-volver').click();
  await tab('p-mapa');
  await p.locator('#btn-especie').click();
  await p.locator('#dlg-especie[open]').waitFor();
  await p.locator('#lista-especies .se-divisor').scrollIntoViewIfNeeded();
  await cap('selector-activas');
  await p.keyboard.press('Escape');
}

if (quiere('sitios')) {
  await tab('p-mapa');
  await p.getByRole('button', { name: 'Guardar sitio aquí' }).click();
  await p.locator('#dlg-sitio[open]').waitFor();
  await p.locator('#acceso-sitio:not([data-estado=buscando])').waitFor({ timeout: 15000 });
  await p.locator('.estrellas span', { hasText: /^★★$/ }).click();
  await p.locator('textarea[name=nota]').fill('Junto al alcornoque grande, bajando por la pista.');
  await cap('14-nuevo-sitio');
  await p.locator('#btn-sitio-guardar').click();
  await tab('p-sitios');
  await p.locator('.sitio').first().waitFor();
  await cap('15-mis-sitios');
}

if (quiere('guia')) {
  await tab('p-guia');
  await p.locator('.tarjeta-guia').first().waitFor();
  await cap('16-guia');
  await p.locator('.tarjeta-guia[data-id=amanita_caesarea]').click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  await cap('17-ficha-oronja');
  await p.locator('.btn-volver').click();
}

if (quiere('ajustes') || quiere('reconocer')) {
  await tab('p-ajustes');
  await cap('18-ajustes');
}

if (quiere('reconocer') && !process.argv.includes('--sin-modelo')) {
  if (!/Descargado el/.test(await p.locator('#estado-modelo').textContent())) {
    await p.locator('#btn-modelo').click();
    await p.waitForFunction(() => /Descargado el/.test(document.querySelector('#estado-modelo').textContent), null, { timeout: 600000 });
  }
  await tab('p-reconocer');
  await p.locator('#rec-galeria').setInputFiles(join(FOTOS_GUIA, 'amanita_caesarea_2.jpg'));
  await cap('19-reconocer-fotos');
  await p.locator('#rec-analizar').click();
  await p.waitForSelector('body[data-reconocer=resultado]', { state: 'attached', timeout: 180000 });
  await scrollA('#rec-resultado', -20);
  await cap('20-reconocer-resumen');
  await scrollA('#rec-comparar');
  await cap('21-reconocer-comparar');
  await scrollA('#rec-par .par-dibujos');
  await cap('22-reconocer-dibujos');
  await scrollA('#rec-par .par-tabla');
  await cap('23-reconocer-tabla');
  await scrollA('#rec-par .falso-positivo');
  await cap('24-reconocer-falso-positivo');
  await p.locator('.par-tab[data-id=amanita_muscaria]').click();
  await scrollA('#rec-comparar');
  await cap('25-reconocer-matamoscas');
  await p.locator('fieldset[data-pregunta=interior_huevo] input[value=naranja_amarillo]').check();
  await p.locator('.par-tab[data-id=amanita_phalloides]').click();
  await scrollA('#rec-comparar');
  await cap('26-reconocer-descartada');
  await scrollA('#rec-preguntas');
  await cap('27-reconocer-preguntas');
  await p.locator('.rec-cand').first().locator('button', { hasText: 'Ver ficha' }).click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  await cap('28-ficha-desde-reconocer');
}

console.log(errores.length ? `ERRORES: ${errores.join(' | ')}` : 'sin errores de página');
await nav.close();
