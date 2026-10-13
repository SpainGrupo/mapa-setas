// Capturas de auditoría UI (no es un test): recorre todas las pantallas a 390×844 y 360×740 y deja PNG en
// e2e/capturas/auditoria/<fase>/ (fase = antes|despues, primer argumento). También informa de controles visibles
// con área táctil < 48 px. Requiere `npm run build` y `php -S 127.0.0.1:8765 -t dist servidor.php`.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const FASE = process.argv[2] ?? 'antes';
const CON_MODELO = !process.argv.includes('--sin-modelo');
const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + '?e2e=1';
const PUNTO = { latitude: 36.589, longitude: -5.244 };
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'fixtures/open-meteo.json'), 'utf8'));
const FOTOS_GUIA = join(AQUI, '../../guia/fotos');
const VISTAS = [{ w: 390, h: 844 }, { w: 360, h: 740 }];

const fechaMadrid = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

const pequenos = (p) => p.evaluate(() => {
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, label.btn, .chip';
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight; };
  return [...document.querySelectorAll(sel)].filter((e) => vis(e) && !e.closest('[hidden]'))
    .map((e) => { const r = e.getBoundingClientRect(); const t = e.closest('label') && e.matches('input') ? e.closest('label') : e;
      const rr = t.getBoundingClientRect(); return { n: (e.id || e.className || e.tagName) + ' «' + (t.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24) + '»', w: Math.round(rr.width), h: Math.round(rr.height) }; })
    .filter((x) => x.w < 44 || x.h < 44);
});

const nav = await chromium.launch();
const informe = {};
for (const v of VISTAS) {
  const dir = join(AQUI, 'capturas/auditoria', FASE);
  mkdirSync(dir, { recursive: true });
  const ctx = await nav.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    geolocation: PUNTO, permissions: ['geolocation'], locale: 'es-ES', timezoneId: 'Europe/Madrid',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
  let puntosMeteo = null;
  await ctx.route('**/api.open-meteo.com/**', async (r) => {
    puntosMeteo ??= await (await fetch(new URL('data/meteo_puntos.json', URL_APP))).json();
    const u = new URL(r.request().url());
    const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
    const hoy = fechaMadrid(new Date());
    const rel = Array.from({ length: 37 }, (_, i) => i - 30);
    const una = (la, i) => ({ latitude: la, longitude: lon[i],
      elevation: puntosMeteo.find((q) => q.lat === la && q.lon === lon[i])?.alt_media ?? 0,
      daily: { time: rel.map((k) => sumar(hoy, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
        temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin) } });
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(lat.length === 1 ? una(lat[0], 0) : lat.map(una)) });
  });
  const p = await ctx.newPage();
  const tag = `${v.w}x${v.h}`;
  const cap = async (n) => { await p.waitForTimeout(250); await p.screenshot({ path: join(dir, `${tag}-${n}.png`) });
    informe[`${tag}-${n}`] = await pequenos(p); };
  const tab = (id) => p.locator(`.pestanas button[data-p=${id}]`).click();
  const reposo = () => p.evaluate(() => new Promise((r) => { const m = window.__setas.mapa; m.loaded() && m.areTilesLoaded() ? r() : m.once('idle', r); }));

  await p.goto(URL_APP);
  await p.locator('#dlg-inicio[open]').waitFor();
  await cap('01-inicio');
  await p.getByRole('button', { name: 'Entendido' }).click();
  await p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
  await reposo();
  await cap('02-mapa');
  await p.locator('#btn-capas').click();
  await cap('03-mapa-capas');
  await p.locator('#btn-capas').click();
  await tab('p-zona');
  await cap('04-zona-vacia');
  await tab('p-mapa');
  await p.waitForSelector('body[data-meteo]', { state: 'attached', timeout: 30000 });
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 10 }), PUNTO);
  await reposo();
  const caja = await p.locator('#mapa canvas').boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.locator('#tarjeta-zona').waitFor();
  await cap('05-mapa-tarjeta');
  await p.locator('#tz-ver').click();
  await p.locator('#lista-semaforo .semaforo-fila').first().waitFor();
  await cap('06-zona');
  await p.locator('#zona-grafico').scrollIntoViewIfNeeded();
  await cap('07-zona-grafico');
  await tab('p-guia');
  await p.locator('.tarjeta-guia').first().waitFor();
  await cap('08-guia');
  await p.locator('.tarjeta-guia[data-id=amanita_caesarea]').click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  await cap('09-ficha-caesarea');
  await p.locator('#guia-ficha .comparar[data-id=amanita_phalloides]').scrollIntoViewIfNeeded();
  await cap('10-ficha-no-confundir');
  await p.locator('#guia-ficha .comparar[data-id=amanita_phalloides]').click();
  await p.locator('#guia-ficha[data-id=amanita_phalloides]').waitFor();
  await cap('11-ficha-phalloides');
  await p.locator('.btn-volver').click();
  await tab('p-reconocer');
  await cap('12-reconocer');
  await tab('p-sitios');
  await cap('13-sitios-vacio');
  await tab('p-ajustes');
  await cap('14-ajustes');
  await tab('p-mapa');
  await p.getByRole('button', { name: 'Guardar sitio aquí' }).click();
  await p.locator('#dlg-sitio[open]').waitFor();
  await cap('15-nuevo-sitio');
  await p.locator('#btn-sitio-guardar').click();
  await tab('p-sitios');
  await p.locator('#lista-sitios li').first().waitFor();
  await cap('16-sitios');
  if (CON_MODELO) {
    await tab('p-ajustes');
    await p.locator('#btn-modelo').click();
    await p.waitForFunction(() => /Descargado el/.test(document.querySelector('#estado-modelo').textContent), null, { timeout: 600000 });
    await tab('p-reconocer');
    await p.locator('#rec-galeria').setInputFiles(join(FOTOS_GUIA, 'amanita_caesarea_1.jpg'));
    await cap('17-reconocer-foto');
    await p.locator('#rec-analizar').click();
    await p.waitForSelector('body[data-reconocer=resultado]', { state: 'attached', timeout: 180000 });
    await p.locator('#rec-resultado').scrollIntoViewIfNeeded();
    await cap('18-reconocer-resultado');
    await p.locator('#rec-peligrosas').scrollIntoViewIfNeeded();
    await cap('19-reconocer-peligrosas');
    await p.locator('fieldset[data-pregunta=interior_huevo] input[value=blanco]').check();
    await p.waitForSelector('body[data-alerta=mortal]', { state: 'attached' });
    await p.locator('#rec-alertas .alerta-roja').scrollIntoViewIfNeeded();
    await cap('20-reconocer-alerta');
    await p.locator('#rec-aviso-final').scrollIntoViewIfNeeded();
    await cap('21-reconocer-final');
  }
  await ctx.close();
}
await nav.close();
console.log(JSON.stringify(informe, null, 1));
