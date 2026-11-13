// e2e de «Lista | Mapa» y minutos en coche en Hoy (2026-11-13). Viewport 375×812.
//  - nada de geolocalización ni de OSRM al cargar; «Usar mi ubicación» pide el permiso y pone «🚗 N min» en cada tarjeta
//    con UNA sola petición a OSRM (table, sources=0, annotations=duration) cuyo origen es el centro de la celda de ~500 m
//    y cuyos destinos son los aparcamientos de los sitios
//  - vista Mapa: una chincheta-etiqueta por sitio («≈ N %» con el color del semáforo), carrusel con scroll-snap y
//    sincronía chincheta ↔ tarjeta en los dos sentidos; «Por sitio» también; sin scroll lateral de la página
//  - OSRM caído → «≈ N min (estimado)»; sin permiso → sin cifra; última ubicación guardada → «desde tu última ubicación»
//  - nada dice «comestible»
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const HOY_E2E = '2026-10-14';
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const URL_APP = `${BASE}?e2e=1&hoy=${HOY_E2E}`;
const CAPTURAS = join(AQUI, 'capturas'); mkdirSync(CAPTURAS, { recursive: true });
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'fixtures/open-meteo.json'), 'utf8'));
const PROHIBIDO = /comestib|se puede comer/i;
const POS = { latitude: 36.589, longitude: -5.244 };          // celda de 500 m: 36.59, -5.245
const OTRA = { latitude: 36.7, longitude: -4.4 };             // otra celda, lejos de la primera
const COLOR = { verde: 'rgb(12, 163, 12)', amarillo: 'rgb(250, 178, 25)', rojo: 'rgb(208, 59, 59)', gris: 'rgb(138, 138, 134)' };
const MIN = /^🚗 (\d+ min|\d+ h( \d+ min)?)$/;
const ESTIMADO = /^🚗 ≈ (\d+ min|\d+ h( \d+ min)?) \(estimado\)$/;
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const nav = await chromium.launch();
const movil = { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' };

/** Contexto con Open-Meteo falso (para tener «≈ N %»), IGN a 404 y un OSRM falso que se puede romper. */
async function contexto(opciones = {}, { osrm = true } = {}) {
  // El permiso va concedido desde el principio: la app lo usa por su cuenta al arrancar (elegir región); lo que se vigila es
  // que ESTA función no lo pida (su petición lleva timeout 10000; la de la región, 6000).
  const ctx = await nav.newContext({ ...movil, geolocation: POS, permissions: ['geolocation'], ...opciones });
  const e = { osrmPeticiones: [], osrmServido: [], osrmCae: false, geoLlamadas: 0 };
  let puntosMeteo = null;
  await ctx.route('**/api.open-meteo.com/**', async (r) => {
    puntosMeteo ??= await (await fetch(new URL('data/marbella/meteo_puntos.json', BASE))).json();
    const u = new URL(r.request().url());
    const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
    const pas = Number(u.searchParams.get('past_days') ?? 30);
    const rel = Array.from({ length: pas + 16 }, (_, i) => i - pas);
    const una = (la, i) => ({ latitude: la, longitude: lon[i], elevation: puntosMeteo.find((p) => p.lat === la && p.lon === lon[i])?.alt_media ?? 0,
      daily: { time: rel.map((k) => sumar(HOY_E2E, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
        temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin),
        et0_fao_evapotranspiration: rel.map(() => FIXTURE.et0), relative_humidity_2m_min: rel.map(() => FIXTURE.hr_min) },
      hourly: { time: rel.flatMap((k) => Array.from({ length: 24 }, (_, h) => `${sumar(HOY_E2E, k)}T${String(h).padStart(2, '0')}:00`)),
        soil_moisture_9_to_27cm: rel.flatMap(() => Array(24).fill(FIXTURE.suelo)) } });
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(lat.length === 1 ? una(lat[0], 0) : lat.map(una)) });
  });
  await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  if (osrm) await ctx.route('https://router.project-osrm.org/**', async (r) => {
    const url = r.request().url();
    e.osrmPeticiones.push(url);
    if (e.osrmCae) { await r.fulfill({ status: 503, body: 'caído' }); return; }
    const coords = decodeURIComponent(url.split('/driving/')[1].split('?')[0]).split(';').map((c) => c.split(',').map(Number));
    // Minutos inventados pero deterministas: 8 + 3 por posición (la 0 es el origen).
    const dur = coords.map((_, k) => (k === 0 ? 0 : (8 + 3 * k) * 60));
    e.osrmServido.push(coords.slice(1).map(([lon, lat], k) => ({ lat, lon, min: 8 + 3 * (k + 1) })));
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'Ok', durations: [dur], sources: [], destinations: [] }) });
  });
  await ctx.addInitScript(() => {
    window.__geoLlamadas = 0;
    const g = navigator.geolocation;
    if (g) {
      const f = g.getCurrentPosition.bind(g);
      g.getCurrentPosition = (ok, ko, o) => {
        if (o?.timeout !== 10000) return f(ok, ko, o);   // la de la región
        window.__geoLlamadas++;
        if (window.__negarUbicacion) { ko({ code: 1, message: 'denegado' }); return undefined; }
        return f(ok, ko, o);
      };
    }
  });
  return { ctx, e };
}

async function abrirHoy(p) {
  const errores = [];
  p.on('pageerror', (x) => errores.push(String(x)));
  await p.goto(URL_APP);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 15000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForSelector('#top-especie .top-fila');
  return errores;
}
const sinScrollLateral = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, cuerpo: document.body.scrollWidth, ventana: window.innerWidth }));
const cifras = (p, sel = '#top-especie .coche-min') => p.$$eval(sel, (es) => es.map((e) => e.textContent));

let p;
try {
  // ------------------------------------------------------------ 1. nada al cargar; «Usar mi ubicación»
  const A = await contexto();
  p = await A.ctx.newPage();
  const errores = await abrirHoy(p);
  await p.waitForTimeout(600);
  comprobar(await p.evaluate(() => window.__geoLlamadas) === 0 && A.e.osrmPeticiones.length === 0,
    'al cargar no se pide la ubicación ni se llama a OSRM');
  comprobar((await cifras(p)).every((t) => t === '') && await p.locator('#top-especie .top-fila .coche-ir').count() > 0
    && await p.locator('#top-especie .top-fila .coche-ir').first().textContent() === 'Cómo llegar en coche',
    'sin ubicación no hay cifra; «Cómo llegar en coche» ya está en cada tarjeta');
  comprobar(/Para ver cuánto se tarda en coche/.test(await p.locator('#hoy-ubicacion-estado').textContent()), 'la barra explica para qué sirve «Usar mi ubicación»');
  await p.locator('#hoy-ubicacion').click();
  await p.waitForFunction(() => document.querySelector('#top-especie .coche-min')?.textContent, null, { timeout: 15000 });
  await p.waitForFunction(() => /Minutos en coche desde tu ubicación/.test(document.querySelector('#hoy-ubicacion-estado').textContent), null, { timeout: 15000 });
  const lista = await cifras(p);
  comprobar(await p.evaluate(() => window.__geoLlamadas) === 1 && lista.length > 0 && lista.every((t) => MIN.test(t)),
    `«Usar mi ubicación» (1 petición de posición) → «${lista[0]}» en cada una de las ${lista.length} tarjetas de la lista`);
  comprobar(A.e.osrmPeticiones.length === 1, 'una sola petición a OSRM para todas las tarjetas de la página');
  const url = A.e.osrmPeticiones[0];
  comprobar(url.startsWith('https://router.project-osrm.org/table/v1/driving/-5.24500,36.59000;') && url.endsWith('?sources=0&annotations=duration'),
    `OSRM table con sources=0 y annotations=duration; el origen es el centro de la celda de ~500 m, no tu posición exacta (${url.slice(0, 90)}…)`);
  const servido = A.e.osrmServido[0];
  const minsPag = await p.$$eval('.coche-min', (es) => es.map((e) => {
    const h = Number((e.textContent.match(/(\d+) h/) ?? [])[1] ?? 0), m = Number((e.textContent.match(/(\d+) min/) ?? [])[1] ?? 0);
    return h * 60 + m;
  }));
  comprobar(minsPag.every((m) => servido.some((s) => s.min === m)), 'cada cifra es la que devolvió OSRM para su destino');
  const puntos = await p.$$eval('.coche-min', (es) => es.map((e) => ({ lat: +e.dataset.lat, lon: +e.dataset.lon })));
  comprobar(servido.some((d) => !puntos.some((q) => Math.abs(q.lat - d.lat) < 1e-5 && Math.abs(q.lon - d.lon) < 1e-5)),
    'el destino es el aparcamiento del sitio (no el punto de la seta)');
  comprobar(await p.locator('#top-especie .coche-desde:not([hidden])').count() === 0, 'con la ubicación de ahora no sale «desde tu última ubicación»');
  const guardada = await p.evaluate(() => JSON.parse(localStorage.getItem('setas:ultima-ubicacion')));
  comprobar(Math.abs(guardada.lat - POS.latitude) < 1e-6 && guardada.t > Date.now() - 60000, 'la última posición queda guardada con su hora');
  // El orden «Distancia» usa ahora tu ubicación.
  await p.locator('#top-especie').locator('xpath=preceding-sibling::div[contains(@class,"orden-top")][1]').locator('[data-orden=distancia]').click();
  await p.waitForFunction(() => document.querySelector('#top-especie')?.dataset.orden === 'distancia');
  comprobar(/km de ti/.test(await p.locator('#top-especie .top-fila .tf-meta').first().textContent()), 'ordenar por distancia cuenta desde tu ubicación («km de ti»)');
  await p.locator('#top-especie .top-fila').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'coche-lista.png') });
  let sl = await sinScrollLateral(p);
  comprobar(sl.doc <= sl.ventana && sl.cuerpo <= sl.ventana, `Lista a 375 px: sin scroll lateral (${sl.doc} ≤ ${sl.ventana})`);

  // ------------------------------------------------------------ 2. vista Mapa
  await p.locator('#hoy-modo [data-modo=mapa]').click();
  await p.waitForFunction(() => document.body.dataset.minimapa === 'listo', null, { timeout: 30000 });
  const n = await p.locator('#top-especie .top-fila').count();
  await p.waitForFunction((k) => document.querySelectorAll('#hm-hueco .hm-pin').length === k && document.querySelectorAll('.hm-card').length === k, n, { timeout: 30000 });
  comprobar(await p.locator('#top-especie').isHidden() && await p.locator('#hoy-mapa').isVisible() && await p.locator('#hm-hueco .minimapa canvas').isVisible(),
    `«Mapa»: el mini-mapa sustituye al listado, con ${n} chinchetas y ${n} tarjetas`);
  const pines = await p.$$eval('.hm-pin', (es) => es.map((e) => ({ pos: e.dataset.pos, estado: e.dataset.estado, txt: e.textContent, bg: getComputedStyle(e.querySelector('.hm-pin-txt')).backgroundColor })));
  comprobar(pines.every((x) => /^(≈ \d+ %|\d+\/100)$/.test(x.txt)) && pines.some((x) => /^≈ \d+ %$/.test(x.txt)),
    `las chinchetas dicen el dato clave: ${pines.slice(0, 4).map((x) => x.txt).join(', ')}…`);
  comprobar(pines.every((x) => x.bg === COLOR[x.estado]), 'cada chincheta lleva el color de su semáforo');
  const estadosLista = await p.$$eval('#top-especie .top-fila', (es) => es.map((e) => e.dataset.estado));
  comprobar(pines.every((x, i) => x.estado === estadosLista[i]), 'la chincheta i tiene el estado de la fila i del listado');
  const cifrasMapa = await cifras(p, '.hm-card .coche-min');
  comprobar(cifrasMapa.length === n && cifrasMapa.every((t) => MIN.test(t)), `cada tarjeta del carrusel trae «${cifrasMapa[0]}»`);
  comprobar(await p.locator('.hm-card .coche-ir').count() === n, '«Cómo llegar en coche» junto a los minutos en cada tarjeta del carrusel');
  comprobar(A.e.osrmPeticiones.length === 1, 'la vista Mapa reutiliza las cifras: no hay otra petición a OSRM');
  comprobar(await p.locator('.hm-card.sel').getAttribute('data-pos') === '1' && await p.locator('.hm-pin.sel').getAttribute('data-pos') === '1', 'al abrir el mapa está elegido el sitio 1');
  const centrada = (pos) => p.evaluate((q) => {
    const car = document.querySelector('#hm-carrusel'), c = car.querySelector(`.hm-card[data-pos="${q}"]`);
    const a = car.getBoundingClientRect(), b = c.getBoundingClientRect();
    return Math.abs((b.left + b.width / 2) - (a.left + a.width / 2));
  }, pos);
  const enMapa = (pos) => p.evaluate((q) => {   // la chincheta está en el mapa, centrada y por encima del carrusel
    const pin = document.querySelector(`.hm-pin[data-pos="${q}"]`).getBoundingClientRect();
    const lienzo = document.querySelector('.hm-lienzo').getBoundingClientRect(), car = document.querySelector('#hm-carrusel').getBoundingClientRect();
    return { dx: Math.abs(pin.left + pin.width / 2 - (lienzo.left + lienzo.width / 2)), arriba: pin.bottom <= car.top + 2 && pin.top >= lienzo.top, };
  }, pos);
  await p.evaluate(() => document.querySelector('.hm-lienzo').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(300);

  // chincheta → tarjeta
  const destino = Math.min(4, n);
  const caja = await p.locator(`.hm-pin[data-pos="${destino}"]`).boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.waitForFunction((q) => document.querySelector('.hm-card.sel')?.dataset.pos === String(q), destino);
  await p.waitForFunction((q) => {
    const car = document.querySelector('#hm-carrusel'), c = car.querySelector(`.hm-card[data-pos="${q}"]`);
    return Math.abs(car.scrollLeft - (c.offsetLeft - (car.clientWidth - c.offsetWidth) / 2)) < 4;
  }, destino, { timeout: 5000 });
  comprobar(await p.locator('.hm-pin.sel').getAttribute('data-pos') === String(destino) && await centrada(destino) < 6,
    `tocar la chincheta ${destino} la resalta y lleva el carrusel a su tarjeta (centrada)`);
  await p.waitForFunction(() => !window.__setas.miniMapa().isMoving(), null, { timeout: 5000 });
  const m1 = await enMapa(destino);
  comprobar(m1.dx < 12 && m1.arriba, `el mapa centra la chincheta ${destino} en la parte libre sobre el carrusel (dx ${m1.dx.toFixed(1)} px)`);

  // tarjeta → chincheta (deslizar el carrusel)
  const otra = destino === 1 ? 2 : 1;
  await p.evaluate((q) => {
    const car = document.querySelector('#hm-carrusel'), c = car.querySelector(`.hm-card[data-pos="${q}"]`);
    car.scrollTo({ left: c.offsetLeft - (car.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
  }, otra);
  await p.waitForFunction((q) => document.querySelector('.hm-pin.sel')?.dataset.pos === String(q), otra, { timeout: 8000 });
  await p.waitForFunction(() => !window.__setas.miniMapa().isMoving(), null, { timeout: 5000 });
  const m2 = await enMapa(otra);
  comprobar(await p.locator('.hm-card.sel').getAttribute('data-pos') === String(otra) && m2.dx < 12 && m2.arriba,
    `deslizar el carrusel a la tarjeta ${otra} resalta su chincheta y el mapa la centra`);
  // Un toque sobre una tarjeta a medias la elige.
  if (n >= 3) {
    const vecina = otra + 1;
    await p.locator(`.hm-card[data-pos="${vecina}"] .hm-cab`).click();
    await p.waitForFunction((q) => document.querySelector('.hm-pin.sel')?.dataset.pos === String(q), vecina, { timeout: 8000 });
    comprobar(true, `tocar la tarjeta ${vecina} (asoma a un lado) la elige y resalta su chincheta`);
  }
  const textoMapa = await p.locator('#hoy-mapa').innerText();
  comprobar(!PROHIBIDO.test(textoMapa), 'la vista Mapa no dice «comestible»');
  comprobar(await p.locator('.hm-card.sel .hm-ruta').count() === 1 && await p.locator('.hm-card.sel .hm-navegar').count() === 1,
    'cada tarjeta del mapa sigue con «Ruta a pie» y «Navegar aquí»');
  await p.screenshot({ path: join(CAPTURAS, 'coche-mapa.png') });
  sl = await sinScrollLateral(p);
  comprobar(sl.doc <= sl.ventana && sl.cuerpo <= sl.ventana, `Mapa a 375 px: sin scroll lateral de la página (${sl.doc} ≤ ${sl.ventana})`);
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: join(CAPTURAS, 'coche-mapa-oscuro.png') });
  await p.emulateMedia({ colorScheme: 'light' });

  // «Por sitio» en el mapa
  await p.locator('#hoy-vista [data-vista=sitio]').click();
  await p.waitForFunction(() => window.__setas.tops().vista === 'sitio' && document.querySelector('#top-especie .top-zona'));
  const nz = (await p.evaluate(() => window.__setas.tops().zonas.length));
  await p.waitForFunction((k) => document.querySelectorAll('#hm-hueco .hm-pin').length === k && document.querySelectorAll('.hm-card').length === k, nz, { timeout: 15000 });
  comprobar(nz >= 1, `«Por sitio» en el mapa: ${nz} zonas, una chincheta y una tarjeta por zona`);
  await p.waitForFunction(() => [...document.querySelectorAll('.hm-card .coche-min')].every((e) => e.textContent), null, { timeout: 15000 });
  comprobar((await cifras(p, '.hm-card .coche-min')).every((t) => MIN.test(t)), 'las tarjetas de las zonas también traen sus minutos en coche');

  // Volver a «Lista»
  await p.locator('#hoy-modo [data-modo=lista]').click();
  comprobar(await p.locator('#top-especie').isVisible() && await p.locator('#hoy-mapa').isHidden() && await p.locator('.hm-pin').count() === 0,
    '«Lista» vuelve al listado y quita las chinchetas');

  // ------------------------------------------------------------ 3. OSRM caído → estimado
  A.e.osrmCae = true;
  await A.ctx.setGeolocation(OTRA);
  const antes = A.e.osrmPeticiones.length;
  await p.locator('#hoy-vista [data-vista=seta]').click();
  await p.waitForFunction(() => window.__setas.tops().vista === 'seta' && document.querySelector('#top-especie .top-fila'));
  await p.locator('#hoy-ubicacion').click();
  await p.waitForFunction(() => /estimado/.test(document.querySelector('#top-especie .coche-min')?.textContent ?? ''), null, { timeout: 20000 });
  const est = await cifras(p);
  comprobar(A.e.osrmPeticiones.length > antes && est.length > 0 && est.every((t) => ESTIMADO.test(t)), `OSRM caído (503): «${est[0]}»`);
  comprobar(/Estimado/.test(await p.locator('#hoy-ubicacion-estado').textContent()), 'la barra avisa de que las cifras son estimadas');
  comprobar(await p.locator('#top-especie .coche-ir').count() > 0, '«Cómo llegar en coche» sigue funcionando junto a la cifra estimada');
  await p.locator('#top-especie .top-fila').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'coche-estimado.png') });
  comprobar(!PROHIBIDO.test(await p.locator('#p-hoy').innerText()), 'nada en Hoy dice «comestible»');
  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  await A.ctx.close();

  // ------------------------------------------------------------ 4. sin permiso y última ubicación guardada
  const B = await contexto({});
  await B.ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* nada */ } },
    ['setas:ultima-ubicacion', JSON.stringify({ lat: POS.latitude, lon: POS.longitude, t: Date.now() - 3 * 3600 * 1000 })]);
  await B.ctx.addInitScript(() => { window.__negarUbicacion = true; });   // el usuario deniega el permiso al pulsar el botón
  const q = await B.ctx.newPage();
  await abrirHoy(q);
  await q.waitForFunction(() => document.querySelector('#top-especie .coche-min')?.textContent, null, { timeout: 15000 });
  const guard = await cifras(q);
  comprobar(guard.every((t) => MIN.test(t)) && await q.evaluate(() => window.__geoLlamadas) === 0,
    `con una ubicación guardada salen minutos sin pedir permiso («${guard[0]}»)`);
  comprobar(await q.locator('#top-especie .coche-desde:not([hidden])').first().textContent() === 'desde tu última ubicación'
    && /desde tu última ubicación \(hace 3 h\)/.test(await q.locator('#hoy-ubicacion-estado').textContent()),
    'indicado «desde tu última ubicación» (hace 3 h)');
  await q.locator('#hoy-ubicacion').click();
  await q.waitForFunction(() => /No hay permiso de ubicación/.test(document.querySelector('#hoy-ubicacion-estado').textContent), null, { timeout: 8000 });
  comprobar((await cifras(q)).every((t) => MIN.test(t)), 'sin permiso se sigue usando la última ubicación: mensaje claro y las cifras se quedan');
  await B.ctx.close();

  const C = await contexto({}, { osrm: true });
  await C.ctx.addInitScript(() => { window.__negarUbicacion = true; });
  const r = await C.ctx.newPage();
  await abrirHoy(r);
  await r.locator('#hoy-ubicacion').click();
  await r.waitForFunction(() => /No hay permiso de ubicación/.test(document.querySelector('#hoy-ubicacion-estado').textContent), null, { timeout: 8000 });
  comprobar((await cifras(r)).every((t) => t === '') && C.e.osrmPeticiones.length === 0, 'sin permiso ni ubicación guardada: no hay cifra ni se llama a OSRM');
  await C.ctx.close();
  console.log('\nTodo OK: Lista | Mapa y minutos en coche.');
} catch (e) {
  await p?.screenshot({ path: join(CAPTURAS, 'error.png') }).catch(() => {});
  throw e;
} finally {
  await nav.close();
}
