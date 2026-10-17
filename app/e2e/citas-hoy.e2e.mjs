// e2e de las citas en el Top de «Hoy» (2026-10-17): una fila del Top muestra «Citado: …» y al pulsarla se despliega la
// lista de fuentes con al menos un enlace (target=_blank rel=noopener) y su atribución · licencia, más el aviso de las
// citas. También comprueba que Marbella trae factor_citas en sitios.json y que nada de lo nuevo dice «comestible».
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

const sitios = await (await fetch(new URL('data/marbella/sitios.json', BASE))).json();
const conCitas = Object.values(sitios.especies).flat().filter((s) => s.citas);
comprobar(sitios.version >= 2 && typeof sitios.factor_citas === 'boolean' && conCitas.length > 0
  && conCitas.every((s) => s.citas.n >= 1 && ['punto', 'paraje'].includes(s.citas.nivel) && s.citas.refs.length <= 10),
  `sitios.json de Marbella v${sitios.version}: factor_citas ${sitios.factor_citas}, ${conCitas.length} sitios con citas`);

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], geolocation: { latitude: 36.589, longitude: -5.244 }, permissions: ['geolocation'],
  locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));   // el tiempo no es objeto de este e2e
await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
try {
  await p.goto(URL_APP);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 15000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForSelector('#top-general .top-fila');
  comprobar(await p.evaluate(() => window.__setas.tops().factorCitas) === sitios.factor_citas,
    `la pestaña Hoy lee factor_citas (${sitios.factor_citas})`);
  // Una seta cuyo top 10 tenga algún sitio con citas.
  const ids = await p.$$eval('#hoy-especie option', (os) => os.map((o) => o.value));
  let especie = null;
  for (const id of ids) {
    await p.locator('#hoy-especie').selectOption(id);
    await p.waitForFunction((e) => window.__setas.tops().especie === e, id);
    if (await p.locator('#top-especie .tf-citado').count()) { especie = id; break; }
  }
  comprobar(especie, `el top de ${especie} tiene filas con «Citado: …»`);
  const fila = p.locator('#top-especie .top-fila:has(.tf-citado)').first();
  const etiqueta = (await fila.locator('.tf-citado').first().textContent()).trim();
  comprobar(/^Citado: .+ \(\d+ citas?(, última \d{4})?\)$/.test(etiqueta) && await fila.locator('.tf-fuentes').first().isHidden(),
    `etiqueta «${etiqueta}» con la lista plegada`);
  const tops = await p.evaluate(() => window.__setas.tops());
  const idFila = Number(await fila.getAttribute('data-id'));
  comprobar(tops.top.some((e) => e.id === idFila && e.citas && e.citas.n >= 1), 'la fila corresponde a un sitio con citas en tops()');
  await fila.locator('.tf-citado').first().click();
  const lista = fila.locator('.tf-fuentes').first();
  await lista.waitFor({ state: 'visible' });
  const enlaces = await lista.locator('a').evaluateAll((as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel, t: a.textContent })));
  const atrib = await lista.locator('.tf-fuente-atrib').allTextContents();
  const textoLista = await lista.innerText();
  comprobar(await fila.locator('.tf-citado').first().getAttribute('aria-expanded') === 'true' && enlaces.length >= 1
    && enlaces.every((a) => /^https?:\/\//.test(a.href) && a.target === '_blank' && /noopener/.test(a.rel))
    && atrib.some((t) => t.trim() && t.trim() !== '—'),
    `al pulsarla: ${enlaces.length} enlace(s) de fuente (target=_blank, noopener) y atribución «${atrib[0]}»`);
  comprobar(/no dice que se pueda recoger ahí ni que se pueda consumir/.test(textoLista) && /precisión/.test(textoLista) && /del sitio/.test(textoLista),
    'la lista lleva fecha, precisión, distancia y el aviso de las citas');
  await lista.scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'hoy-citas.png') });
  const nuevos = await p.$$eval('.tf-citas', (cs) => cs.map((c) => c.innerText).join('\n'));
  comprobar(!PROHIBIDO.test(nuevos), 'nada de lo nuevo dice «comestible»');
  await fila.locator('.tf-citado').first().click();
  comprobar(await lista.isHidden(), 'volver a pulsar pliega la lista');
  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  console.log('e2e de citas en Hoy: OK');
} finally {
  await nav.close();
}
