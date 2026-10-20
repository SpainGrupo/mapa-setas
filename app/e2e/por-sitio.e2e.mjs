// e2e de Hoy «Por sitio» (2026-10-20): el conmutador «Por seta | Por sitio» cambia «Los 10 mejores» a zonas donde
// coinciden varias setas (zonas.ts). Cada zona trae su sublista de setas con semáforo y puntuación, la frase «por qué»,
// enlace a Google Maps, distancia, dificultad y titularidad; ninguna seta en rojo; sitios a ≤ 400 m del ancla; el orden
// por probabilidad sigue la puntuación de la zona; un grupo filtra las setas; la vista se recuerda al recargar.
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const URL_APP = BASE + '?e2e=1&hoy=2026-10-14';
const CAPTURAS = join(AQUI, 'capturas'); mkdirSync(CAPTURAS, { recursive: true });
const PROHIBIDO = /comestib|se puede comer/i;
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], geolocation: { latitude: 36.589, longitude: -5.244 }, permissions: ['geolocation'],
  locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));   // el tiempo no es objeto de este e2e
await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
const zonas = () => p.evaluate(() => window.__setas.tops());
try {
  await p.goto(URL_APP);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 15000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForSelector('#top-especie .top-fila');
  comprobar(await p.locator('#hoy-vista [data-vista=seta]').getAttribute('aria-pressed') === 'true'
    && (await p.locator('#tit-top-especie').textContent()) === 'Los 10 mejores por seta' && !(await p.locator('#top-especie .top-zona').count()),
    'por defecto, «Por seta» con el top de siempre');

  // Todas las setas: elegir un grupo con varias especies no hace falta; con una seta elegida, zonas donde está ella.
  await p.locator('#hoy-vista [data-vista=sitio]').click();
  await p.waitForFunction(() => window.__setas.tops().vista === 'sitio' && document.querySelector('#top-especie .top-zona'));
  let t = await zonas();
  const nFilas = await p.locator('#top-especie > li.top-zona').count();
  comprobar(nFilas >= 1 && nFilas <= 15 && nFilas === t.zonas.length, `«Por sitio»: ${nFilas} zonas (≤ 15)`);
  comprobar(t.zonas.every((z) => z.entradas.some((e) => e.especie === t.especie)), `con una seta elegida (${t.especie}), todas las zonas la incluyen`);
  comprobar(t.zonas.every((z) => z.extension_m <= 400 && z.entradas.every((e) => e.estado !== 'rojo')
    && new Set(z.entradas.map((e) => e.especie)).size === z.entradas.length), 'sitios a ≤ 400 m del ancla, sin rojos, una entrada por seta');

  // Grupo «todo el grupo» con varias especies y luego todas las setas vía el primer grupo grande.
  const grupos = await p.$$eval('#hoy-especie option', (os) => os.map((o) => o.value).filter((v) => v.startsWith('grupo:')));
  comprobar(grupos.length > 0, `hay ${grupos.length} grupos en el selector`);
  await p.locator('#hoy-especie').selectOption(grupos[0]);
  await p.waitForFunction((g) => window.__setas.tops().especie === g, grupos[0]);
  t = await zonas();
  const delGrupo = await p.$eval('#hoy-especie', (s, g) => [...s.querySelectorAll(`option[data-grupo="${g.slice(6)}"]`)].map((o) => o.value), grupos[0]);
  comprobar(t.zonas.length > 0 && t.zonas.every((z) => z.entradas.every((e) => delGrupo.includes(e.especie))), `${grupos[0]}: solo setas del grupo`);
  const multi = t.zonas.filter((z) => z.entradas.length > 1).length;
  comprobar(true, `${multi} de ${t.zonas.length} zonas con varias setas del grupo`);

  // Contenido de una fila de zona.
  const fila = p.locator('#top-especie > li.top-zona').first();
  const n = await fila.locator('.tf-zona-especies > li').count();
  const chips = await fila.locator('.tf-zona-especies > li .chip-estado').count();
  const pts = await fila.locator('.tf-zona-especies .tf-zona-pts').allTextContents();
  comprobar(n >= 1 && chips === n && pts.every((x) => /^\d+\/100$/.test(x)), `sublista de ${n} setas con semáforo y puntuación (${pts.join(', ')})`);
  const razon = await fila.locator('.tf-razon').textContent();
  comprobar(/^Zona \d+\/100: /.test(razon) && /Mejor sitio, .+: Puntuación \d+\/100 por hábitat/.test(razon), `por qué: «${razon.slice(0, 90)}…»`);
  const href = await fila.locator('a.tf-google').getAttribute('href');
  comprobar(/^https:\/\/www\.google\.com\/maps/.test(href) && await fila.locator('a.tf-google').getAttribute('target') === '_blank', `enlace a Google Maps (${href})`);
  comprobar(await fila.locator('.insignia-dif').count() === 1 && await fila.locator('.tf-titularidad').count() === 1
    && /Puntuación de la zona: \d+ de 100/.test(await fila.locator('.tf-meta').textContent())
    && /km|m de|PENDIENTE|Distancia/.test(await fila.locator('.tf-meta').textContent()), 'dificultad, titularidad, distancia y puntuación de la zona');

  // Orden por probabilidad = puntuación de la zona; el control «Ordenar por» sigue funcionando.
  const ptsZona = (await p.$$eval('#top-especie > li.top-zona', (ls) => ls.map((l) => Number(l.dataset.puntuacion))));
  comprobar(ptsZona.every((x, i) => i === 0 || ptsZona[i - 1] >= x), `orden por probabilidad: ${ptsZona.join(' ≥ ')}`);
  await p.locator('#top-especie').locator('xpath=preceding-sibling::div[contains(@class,"orden-top")][1]').locator('[data-orden=dificultad]').click();
  await p.waitForFunction(() => document.querySelector('#top-especie').dataset.orden === 'dificultad');
  comprobar(await p.locator('#top-especie > li.top-zona').count() === ptsZona.length, 'ordenar por dificultad repinta las mismas zonas');
  await p.locator('#top-especie').locator('xpath=preceding-sibling::div[contains(@class,"orden-top")][1]').locator('[data-orden=probabilidad]').click();

  const texto = await p.locator('#p-hoy').textContent();
  comprobar(!PROHIBIDO.test(texto), 'nada en Hoy dice «comestible»');
  await p.screenshot({ path: join(CAPTURAS, 'por-sitio.png'), fullPage: false });
  await fila.scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'por-sitio-fila.png') });

  // Se recuerda al recargar; volver a «Por seta» restaura el top normal.
  await p.reload();
  if (await b.isVisible({ timeout: 5000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForFunction(() => window.__setas.tops()?.vista === 'sitio' && document.querySelector('#top-especie .top-zona'));
  comprobar(true, 'la vista «Por sitio» se recuerda tras recargar');
  await p.locator('#hoy-vista [data-vista=seta]').click();
  await p.waitForFunction(() => window.__setas.tops().vista === 'seta' && !document.querySelector('#top-especie .top-zona'));
  comprobar((await zonas()).zonas.length === 0, 'volver a «Por seta» quita las zonas');
  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('\nTodo OK: Hoy «Por sitio».');
} finally {
  await nav.close();
}
