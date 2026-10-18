// e2e «Modo campo» (2026-10-18): microzonas a ~500 m con GPS simulado, icono de la seta y su porqué, «Ir aquí» y
// «Guardar», aviso «te sales de la zona buena» con histéresis, entrada desde el mapa y desde «Navegar aquí» y la ficha
// «Cómo buscar» (en el modo campo y en la guía). Datos reales de Marbella (micro.json / micro.bin del pipeline).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
// Las capturas van a $CAPTURAS_CAMPO o a un directorio temporal: no regenera e2e/capturas.
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const Q = '?e2e=1&hoy=2026-10-14';
const CAPTURAS = process.env.CAPTURAS_CAMPO ?? mkdtempSync(join(tmpdir(), 'campo-micro-e2e-'));
const PROHIBIDO = /comestib|se puede comer/i;
const ESPECIE = 'boletus_aereus';
const YO = { lat: 36.589, lon: -5.244, alt: 300, acc: 5 };     // alcornocal de Los Alcornocales (región Marbella)
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

function geoFalso(inicial) {
  const oyentes = new Map(); let n = 0;
  const mk = (p) => ({ coords: { latitude: p.lat, longitude: p.lon, accuracy: p.acc ?? 5, altitude: p.alt ?? null,
    altitudeAccuracy: p.alt != null ? 6 : null, heading: null, speed: null }, timestamp: Date.now() });
  window.__geo = { pos: inicial, emitir(p) { this.pos = p; for (const f of oyentes.values()) f(mk(p)); } };
  const geo = {
    watchPosition(okf) { const i = ++n; oyentes.set(i, okf); setTimeout(() => window.__geo.pos && okf(mk(window.__geo.pos)), 10); return i; },
    clearWatch(i) { oyentes.delete(i); },
    getCurrentPosition(okf) { setTimeout(() => window.__geo.pos && okf(mk(window.__geo.pos)), 10); },
  };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  window.open = (u) => { window.__abierto = String(u); return null; };
}

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.addInitScript(geoFalso, YO);
await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));
await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
p.on('dialog', (d) => d.accept());
const emitir = (pos) => p.evaluate((x) => window.__geo.emitir(x), pos);
const campo = () => p.evaluate(() => window.__setas.campo());
/** Espera a que el modo campo haya procesado la posición `pos` (celda donde estás y avisos al día). */
const esperarEn = (pos) => p.waitForFunction((x) => { const c = window.__setas.campo(); return c && c.pos && Math.abs(c.pos.lat - x.lat) < 1e-9 && Math.abs(c.pos.lon - x.lon) < 1e-9 && c.aqui; }, pos, { timeout: 15000 })
  .then(() => p.waitForTimeout(150));

try {
  await p.goto(BASE + Q);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 8000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.evaluate((id) => { const s = document.querySelector('#sel-especie'); s.value = id; s.dispatchEvent(new Event('change')); }, ESPECIE);

  // ------------------------------------------------------------ 1. entrada desde el mapa
  comprobar(await p.locator('#btn-campo').isHidden(), 'sin posición, el mapa no ofrece «Campo»');
  await p.locator('#btn-centrar').click();
  await p.waitForSelector('#btn-campo:not([hidden])', { timeout: 15000 });
  ok('con tu posición dentro de la región aparece el botón «Campo» en el mapa');
  await p.locator('#btn-campo').click();
  await p.waitForSelector('#dlg-campo[open]');
  await p.waitForFunction(() => { const c = window.__setas.campo(); return c && c.datos && c.datos !== 'cargando' && c.aqui && c.celdas.length; }, null, { timeout: 30000 });
  let c = await campo();
  comprobar(c.especie === ESPECIE && c.datos.teselas >= 1, `modo campo para ${c.especie}: ${c.celdas.length} celdas de 100 m leídas de ${c.datos.teselas} tesela(s) de micro.bin (${c.datos.origen})`);
  comprobar(c.micro.length > 0 && c.micro.length <= 10, `${c.micro.length} microzonas (máx. 10)`);
  comprobar(c.micro.every((m) => m.idon >= 50) && c.micro.every((m, i) => i === 0 || c.micro[i - 1].idon >= m.idon), 'todas ≥ 50/100 y de mejor a peor');
  let minSep = Infinity;
  for (let i = 0; i < c.micro.length; i++) for (let j = i + 1; j < c.micro.length; j++)
    minSep = Math.min(minSep, Math.hypot(c.micro[i].fila - c.micro[j].fila, c.micro[i].col - c.micro[j].col) * 100);
  comprobar(minSep >= 120, `separadas ≥ 120 m entre sí (mínimo ${Number.isFinite(minSep) ? Math.round(minSep) : '—'} m)`);
  comprobar(c.micro.every((m) => m.dist_m <= 500), 'todas a ≤ 500 m de tu posición');
  const mejoresQueLaElegida = c.celdas.filter((x) => x.idon > c.micro[0].idon).length;
  comprobar(mejoresQueLaElegida === 0, `la microzona 1 es la celda con más idoneidad del radio (${c.micro[0].idon}/100)`);
  const txt = await p.locator('#dlg-campo').innerText();
  comprobar(/Resolución 100 m/.test(txt) && /hectárea/.test(txt), 'la pantalla dice que la resolución es de 100 m (una hectárea)');
  comprobar(!PROHIBIDO.test(txt), 'el modo campo no dice «comestible»');

  // ------------------------------------------------------------ 2. iconos en el mapa y su porqué
  await p.waitForFunction((n) => { const m = window.__setas.miniMapa(); return m && m.loaded() && m.queryRenderedFeatures({ layers: ['campo-iconos'] }).length === n; }, c.micro.length, { timeout: 30000 });
  c = await campo();
  comprobar(['foto', 'dibujo'].includes(c.icono), `${c.micro.length} iconos de la seta en el mapa (${c.icono === 'foto' ? 'miniatura de la guía' : 'dibujito'})`);
  const px = await p.evaluate(() => {
    const m = window.__setas.miniMapa();
    const f = m.queryRenderedFeatures({ layers: ['campo-iconos'] }).find((x) => x.properties.i === 0);
    const q = m.project(f.geometry.coordinates); const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + q.x, y: r.top + q.y };
  });
  await p.mouse.click(px.x, px.y);
  await p.waitForSelector('#cp-tarjeta:not([hidden])');
  const tarjeta = await p.locator('#cp-tarjeta').innerText();
  comprobar(/Microzona 1/.test(tarjeta) && tarjeta.includes(c.micro[0].razon) && /\d+\/100 · /.test(tarjeta),
    `tocar el icono 1 → por qué: «${c.micro[0].razon}»`);
  comprobar(!PROHIBIDO.test(tarjeta), 'la tarjeta no dice «comestible»');
  await p.screenshot({ path: join(CAPTURAS, 'campo-microzonas.png') });

  // ------------------------------------------------------------ 3. «Cómo buscar»
  await p.locator('#cp-buscar summary').click();
  const buscar = await p.locator('#cp-buscar').innerText();
  comprobar(/Cómo buscar/.test(buscar) && /Bajo qué árboles/.test(buscar) && /alcornoque/.test(buscar) && /Fuente: Modelo de la app/.test(buscar),
    'ficha «Cómo buscar»: árboles del perfil del modelo, con su fuente');
  comprobar(/Distancia al tronco\s*PENDIENTE/.test(buscar) && /Hojarasca y musgo\s*PENDIENTE/.test(buscar), 'lo que ninguna fuente dice sale como PENDIENTE');
  comprobar(!PROHIBIDO.test(buscar), '«Cómo buscar» no dice «comestible»');

  // ------------------------------------------------------------ 4. histéresis «te sales de la zona buena»
  const buena = c.celdas.filter((x) => x.idon >= 60).sort((a, b2) => b2.idon - a.idon)[0];
  const baja = c.celdas.find((x) => x.idon < 35);
  comprobar(!!buena && !!baja, `hay una celda buena (${buena?.idon}/100) y una baja (${baja?.idon}/100) en el radio`);
  const enBuena = { lat: buena.lat, lon: buena.lon, acc: 5 }, enBaja = { lat: baja.lat, lon: baja.lon, acc: 5 };
  await emitir(enBuena); await esperarEn(enBuena);
  c = await campo();
  comprobar(c.zona.dentro && !c.alerta, `en la celda buena: dentro de zona buena (${c.aqui.idon}/100), sin aviso`);
  await emitir(enBaja); await esperarEn(enBaja);
  c = await campo();
  comprobar(c.zona.dentro && !c.alerta && !c.avisos.length, 'una sola lectura en zona baja no avisa (histéresis)');
  await emitir({ ...enBaja, acc: 80 }); await p.waitForTimeout(300);
  c = await campo();
  comprobar(c.zona.dentro && !c.avisos.length, 'una lectura con precisión mala (±80 m) no cuenta');
  const enBaja2 = { lat: baja.lat + 1e-6, lon: baja.lon, acc: 6 };
  await emitir(enBaja2); await esperarEn(enBaja2);
  c = await campo();
  comprobar(!c.zona.dentro && c.avisos.join() === 'sale' && /Te sales de la zona buena/.test(c.alerta) && /\d+ m al (norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)/.test(c.alerta),
    `segunda lectura baja → aviso: «${c.alerta}»`);
  await p.screenshot({ path: join(CAPTURAS, 'campo-aviso.png') });
  await emitir(enBuena); await esperarEn(enBuena);
  c = await campo();
  comprobar(c.zona.dentro && c.avisos.join() === 'sale,vuelve' && /De vuelta/.test(c.alerta), 'al volver a una celda buena: «De vuelta en zona buena»');

  // ------------------------------------------------------------ 5. Guardar e «Ir aquí»
  await p.locator('#cp-lista .cp-fila').first().click();
  await p.waitForSelector('#cp-tarjeta:not([hidden])');
  await p.locator('#cp-tarjeta .cp-guardar').click();
  await p.waitForFunction(() => /Guardado en Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  await p.locator('#cp-tarjeta .cp-guardar').click();
  await p.waitForFunction(() => /Ya estaba en Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  ok('«Guardar» la microzona en Mis sitios (y no la duplica)');
  c = await campo();
  const destino = c.micro[c.sel];
  await p.locator('#cp-tarjeta .cp-ir').click();
  await p.waitForSelector('#dlg-ir[open]');
  await p.waitForFunction(() => window.__setas.ir()?.pos);
  let e = await p.evaluate(() => window.__setas.ir());
  comprobar(Math.abs(e.destino.lat - destino.lat) < 1e-9 && /Microzona/.test(e.destino.titulo) && !(await p.locator('#dlg-campo[open]').count()),
    `«Ir aquí» abre «Navegar aquí» hacia la microzona (${e.distancia})`);
  await p.waitForFunction(() => { const m = window.__setas.miniMapa(); return m && m.queryRenderedFeatures({ layers: ['campo-iconos'] }).length > 0; }, null, { timeout: 15000 });
  ok('al navegar, el mapa sigue enseñando los iconos de las microzonas');
  await p.locator('#ir-guardar').click();
  await p.waitForFunction(() => /Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  ok('«Navegar aquí» también tiene «Guardar»');

  // ------------------------------------------------------------ 6. entrada desde «Navegar aquí» y vuelta
  await p.locator('#ir-campo').click();
  await p.waitForSelector('#dlg-campo[open]');
  await p.waitForFunction(() => document.querySelector('#cp-hueco .minimapa'));
  comprobar(await p.locator('#dlg-ir[open]').count() === 1, '«Modo campo» desde «Navegar aquí» se abre encima (la navegación sigue debajo)');
  await p.locator('#cp-cerrar').click();
  await p.waitForFunction(() => document.querySelector('#ir-hueco .minimapa'));
  comprobar(!(await p.locator('#dlg-campo[open]').count()) && await p.locator('#dlg-ir[open]').count() === 1, 'al salir del modo campo vuelve a la navegación con su mapa');
  await p.locator('#ir-cerrar').click();
  await p.waitForFunction(() => !document.querySelector('#dlg-ir[open]'));

  // ------------------------------------------------------------ 7. «Cómo buscar» en la ficha de la guía
  // Al salir de la navegación se ofrece cerrar el track grabado (grabar-ui): se cierra esa hoja.
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.locator('.pestanas [data-p=p-mapa]').click().catch(() => {});
  await p.waitForSelector('#btn-ver-ficha:not([hidden])', { timeout: 15000 });
  await p.locator('#btn-ver-ficha').click();
  await p.waitForSelector('.cp-buscar-guia', { timeout: 15000 });
  const fichaTxt = await p.locator('.cp-buscar-guia').innerText();
  comprobar(/Cómo buscar/.test(fichaTxt) && /Hábitat según la guía/.test(fichaTxt) && /PENDIENTE/.test(fichaTxt) && !PROHIBIDO.test(fichaTxt),
    'la ficha de la guía lleva «Cómo buscar» con fuentes y PENDIENTE');
  await p.screenshot({ path: join(CAPTURAS, 'guia-como-buscar.png'), fullPage: false });

  // ------------------------------------------------------------ 8. Mis sitios
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForFunction(() => /Microzona 1 de/.test(document.querySelector('#p-sitios')?.textContent ?? ''), null, { timeout: 10000 });
  ok('la microzona guardada sale en Mis sitios');

  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  console.log(`Capturas en ${CAPTURAS}`);
} catch (err) {
  await p.screenshot({ path: join(CAPTURAS, 'error.png') }).catch(() => {});
  console.error(err.message, `(captura en ${CAPTURAS}/error.png)`, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
