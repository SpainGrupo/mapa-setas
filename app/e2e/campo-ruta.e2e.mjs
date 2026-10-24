// e2e «Modo campo · ruta a pie por el terreno» (2026-10-20): con GPS simulado en Marbella (36.6030, −4.8153), el filtro
// de desnivel máximo (30 m) deja microzonas cercanas a tu cota, la ruta hacia una al noreste se traza sobre el MDT de
// 25 m (mdt_campo.bin) con perfil, desnivel + y −, distancia, tiempo y la nota de resolución; «Más directa» y «Mínimo
// desnivel» se conmutan; «Ir aquí» la sigue en «Navegar aquí» y, al salirte de ella, avisa.
// Datos reales de Marbella (micro.* y mdt_campo.* del pipeline). Si los datos no dan microzonas al NE con ≤ 30 m de
// desnivel, el e2e falla y lo dice con las cifras reales (no se fuerza nada).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
// Las capturas van a $CAPTURAS_CAMPO o a un directorio temporal.
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const Q = '?e2e=1&hoy=2026-10-14';
const CAPTURAS = process.env.CAPTURAS_CAMPO ?? mkdtempSync(join(tmpdir(), 'campo-ruta-e2e-'));
const PROHIBIDO = /comestib|se puede comer/i;
const ESPECIE = 'boletus_aereus';
const YO = { lat: 36.6030, lon: -4.8153, acc: 5 };     // ladera sobre Marbella (Sierra Blanca)
const MAX = 30;
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
const ir = () => p.evaluate(() => window.__setas.ir());
const cardinalNE = (r) => r >= 0 && r <= 90;

try {
  await p.goto(BASE + Q);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 8000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.evaluate((id) => { const s = document.querySelector('#sel-especie'); s.value = id; s.dispatchEvent(new Event('change')); }, ESPECIE);
  await p.evaluate(() => { try { localStorage.removeItem('setas:campo-desnivel-max'); localStorage.removeItem('setas:campo-ruta-modo'); } catch { /* */ } });

  // ------------------------------------------------------------ 1. cotas de 25 m y desnivel de las microzonas
  await p.locator('#btn-centrar').click();
  await p.waitForSelector('#btn-campo:not([hidden])', { timeout: 15000 });
  await p.locator('#btn-campo').click();
  await p.waitForSelector('#dlg-campo[open]');
  await p.waitForFunction(() => { const c = window.__setas.campo(); return c && c.datos && c.datos !== 'cargando' && c.aqui && c.rutaPie.cotas !== 'cargando' && c.micro.length; }, null, { timeout: 30000 });
  let c = await campo();
  comprobar(c.rutaPie.cotas === 'mdt25' && c.rutaPie.res === 25, `cotas del MDT25 a ${c.rutaPie.res} m (mdt_campo.bin)`);
  comprobar(c.micro.every((m) => m.dCota_m !== null && m.desnivel_m !== null && m.desnivel_m >= m.dCota_m),
    `sin límite: ${c.micro.length} microzonas con su desnivel (${c.micro.map((m) => `${m.desnivel_m} m`).join(', ')}), nunca menor que |Δcota|; rutas de las candidatas en ${c.rutaPie.msAnotar} ms`);

  // ------------------------------------------------------------ 2. filtro de desnivel máximo 30 m
  await p.selectOption('#cp-desnivel', String(MAX));
  await p.waitForFunction((mx) => { const c = window.__setas.campo(); return c && c.rutaPie.desnivelMax === mx && c.micro.every((m) => m.desnivel_m !== null && m.desnivel_m <= mx); }, MAX, { timeout: 15000 });
  await p.waitForTimeout(300);
  c = await campo();
  const resumen = c.micro.map((m) => `${m.idon}/100 a ${Math.round(m.dist_m)} m (${Math.round(m.rumbo)}°), desnivel ${m.desnivel_m} m`).join('; ');
  console.log(`   microzonas con ≤ ${MAX} m: ${resumen || "ninguna"} · ocultas: ${c.ocultas} · desnivel de las candidatas en ${c.rutaPie.msAnotar} ms`);
  comprobar(c.micro.length > 0 && c.micro.every((m) => m.desnivel_m <= MAX) && c.ocultas > 0,
    `con desnivel máximo ${MAX} m quedan ${c.micro.length} microzonas y se ocultan ${c.ocultas}`);
  const ne = c.micro.map((m, i) => ({ ...m, i })).filter((m) => cardinalNE(m.rumbo));
  comprobar(ne.length > 0, `microzonas al NE con < ${MAX} m de desnivel: ${ne.map((m) => `${Math.round(m.dist_m)} m a ${Math.round(m.rumbo)}°, ${m.desnivel_m} m (Δcota ${m.dCota_m} m)`).join('; ') || 'ninguna'}`);
  const pun = c.micro.map((m) => m.idon - 0.25 * m.desnivel_m);
  comprobar(pun.every((v, i) => i === 0 || pun[i - 1] >= v), 'ordenadas por idoneidad y desnivel (idoneidad − 0,25 × desnivel)');
  const est = await p.locator('#cp-estado').innerText();
  comprobar(new RegExp(`con ≤ ${MAX} m de desnivel`).test(est) && /ocultas? por desnivel/.test(est), `el estado lo dice: «${est}»`);

  // ------------------------------------------------------------ 3. ruta a la microzona NE: perfil, desnivel, tiempo
  const objetivo = ne[0];
  await p.locator('#cp-lista .cp-fila').nth(objetivo.i).click();
  await p.waitForFunction(() => window.__setas.campo()?.rutaPie.ruta?.estado === 'ok', null, { timeout: 15000 });
  c = await campo();
  const r = c.rutaPie.ruta;
  console.log(`   ruta mínimo desnivel: ${r.distancia_m} m, +${r.subida_m} / −${r.bajada_m} m, ${r.tiempo_min} min, ${r.nodos} nodos, A* ${c.rutaPie.ms} ms`);
  comprobar(r.modo === 'minimo_desnivel' && r.res === 25 && r.n > 2 && r.subida_m + r.bajada_m <= MAX,
    `ruta «Mínimo desnivel» trazada: ${r.distancia_m} m, +${r.subida_m} m / −${r.bajada_m} m, ≈ ${r.tiempo_min} min (A* ${c.rutaPie.ms} ms, ${r.nodos} nodos)`);
  const tarjeta = await p.locator('#cp-tarjeta').innerText();
  comprobar(/de subida/.test(tarjeta) && /de bajada/.test(tarjeta) && /a pie/.test(tarjeta) && /min/.test(tarjeta), 'la tarjeta da distancia, subida, bajada y tiempo');
  comprobar(/rejilla de 25 m/.test(tarjeta) && /no ve caminos, vallas ni cortados/.test(tarjeta), 'nota de resolución: «rejilla de 25 m» y que la ruta es aproximada');
  comprobar(await p.locator('#cp-tarjeta .perfil-svg').count() === 1 && /de ti a la microzona/.test(tarjeta), 'perfil de altura de ti a la microzona');
  comprobar(!PROHIBIDO.test(tarjeta), 'la tarjeta no dice «comestible»');
  await p.waitForFunction(() => { const m = window.__setas.miniMapa(); return m && m.loaded() && m.queryRenderedFeatures({ layers: ['campo-ruta'] }).length > 0; }, null, { timeout: 15000 });
  ok('la ruta se dibuja en el mapa');
  await p.locator('#cp-tarjeta').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'campo-ruta-minimo.png') });

  // ------------------------------------------------------------ 4. «Más directa»
  await p.locator('#cp-tarjeta .cp-modo span', { hasText: 'Más directa' }).click();
  await p.waitForFunction(() => window.__setas.campo()?.rutaPie.ruta?.modo === 'directa', null, { timeout: 10000 });
  const rd = (await campo()).rutaPie.ruta;
  console.log(`   ruta más directa: ${rd.distancia_m} m, +${rd.subida_m} / −${rd.bajada_m} m, ${rd.tiempo_min} min`);
  comprobar(rd.estado === 'ok' && rd.subida_m + rd.bajada_m >= r.subida_m + r.bajada_m - 1,
    `«Más directa»: ${rd.distancia_m} m, +${rd.subida_m} / −${rd.bajada_m} m, ≈ ${rd.tiempo_min} min (desnivel ≥ el de «Mínimo desnivel»)`);
  await p.locator('#cp-tarjeta .cp-modo span', { hasText: 'Mínimo desnivel' }).click();
  await p.waitForFunction(() => window.__setas.campo()?.rutaPie.ruta?.modo === 'minimo_desnivel', null, { timeout: 10000 });

  // ------------------------------------------------------------ 5. «Ir aquí»: seguir la ruta y avisar al salirte
  await p.locator('#cp-tarjeta .cp-ir').click();
  await p.waitForSelector('#dlg-ir[open]');
  await p.waitForFunction(() => window.__setas.ir()?.pos && window.__setas.ir()?.nav);
  let e = await ir();
  comprobar(e.sendero?.tipo === 'terreno' && e.sendero.n === r.n, `«Navegar aquí» sigue la ruta por el terreno (${e.sendero?.n} puntos)`);
  const txtIr = await p.locator('#dlg-ir').innerText();
  comprobar(/Ruta a pie por el terreno desde tu posición/.test(txtIr) && /rejilla de 25 m/.test(txtIr), 'y lo dice («Ruta a pie por el terreno desde tu posición…, rejilla de 25 m»)');
  const linea = e.sendero.linea;
  const medio = linea[Math.floor(linea.length / 2)];
  const enRuta = { lat: medio[1], lon: medio[0], acc: 5 };
  await emitir(enRuta);
  await p.waitForFunction((x) => { const s = window.__setas.ir(); return s && Math.abs(s.pos.lat - x.lat) < 1e-9 && s.nav?.medida === 'sendero'; }, enRuta, { timeout: 10000 });
  e = await ir();
  comprobar(!e.alerta && e.nav.unido && !e.nav.fuera, `en mitad de la ruta: sin aviso (${e.distancia} por la ruta)`);
  // 150 m en perpendicular a la ruta (rumbo inicio → fin + 90°).
  const [a0, a1] = [linea[0], linea[linea.length - 1]];
  const k = Math.cos((medio[1] * Math.PI) / 180) * 111320;
  const rumbo = Math.atan2((a1[0] - a0[0]) * k, (a1[1] - a0[1]) * 111320) + Math.PI / 2;
  const fuera = { lat: medio[1] + (150 * Math.cos(rumbo)) / 111320, lon: medio[0] + (150 * Math.sin(rumbo)) / k, acc: 5 };
  await emitir(fuera);
  await p.waitForFunction(() => window.__setas.ir()?.avisos.includes('fuera'), null, { timeout: 10000 });
  e = await ir();
  comprobar(e.nav.fuera && /Te has salido de la ruta/.test(e.alerta ?? ''), `a ${Math.round(e.nav.aSendero_m)} m de la ruta: «${e.alerta}»`);
  await p.screenshot({ path: join(CAPTURAS, 'campo-ruta-fuera.png') });
  await emitir(enRuta);
  await p.waitForFunction(() => window.__setas.ir()?.avisos.includes('vuelta'), null, { timeout: 10000 });
  ok('al volver a la ruta: «De vuelta en la ruta»');
  comprobar(!PROHIBIDO.test(await p.locator('#dlg-ir').innerText()), '«Navegar aquí» no dice «comestible»');

  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  console.log(`Capturas en ${CAPTURAS}`);
} catch (err) {
  await p.screenshot({ path: join(CAPTURAS, 'error.png') }).catch(() => {});
  console.error(err.message, `(captura en ${CAPTURAS}/error.png)`, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
