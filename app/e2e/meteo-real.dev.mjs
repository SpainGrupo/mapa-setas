// Comprobación manual (desarrollo, una vez): consulta REAL a Open-Meteo y resumen del semáforo por especie.
// Requiere `npm run build` y `npm run servir`. No forma parte del e2e automático.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + '?e2e=1';
const CAPTURAS = join(dirname(fileURLToPath(import.meta.url)), 'capturas');
const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], locale: 'es-ES', timezoneId: 'Europe/Madrid' });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
let peticiones = 0;
p.on('request', (r) => { if (r.url().includes('open-meteo.com')) peticiones++; });
try {
  await p.goto(URL_APP);
  await p.getByRole('button', { name: 'Entendido' }).click();
  await p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
  await p.waitForSelector('body[data-meteo]', { state: 'attached', timeout: 60000 });
  const r = await p.evaluate(() => {
    const m = window.__setas.meteo();
    const s = Object.values(m.datos?.puntos ?? {})[0] ?? [];
    return { origen: m.origen, hoy: m.datos?.hoy, consulta: m.datos?.fecha_consulta, n: Object.keys(m.datos?.puntos ?? {}).length,
      desde: s[0]?.fecha, hasta: s.at(-1)?.fecha, dias: s.length, resumen: window.__setas.resumenSemaforo() };
  });
  console.log(JSON.stringify({ ...r, peticiones }, null, 1));
  await p.evaluate(() => window.__setas.mapa.jumpTo({ center: [-5.244, 36.589], zoom: 10 }));
  await p.locator('[data-capa=semaforo]').evaluate((c) => { c.checked = true; c.dispatchEvent(new Event('change')); });
  await p.locator('#mapa canvas').click({ position: { x: 200, y: 450 } });
  await p.locator('#tarjeta-zona').waitFor();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: join(CAPTURAS, 'real-01-mapa-semaforo.png') });
  await p.locator('#tz-ver').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(CAPTURAS, 'real-02-zona.png'), fullPage: true });
  await p.locator('#zona-grafico').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'real-03-grafico.png') });
  console.log('errores:', errores);
} finally { await nav.close(); }
