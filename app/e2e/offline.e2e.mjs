// e2e (Playwright, viewport móvil): carga → descarga de mapas → sin conexión → recarga →
// mapa base y capa de Amanita caesarea desde OPFS → crear un sitio → exportar GPX.
// Entre medias: «Volver a descargar» abortada a mitad (un .pmtiles cortado) → los mapas antiguos siguen.
// Fase 3: Open-Meteo interceptado con un fixture fijo (e2e/fixtures/open-meteo.json) → tocar el mapa → tarjeta →
// pestaña Zona con los estados esperados; y sin conexión, tras recargar, la Zona muestra la caché («actualizado hace»).
// Fase 4: Guía → buscar «cesar» → ficha de A. caesarea (aviso de comestible y caja de huevo) → comparativa con
// A. phalloides → su ficha dice MORTAL; sin conexión y tras recargar, la guía y sus fotos siguen cargando.
// Fase 5: descarga aparte del reconocedor (OPFS) → sin conexión, foto CC de A. caesarea → top-5 offline → A. phalloides
// y A. verna «no descartadas» hasta la pregunta del huevo; interior blanco → alerta roja; «Guardar sitio» rellena especie,
// foto y GPS; foto de A. phalloides. Fase 6: con conexión, Worker de Gemini simulado (403/413/429/503 y respuesta buena).
// La app solo expone window.__setas con ?e2e=1 (y solo entonces acepta la URL del Worker desde localStorage).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + '?e2e=1';
const CAPTURAS = join(dirname(fileURLToPath(import.meta.url)), 'capturas');
mkdirSync(CAPTURAS, { recursive: true });
const PUNTO = { latitude: 36.589, longitude: -5.244 };   // máximo local de idoneidad de caesarea
const FIXTURE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/open-meteo.json'), 'utf8'));
const NOTA = 'Ñandú & <castaños> "junto" al \'arroyo\' ✓';
const FOTOS_GUIA = join(dirname(fileURLToPath(import.meta.url)), '../../guia/fotos');
const URL_WORKER = 'https://setas-worker.e2e.invalid/identificar';
const PROHIBIDO = /comestible|se puede comer/i;
const informe = {};

let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], geolocation: PUNTO, permissions: ['geolocation'],
  acceptDownloads: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });

// Open-Meteo falso: 30 días pasados + 7 de previsión alrededor de hoy (Madrid), elevación = alt_media del punto.
const fechaMadrid = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let puntosMeteo = null, consultasMeteo = 0;
await ctx.route('**/api.open-meteo.com/**', async (r) => {
  consultasMeteo++;
  puntosMeteo ??= await (await fetch(new URL('data/meteo_puntos.json', URL_APP))).json();
  const u = new URL(r.request().url());
  const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
  const hoy = fechaMadrid(new Date());
  const rel = Array.from({ length: 37 }, (_, i) => i - 30);
  const una = (la, i) => ({ latitude: la, longitude: lon[i],
    elevation: puntosMeteo.find((p) => p.lat === la && p.lon === lon[i])?.alt_media ?? 0,
    daily: { time: rel.map((k) => sumar(hoy, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
      temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin) } });
  const cuerpo = lat.length === 1 ? una(lat[0], 0) : lat.map(una);
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuerpo) });
});
const estadosZona = () => p.$$eval('#lista-semaforo .semaforo-fila', (bs) => Object.fromEntries(bs.map((b) => [b.dataset.especie, b.dataset.estado])));
const igual = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
const captura = (n) => p.screenshot({ path: join(CAPTURAS, n) });
const mapaListo = () => p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
const reposo = () => p.evaluate(() => new Promise((r) => {
  const m = window.__setas.mapa; m.loaded() && m.areTilesLoaded() ? r() : m.once('idle', r);
}));
// Selector de especie con fotos: abre la hoja y elige la fila (el <select> que guarda el valor está oculto).
const elegirEspecie = async (id) => {
  await p.locator('#btn-especie').click();
  await p.locator('#dlg-especie[open]').waitFor();
  await p.locator(`#lista-especies [role=option][data-especie=${id}]`).click();
  await p.locator('#dlg-especie').waitFor({ state: 'hidden' });
};
const miniaturasCargadas = () => p.$$eval('#lista-especies [role=option]', (os) => os.map((o) => {
  const img = o.querySelector('img');
  return { id: o.dataset.especie, ok: !!img && img.complete && img.naturalWidth > 0 };
}));
// Ortofoto PNOA simulada: una tesela JPEG fija (foto de la guía recortada) para cualquier petición al WMTS del IGN.
const TESELA_PNOA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/pnoa-tesela.jpg'));
let teselasPnoa = 0;
await ctx.route('https://www.ign.es/wmts/pnoa-ma?**', (r) => {
  teselasPnoa++;
  return r.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: TESELA_PNOA });
});

try {
  await p.goto(URL_APP);
  await p.getByRole('button', { name: 'Entendido' }).click();
  await mapaListo();
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 });
  ok('carga en línea con el service worker activo');
  await reposo();
  await captura('01-inicio.png');
  // Conteos de la guía servida (la guía puede crecer; no se fijan números).
  const guiaServida = await p.evaluate(async () => (await fetch('guia/especies.json')).json());
  const N_FICHAS = guiaServida.length;
  const N_FOTOS = new Set(guiaServida.flatMap((f) => f.fotos.map((x) => x.archivo))).size;
  const N_CREDITOS = guiaServida.reduce((n, f) => n + f.fotos.length, 0);

  // Selector de especie con fotos.
  const idsMapa = await p.evaluate(async () => (await (await fetch('data/manifest.json')).json()).especies.map((e) => e.id));
  comprobar(await p.locator('#sel-especie').isHidden() && await p.locator('#btn-especie[aria-haspopup=dialog]').isVisible(),
    'el <select> de especie queda oculto tras un botón con miniatura');
  await p.locator('#btn-especie').click();
  await p.locator('#dlg-especie[open]').waitFor();
  await p.waitForFunction(() => [...document.querySelectorAll('#lista-especies img')].every((i) => i.complete));
  const minis = await miniaturasCargadas();
  const alturas = await p.$$eval('#lista-especies [role=option]', (os) => os.map((o) => o.getBoundingClientRect().height));
  comprobar(minis.length === idsMapa.length && minis.every((m) => m.ok) && alturas.every((h) => h >= 48),
    `hoja de especies: ${minis.length} filas con miniatura (${minis.map((m) => m.id).join(', ')}), filas ≥ 48 px`);
  comprobar(await p.locator('#lista-especies [aria-selected=true]').evaluate((o) => o === document.activeElement),
    'al abrir, el foco está en la especie elegida (aria-selected)');
  comprobar(/Boletus reticulatus|Boletus aestivalis/.test(await p.locator('#lista-especies [data-especie=boletus_aestivalis]').textContent()),
    'B. aestivalis muestra la foto y el nombre de la ficha de B. reticulatus');
  await captura('selector-lista.png');
  await p.keyboard.press('End');
  const ultima = idsMapa.at(-1);
  comprobar(await p.locator(`#lista-especies [data-especie=${ultima}]`).evaluate((o) => o === document.activeElement), 'teclado: Fin lleva a la última especie');
  await p.keyboard.press('Home');
  await p.keyboard.press('ArrowDown');
  const segunda = await p.evaluate(() => document.activeElement.dataset.especie);
  await p.keyboard.press('Enter');
  await p.locator('#dlg-especie').waitFor({ state: 'hidden' });
  await reposo();
  const capa = await p.evaluate(() => window.__setas.mapa.getSource('idoneidad').url);
  comprobar(segunda === idsMapa[1] && capa.includes(`idoneidad_${segunda}_`) && await p.locator('#sel-especie').inputValue() === segunda
    && await p.locator('#btn-especie').evaluate((b) => b === document.activeElement && b.dataset.especie) === segunda,
    `teclado: ↓ + Intro elige ${segunda}, cambia la capa (${capa.split('/').pop()}) y devuelve el foco al botón`);
  await elegirEspecie('boletus_edulis');
  await reposo();
  comprobar((await p.evaluate(() => window.__setas.mapa.getSource('idoneidad').url)).includes('idoneidad_boletus_edulis_')
    && /Boletus edulis/.test(await p.locator('#btn-especie').textContent()), 'tocar una fila cambia la capa de idoneidad');
  await captura('selector-boton.png');

  // Fondo Satélite (PNOA del IGN, teselas simuladas) y vuelta al mapa.
  await p.locator('#btn-capas').click();
  await p.locator('.base-mapa span', { hasText: 'Satélite' }).click();
  await p.waitForSelector('body[data-base=satelite]', { state: 'attached' });
  await reposo();
  const sat = await p.evaluate(() => {
    const m = window.__setas.mapa;
    const vis = (id) => m.getLayoutProperty(id, 'visibility') !== 'none';
    return { pnoa: vis('pnoa'), tierra: vis('earth'), agua: vis('water'), sombreado: vis('sombreado'), idoneidad: vis('idoneidad'),
      protegidos: vis('protegidos-linea'), sitios: vis('sitios'), atrib: document.querySelector('.maplibregl-ctrl-attrib').textContent,
      guardado: localStorage.getItem('setas:base') };
  });
  comprobar(sat.pnoa && !sat.tierra && !sat.agua && !sat.sombreado && sat.idoneidad && sat.protegidos && sat.sitios && teselasPnoa > 0
    && /PNOA © IGN \(CC BY 4\.0\)/.test(sat.atrib) && sat.guardado === 'satelite',
    `Satélite: ortofoto PNOA (${teselasPnoa} teselas simuladas) bajo idoneidad, protegidos y sitios; atribución PNOA; preferencia guardada`);
  await p.locator('#btn-capas').click();
  await captura('satelite-online.png');
  await p.reload();
  await mapaListo();
  comprobar(await p.evaluate(() => document.body.dataset.base) === 'satelite', 'tras recargar se recuerda el fondo Satélite');
  await p.locator('#btn-capas').click();
  await p.locator('.base-mapa span', { hasText: 'Mapa' }).click();
  await p.waitForSelector('body[data-base=mapa]', { state: 'attached' });
  await reposo();
  comprobar(await p.evaluate(() => {
    const m = window.__setas.mapa;
    return m.getLayoutProperty('pnoa', 'visibility') === 'none' && m.getLayoutProperty('earth', 'visibility') !== 'none'
      && m.getLayoutProperty('sombreado', 'visibility') !== 'none' && localStorage.getItem('setas:base') === 'mapa';
  }), 'vuelta a «Mapa»: base vectorial y sombreado otra vez visibles');
  await captura('satelite-vuelta-mapa.png');
  await p.locator('#btn-capas').click();
  await elegirEspecie(idsMapa[0]);   // el resto del recorrido parte de la especie por defecto

  await p.getByRole('button', { name: /Ajustes/ }).click();
  const btn = p.locator('#btn-descargar');
  const texto = await btn.textContent();
  comprobar(/Descargar mapas para uso sin cobertura \(\d+ MB\)/.test(texto), `botón de descarga: «${texto}»`);
  const recarga = p.waitForEvent('load', { timeout: 600000 });
  await btn.click();
  await recarga;
  await mapaListo();
  await p.waitForFunction(() => /Descargado el/.test(document.querySelector('#estado-descarga').textContent),
    null, { timeout: 30000 });
  comprobar(/Mapas actualizados/.test(await p.locator('#aviso').textContent()), 'tras la descarga la app recarga y avisa «Mapas actualizados»');
  comprobar(new URL(p.url()).searchParams.get('e2e') === '1', 'la recarga conserva ?e2e=1');
  await p.getByRole('button', { name: /Ajustes/ }).click();
  comprobar(true, `descarga a OPFS: ${await p.locator('#estado-descarga').textContent()}`);
  await captura('02-ajustes-descargado.png');

  // Re-descarga cortada: el primer .pmtiles pasa y el segundo se aborta en todos los reintentos.
  const estadoAntes = await p.evaluate(() => localStorage.getItem('setas:mapas-descargados'));
  let primero = null, victima = null, abortadas = 0;
  await ctx.route('**/*.pmtiles', (r) => {
    const req = r.request();
    if (req.headers()['range']) return r.continue();
    const n = req.url().split('/').pop();
    primero ??= n;
    if (n !== primero) victima ??= n;
    if (n === victima) { abortadas++; return r.abort(); }
    return r.continue();
  });
  const btn2 = p.locator('#btn-descargar');
  comprobar(/Volver a descargar|Actualizar mapas/.test(await btn2.textContent()), `botón de re-descarga: «${await btn2.textContent()}»`);
  await btn2.click();
  await p.waitForFunction(() => /Error en la descarga/.test(document.querySelector('#aviso').textContent), null, { timeout: 600000 });
  await ctx.unroute('**/*.pmtiles');
  const tras = await p.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    const dirs = [];
    for await (const k of raiz.keys()) dirs.push(k);
    return { estado: localStorage.getItem('setas:mapas-descargados'), dirs, aviso: document.querySelector('#aviso').textContent };
  });
  comprobar(abortadas === 3, `${victima} abortado en sus 3 intentos (${abortadas})`);
  comprobar(tras.estado === estadoAntes && /Descargado el/.test(await p.locator('#estado-descarga').textContent()),
    'el estado de la descarga anterior sigue intacto');
  comprobar(!tras.dirs.includes('mapas-nuevo') && tras.dirs.includes('mapas'), `staging borrado, mapas antiguos en su sitio (${tras.dirs.join(', ')})`);
  await captura('02b-redescarga-fallida.png');

  // Re-descarga completa: intercambio sobre los archivos existentes y recarga.
  const recarga2 = p.waitForEvent('load', { timeout: 600000 });
  await p.locator('#btn-descargar').click();
  await recarga2;
  await mapaListo();
  const tras2 = await p.evaluate(() => ({ estado: localStorage.getItem('setas:mapas-descargados'), aviso: document.querySelector('#aviso').textContent }));
  comprobar(/Mapas actualizados/.test(tras2.aviso) && tras2.estado && tras2.estado !== estadoAntes
    && JSON.parse(tras2.estado).archivos[victima] > 0, 're-descarga completa: archivos sustituidos y estado nuevo');

  // Zona con el fixture de Open-Meteo: tocar el mapa → tarjeta → pestaña Zona.
  await p.waitForSelector('body[data-meteo]', { state: 'attached', timeout: 30000 });
  comprobar(consultasMeteo >= 1 && await p.evaluate(() => Object.keys(window.__setas.meteo().datos?.puntos ?? {}).length) > 40,
    `Open-Meteo (fixture) consultado: ${consultasMeteo} petición(es)`);
  await p.getByRole('button', { name: /Mapa/ }).click();
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 10 }), PUNTO);
  await reposo();
  const caja = await p.locator('#mapa canvas').boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.locator('#tarjeta-zona').waitFor();
  const tarjeta = await p.locator('#tarjeta-zona').textContent();
  comprobar(/Boletus aereus: Buen momento/.test(tarjeta) && /ventana abierta/.test(tarjeta), `tarjeta al tocar el mapa: «${tarjeta.trim().replace(/\s+/g, ' ')}»`);
  await p.locator('[data-capa=semaforo]').evaluate((c) => { c.checked = true; c.dispatchEvent(new Event('change')); });
  await reposo();
  await captura('07-mapa-semaforo.png');
  await p.locator('#tz-ver').click();
  await p.locator('#lista-semaforo .semaforo-fila').first().waitFor();
  const est1 = await estadosZona();
  comprobar(igual(est1, FIXTURE.esperado), `Zona con el fixture: ${JSON.stringify(est1)}`);
  comprobar(/temperatura justa: máximas altas/.test(await p.locator('[data-especie=boletus_pinophilus] .mot').textContent())
    && /ventana pasada/.test(await p.locator('[data-especie=amanita_caesarea] .mot').textContent()), 'los motivos explican el amarillo y el rojo');
  comprobar(await p.locator('#grafico svg path[fill="#2a78d6"]').count() === Object.keys(FIXTURE.lluvia).length
    && /hoy/.test(await p.locator('#grafico-dato').textContent()), 'gráfico con la lluvia del fixture y el dato de hoy');
  comprobar(/Orientativo: reglas de aficionado, no ciencia exacta\./.test(await p.locator('#p-zona').textContent()), 'texto fijo «Orientativo…»');
  await captura('08-zona-fixture.png');
  await p.locator('#zona-grafico').scrollIntoViewIfNeeded();
  await captura('09-zona-grafico.png');

  // Fase 5: descarga aparte y opcional del reconocedor (no entra en la de mapas).
  await p.getByRole('button', { name: /Ajustes/ }).click();
  const btnModelo = p.locator('#btn-modelo');
  const txtModelo = await btnModelo.textContent();
  comprobar(/^Descargar reconocedor sin cobertura \(≈\d+ MB\)$/.test(txtModelo), `botón del reconocedor: «${txtModelo}»`);
  comprobar(/Pendiente de configurar/.test(await p.locator('#estado-gemini').textContent()), 'Ajustes: segunda opinión «Pendiente de configurar» sin VITE_WORKER_URL');
  const mapasAntes = await p.evaluate(() => JSON.parse(localStorage.getItem('setas:mapas-descargados')).archivos);
  comprobar(!Object.keys(mapasAntes).some((n) => /onnx|wasm|texto_f16/.test(n)), 'la descarga de mapas no incluye el reconocedor');
  const t0Modelo = Date.now();
  await btnModelo.click();
  await p.waitForFunction(() => /Descargado el/.test(document.querySelector('#estado-modelo').textContent), null, { timeout: 600000 });
  const opfsModelo = await p.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    const d = await raiz.getDirectoryHandle('modelo');
    const r = {};
    for await (const [n, h] of d.entries()) r[n] = (await h.getFile()).size;
    return r;
  });
  informe.modelo = opfsModelo;
  comprobar(opfsModelo['vision_int8.onnx'] > 80e6 && opfsModelo['ort-wasm-simd-threaded.wasm'] > 5e6 && Object.keys(opfsModelo).length === 4,
    `reconocedor en OPFS en ${((Date.now() - t0Modelo) / 1000).toFixed(1)} s: ${Object.entries(opfsModelo).map(([n, b]) => `${n} ${(b / 1e6).toFixed(1)} MB`).join(', ')}`);
  await captura('reconocer-ajustes.png');

  // Fase 4: Guía de especies.
  await p.waitForSelector('body[data-guia-fotos=completas]', { state: 'attached', timeout: 180000 });
  const enCache = await p.evaluate(async () => (await (await caches.open('guia-fotos')).keys()).length);
  comprobar(enCache === N_FOTOS, `fotos de la guía guardadas en la caché «guia-fotos» (${enCache})`);
  const tabGuia = p.locator('.pestanas button[data-p=p-guia]');
  await tabGuia.click();
  await p.locator('.tarjeta-guia').first().waitFor();
  const grupos = await p.$$eval('.grupo-guia h2', (hs) => hs.map((h) => h.textContent));
  comprobar(await p.locator('.tarjeta-guia').count() === N_FICHAS && grupos.length === 4, `Guía: ${N_FICHAS} especies en 4 grupos (${grupos.join(', ')})`);
  const textosInsignias = await p.$$eval('.insignia', (xs) => [...new Set(xs.map((x) => x.textContent))]);
  comprobar(!textosInsignias.some((t) => /comestible/i.test(t)) && textosInsignias.includes('☠ MORTAL'),
    `ninguna insignia dice «comestible» (${textosInsignias.join(', ')})`);
  await captura('guia-lista.png');
  await p.locator('#guia-buscar').fill('cesar');
  const encontradas = await p.$$eval('.tarjeta-guia', (bs) => bs.map((b) => b.dataset.id));
  comprobar(encontradas.includes('amanita_caesarea'), `buscar «cesar» (sin tilde) encuentra la oronja: ${encontradas.join(', ')}`);
  await captura('guia-busqueda.png');
  await p.locator('.tarjeta-guia[data-id=amanita_caesarea]').click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  const banner = p.locator('#guia-ficha .banner-comestible');
  comprobar(await banner.isVisible() && (await banner.textContent()) === 'Considerada comestible por la bibliografía. No la consumas sin la confirmación de un experto.',
    'ficha de A. caesarea con el aviso fijo de comestible');
  comprobar(await p.locator('#guia-ficha .caja-huevo').isVisible() && /huevo/i.test(await p.locator('#guia-ficha .caja-huevo').textContent()),
    'caja «En fase de huevo» visible');
  comprobar(await p.locator('#guia-ficha .checklist li').count() >= 3, 'rasgos clave como lista de comprobación');
  await captura('guia-ficha-caesarea.png');
  const comp = p.locator('#guia-ficha .comparar[data-id=amanita_phalloides]');
  await comp.scrollIntoViewIfNeeded();
  comprobar(await banner.isVisible(), 'el aviso de comestible sigue visible al bajar por la ficha');
  comprobar(/MORTAL/.test(await comp.locator('.insignia').last().textContent()), 'la comparativa marca A. phalloides como MORTAL');
  await captura('guia-no-confundir.png');
  await comp.click();
  await p.locator('#guia-ficha[data-id=amanita_phalloides]').waitFor();
  const peligro = p.locator('#guia-ficha .caja-peligro.mortal');
  comprobar(await peligro.isVisible() && /MORTAL/.test(await peligro.textContent()) && await p.locator('#guia-ficha .banner-comestible').count() === 0,
    'ficha de A. phalloides: caja MORTAL arriba y sin aviso de comestible');
  await captura('guia-ficha-phalloides.png');
  await p.goBack();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  ok('«atrás» vuelve a la ficha de A. caesarea');

  await ctx.setOffline(true);
  await p.reload();
  await mapaListo();
  ok('recarga sin conexión: el app shell sale del service worker');
  await tabGuia.click();
  await p.locator('.pestanas button[data-p=p-guia].activa').waitFor();
  if (await p.locator('#guia-ficha').isVisible()) await p.locator('.btn-volver').click();
  await p.locator('.tarjeta-guia').first().waitFor();
  comprobar(await p.locator('.tarjeta-guia').count() === N_FICHAS, 'sin conexión la guía carga (precache)');
  await p.locator('.tarjeta-guia[data-id=amanita_phalloides]').click();
  await p.locator('#guia-ficha[data-id=amanita_phalloides]').waitFor();
  const foto = p.locator('#guia-ficha .carrusel-guia img').first();
  await foto.evaluate((i) => i.decode().catch(() => {}));
  const dims = await foto.evaluate((i) => ({ ok: i.complete, w: i.naturalWidth, src: i.getAttribute('src') }));
  comprobar(dims.ok && dims.w > 0, `sin conexión la foto sale de la caché (${dims.src}, ${dims.w} px de ancho)`);
  await captura('guia-offline.png');

  // Fase 5: reconocedor sin conexión.
  await p.getByRole('button', { name: /Reconocer/ }).click();
  comprobar(/Reconocedor listo/.test(await p.locator('#rec-estado').textContent()), 'Reconocer sin conexión: «Reconocedor listo»');
  const analizar = async (archivo) => {
    await p.evaluate(() => { delete document.body.dataset.reconocer; });
    await p.locator('#rec-galeria').setInputFiles(join(FOTOS_GUIA, archivo));
    await p.locator('#rec-analizar').click();
    await p.waitForSelector('body[data-reconocer=resultado]', { state: 'attached', timeout: 180000 });
    return p.evaluate(() => ({
      ms: Number(document.body.dataset.reconocerMs), inferencia: document.body.dataset.reconocerMsInferencia,
      carga: Number(document.body.dataset.reconocedorCargaMs ?? 0),
      top5: [...document.querySelectorAll('.rec-cand')].map((l) => ({ nombre: l.dataset.nombre, id: l.dataset.id, banda: l.dataset.banda })),
    }));
  };
  const noDescartadas = () => p.$$eval('#rec-peligrosas .peligrosa', (ls) => ls.map((l) => l.dataset.id));
  const responder = async (q, v) => {
    await p.locator(`fieldset[data-pregunta=${q}] input[value=${v}]`).check();
  };
  const rc = await analizar('amanita_caesarea_1.jpg');
  informe.caesarea = rc;
  comprobar(rc.top5.length === 5 && rc.top5[0].id === 'amanita_caesarea',
    `foto de A. caesarea sin red: top-5 ${rc.top5.map((c) => `${c.nombre} (${c.banda})`).join(', ')} · ${rc.ms} ms`);
  comprobar(await p.locator('.rec-cand .banda').first().textContent() === 'Parecido alto'
    && !/\d+\s*%/.test(await p.locator('#rec-candidatos').textContent()), 'parecido cualitativo, sin porcentajes');
  const nd0 = await noDescartadas();
  comprobar(nd0.includes('amanita_phalloides') && nd0.includes('amanita_verna') && nd0.indexOf('amanita_phalloides') < 2,
    `A. phalloides y A. verna «no descartadas» en rojo (${nd0.join(', ')})`);
  comprobar(/NO DESCARTADA/.test(await p.locator('#rec-peligrosas .peligrosa[data-id=amanita_phalloides]').textContent()), 'phalloides marcada «NO DESCARTADA»');
  const textoRec = async () => p.locator('#p-reconocer').evaluate((e) => e.innerText);
  comprobar(!PROHIBIDO.test(await textoRec()), 'la pantalla de resultado no dice «comestible» ni «se puede comer»');
  comprobar((await p.locator('#rec-aviso-final').textContent()) === 'No consumas ninguna seta sin la confirmación de un experto.', 'aviso fijo del experto en el resultado');
  comprobar(await p.locator('#rec-gemini').isHidden(), 'sin Worker configurado no hay botón de segunda opinión');
  await p.locator('#rec-resultado').scrollIntoViewIfNeeded();
  await captura('reconocer-caesarea.png');
  await responder('interior_huevo', 'no_se');
  await responder('volva_saco', 'no_se');
  comprobar((await noDescartadas()).includes('amanita_phalloides'), '«No sé» no descarta phalloides');
  await responder('interior_huevo', 'naranja_amarillo');
  const nd1 = await noDescartadas();
  const desc1 = await p.$$eval('#rec-descartadas li', (ls) => ls.map((l) => l.dataset.id));
  comprobar(!nd1.includes('amanita_phalloides') && !nd1.includes('amanita_verna') && desc1.includes('amanita_phalloides'),
    `interior naranja y amarillo: phalloides y verna pasan a «descartadas por tus respuestas» (quedan: ${nd1.join(', ')})`);
  comprobar(await p.locator('#rec-aviso-final').isVisible() && !PROHIBIDO.test(await textoRec()), 'el aviso del experto sigue tras descartar');
  await p.locator('fieldset[data-pregunta=interior_huevo]').scrollIntoViewIfNeeded();
  await captura('reconocer-huevo-naranja.png');
  await responder('interior_huevo', 'blanco');
  await p.waitForSelector('body[data-alerta=mortal]', { state: 'attached' });
  const alerta = p.locator('#rec-alertas .alerta-roja');
  comprobar(await alerta.isVisible() && /MORTAL/.test(await alerta.textContent()) && (await noDescartadas()).slice(0, 2).sort().join() === 'amanita_phalloides,amanita_verna',
    'interior blanco: alerta roja MORTAL y phalloides/verna de nuevo arriba');
  await alerta.scrollIntoViewIfNeeded();
  await captura('reconocer-alerta.png');

  await p.locator('#rec-guardar').click();
  await p.locator('#dlg-sitio[open]').waitFor();
  await p.locator('#foto-sitio:not([hidden])').waitFor();
  const pre = await p.evaluate(() => ({ especie: document.querySelector('#sitio-especie').value, coord: document.querySelector('#coord-sitio').textContent }));
  comprobar(pre.especie === 'amanita_caesarea' && pre.coord.startsWith('36.58900, -5.24400'), `«Guardar sitio» rellena especie, foto y GPS (${pre.especie}, ${pre.coord})`);
  await p.locator('textarea[name=nota]').fill('Desde Reconocer');
  await captura('reconocer-guardar.png');
  await p.locator('#btn-sitio-guardar').click();
  await p.locator('#dlg-sitio').waitFor({ state: 'hidden' });

  await p.locator('.miniatura .btn-x').first().click();
  const rp = await analizar('amanita_phalloides_1.jpg');
  informe.phalloides = rp;
  const nd2 = await noDescartadas();
  comprobar(rp.top5[0].id === 'amanita_phalloides' && nd2[0] === 'amanita_phalloides',
    `foto de A. phalloides sin red: top-5 ${rp.top5.map((c) => `${c.nombre} (${c.banda})`).join(', ')} · ${rp.ms} ms; primera peligrosa ${nd2[0]}`);
  await p.locator('#rec-resultado').scrollIntoViewIfNeeded();
  await captura('reconocer-phalloides.png');
  const consultasAntes = consultasMeteo;
  await p.getByRole('button', { name: /Zona/ }).click();
  await p.locator('#lista-semaforo .semaforo-fila').first().waitFor();
  const txtMeteo = await p.locator('#estado-meteo').textContent();
  comprobar(/Sin conexión: último dato guardado, actualizado hace/.test(txtMeteo), `Zona sin conexión: «${txtMeteo}»`);
  comprobar(igual(await estadosZona(), FIXTURE.esperado) && consultasMeteo === consultasAntes
    && await p.evaluate(() => window.__setas.meteo().origen) === 'cache', 'sin conexión la Zona sale de la caché de IndexedDB');
  await captura('10-zona-offline.png');
  await p.getByRole('button', { name: /Mapa/ }).click();
  await p.locator('[data-capa=semaforo]').evaluate((c) => { c.checked = true; c.dispatchEvent(new Event('change')); });
  await reposo();
  const mz = await p.evaluate(() => window.__setas.origenes()['meteo_zonas.pmtiles']);
  comprobar(mz?.origen === 'opfs' && mz.http === 0, `capa Semáforo (Voronoi) desde OPFS sin red (${mz?.opfs} lecturas)`);
  await p.getByRole('button', { name: /Mapa/ }).click();
  // Sin conexión: las miniaturas del selector salen del precache y el Satélite cae al mapa con aviso.
  await p.locator('#btn-especie').click();
  await p.locator('#dlg-especie[open]').waitFor();
  await p.waitForFunction(() => [...document.querySelectorAll('#lista-especies img')].every((i) => i.complete));
  const minisOff = await miniaturasCargadas();
  comprobar(minisOff.length > 0 && minisOff.every((m) => m.ok), `sin conexión las ${minisOff.length} miniaturas del selector cargan (precache)`);
  await captura('selector-offline.png');
  await p.keyboard.press('Escape');
  await p.locator('#dlg-especie').waitFor({ state: 'hidden' });
  const teselasAntes = teselasPnoa;
  await p.locator('#btn-capas').click();
  await p.locator('.base-mapa span', { hasText: 'Satélite' }).click();
  await p.waitForFunction(() => /La vista satélite necesita cobertura/.test(document.querySelector('#aviso').textContent)
    && !document.querySelector('#aviso').hidden);
  const off = await p.evaluate(() => ({ base: document.body.dataset.base, pnoa: window.__setas.mapa.getLayoutProperty('pnoa', 'visibility'),
    mapa: document.querySelector('input[name=base][value=mapa]').checked }));
  comprobar(off.base === 'mapa' && off.pnoa === 'none' && off.mapa && teselasPnoa === teselasAntes,
    'sin conexión, «Satélite» avisa «La vista satélite necesita cobertura» y se queda en el mapa');
  await captura('satelite-offline-aviso.png');
  await p.locator('.base-mapa span', { hasText: 'Mapa' }).click();
  await p.locator('#btn-capas').click();
  await elegirEspecie('amanita_caesarea');
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 12 }), PUNTO);
  await reposo();
  const est = await p.evaluate(() => {
    const m = window.__setas.mapa;
    return { o: window.__setas.origenes(), base: m.queryRenderedFeatures().filter((f) => f.source === 'protomaps').length,
      idon: m.isSourceLoaded('idoneidad') };
  });
  const base = est.o['base.pmtiles'], cae = est.o['idoneidad_amanita_caesarea_0.pmtiles'];
  comprobar(base?.origen === 'opfs' && base.http === 0 && est.base > 0,
    `mapa base desde OPFS sin red (${est.base} entidades visibles, ${base?.opfs} lecturas)`);
  comprobar(cae?.origen === 'opfs' && cae.opfs >= 3 && est.idon,
    `capa de Amanita caesarea desde OPFS (${cae?.opfs} lecturas)`);
  await captura('03-offline-caesarea.png');
  const verFicha = p.locator('#btn-ver-ficha');
  await verFicha.waitFor();
  await captura('guia-mapa-boton.png');
  await verFicha.click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  comprobar(await p.locator('#p-guia').isVisible(), '«Ver ficha» en el panel del mapa abre la ficha de la especie elegida');
  await p.getByRole('button', { name: /Mapa/ }).click();
  await elegirEspecie('boletus_aestivalis');
  await verFicha.waitFor();
  await verFicha.click();
  await p.locator('#guia-ficha[data-id=boletus_reticulatus]').waitFor();
  ok('«Ver ficha» de Boletus aestivalis abre la ficha de B. reticulatus (sinónimo)');
  await p.getByRole('button', { name: /Mapa/ }).click();
  await elegirEspecie('amanita_caesarea');

  await p.getByRole('button', { name: 'Guardar sitio aquí' }).click();
  await p.locator('#dlg-sitio[open]').waitFor();
  await p.locator('.estrellas span', { hasText: /^★★★$/ }).click();
  await p.locator('textarea[name=nota]').fill(NOTA);
  await captura('04-nuevo-sitio.png');
  await p.locator('#btn-sitio-guardar').click();
  await p.locator('#dlg-sitio').waitFor({ state: 'hidden' });
  ok('sitio creado con el GPS sin conexión');

  await p.getByRole('button', { name: /Mis sitios/ }).click();
  await p.locator('.sitio').first().waitFor();
  comprobar((await p.locator('.sitio .txt').first().textContent()) === NOTA, 'el sitio aparece en Mis sitios con su nota');
  await captura('05-mis-sitios.png');
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar GPX' }).click()]);
  const ruta = join(CAPTURAS, 'mis-sitios.gpx');
  await descarga.saveAs(ruta);
  const gpx = readFileSync(ruta, 'utf8');
  comprobar(gpx.includes('<wpt lat="36.589" lon="-5.244">') && gpx.includes('★★★ Amanita caesarea')
    && gpx.includes('&lt;castaños&gt;'), `GPX exportado (${descarga.suggestedFilename()})`);

  await p.getByRole('button', { name: /Ajustes/ }).click();
  await captura('06-ajustes-offline.png');
  comprobar(new RegExp(`Guía lista sin cobertura: textos y ${N_FOTOS} fotos`).test(await p.locator('#estado-guia').textContent()), `Ajustes: «${await p.locator('#estado-guia').textContent()}»`);
  await p.locator('#creditos-fotos summary').click();
  await p.locator('#lista-creditos .credito-especie').first().waitFor();
  comprobar(await p.locator('#lista-creditos li').count() === N_CREDITOS, `Créditos de fotos: ${N_CREDITOS} entradas con autor y licencia`);
  await p.locator('#creditos-fotos').scrollIntoViewIfNeeded();
  await captura('guia-creditos.png');

  // Fase 6: segunda opinión con el Worker simulado (la URL de pruebas solo se acepta con ?e2e=1).
  await p.evaluate((u) => localStorage.setItem('setas:e2e-worker-url', u), URL_WORKER);
  await ctx.setOffline(false);
  await p.reload();
  await mapaListo();
  await p.getByRole('button', { name: /Ajustes/ }).click();
  comprobar(/Configurada/.test(await p.locator('#estado-gemini').textContent()), 'Ajustes: segunda opinión configurada');
  const peticiones = [];
  const errorWorker = (status, codigo) => ({ status, contentType: 'application/json', body: JSON.stringify({ error: { codigo, mensaje: 'x' } }) });
  const respuestas = [errorWorker(403, 'origen_no_permitido'), errorWorker(413, 'carga_demasiado_grande'),
    errorWorker(429, 'limite_diario_superado'), errorWorker(503, 'gemini_saturado'),
    { status: 200, contentType: 'application/json', body: JSON.stringify({
      candidatos: [{ nombre_cientifico: 'Amanita caesarea', nombre_comun: 'oronja', confianza: 'media',
        rasgos_observados: ['sombrero naranja', 'excelente comestible'], rasgos_que_faltan_ver: ['base del pie con la volva'] }],
      peligrosas_posibles: [{ nombre_cientifico: 'Amanita phalloides', motivo: 'el huevo cerrado es igual por fuera' },
        { nombre_cientifico: 'Amanita virosa', motivo: 'amanita blanca mortal' }],
      fotos_recomendadas: ['corte vertical del huevo'], aviso: 'Se puede comer' }) }];
  await ctx.route(URL_WORKER, async (r) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    peticiones.push(JSON.parse(r.request().postData()));
    const resp = respuestas[Math.min(peticiones.length - 1, respuestas.length - 1)];
    await r.fulfill({ ...resp, headers: cors });
  });
  await p.getByRole('button', { name: /Reconocer/ }).click();
  await analizar('amanita_caesarea_1.jpg');
  await responder('interior_huevo', 'naranja_amarillo');
  const btnG = p.locator('#rec-gemini');
  comprobar(await btnG.isVisible() && await btnG.isEnabled(), 'con conexión y Worker configurado: botón «Segunda opinión (Gemini)» activo');
  await ctx.setOffline(true);
  await p.waitForFunction(() => document.querySelector('#rec-gemini').disabled);
  comprobar(/Sin conexión/.test(await p.locator('#rec-gemini-nota').textContent()), 'sin conexión el botón de Gemini se desactiva');
  await ctx.setOffline(false);
  await p.waitForFunction(() => !document.querySelector('#rec-gemini').disabled);
  for (const [estado, re] of [[403, /no está autorizada/], [413, /pesan demasiado/], [429, /límite diario/], [503, /saturado/]]) {
    await p.evaluate(() => { delete document.body.dataset.gemini; });
    await btnG.click();
    await p.waitForSelector('body[data-gemini=error]', { state: 'attached', timeout: 30000 });
    const t = await p.locator('#rec-gemini-nota').textContent();
    comprobar(re.test(t), `Worker ${estado}: «${t}»`);
    if (estado === 429) { await p.locator('#rec-gemini-nota').scrollIntoViewIfNeeded(); await captura('reconocer-gemini-error.png'); }
  }
  await p.evaluate(() => { delete document.body.dataset.gemini; });
  await btnG.click();
  await p.waitForSelector('body[data-gemini=ok]', { state: 'attached', timeout: 30000 });
  const pet = peticiones.at(-1);
  const bytesFoto = Math.floor(pet.fotos[0].length * 3 / 4);
  comprobar(pet.fotos.length === 1 && pet.fotos[0].startsWith('/9j/') && bytesFoto <= 1.5 * 1024 * 1024
    && pet.respuestas_guiadas.interior_huevo === 'Naranja y amarillo' && pet.respuestas_guiadas.volva_saco === null
    && /^\d{4}-\d{2}-\d{2}$/.test(pet.contexto.fecha) && pet.contexto.lat === 36.589 && pet.contexto.lon === -5.244
    && pet.candidatos_offline.length === 5 && pet.candidatos_offline[0].id === 'amanita_caesarea'
    && pet.candidatos_offline.every((c) => c.score >= 0 && c.score <= 1),
    `petición al Worker: 1 foto JPEG de ${(bytesFoto / 1024).toFixed(0)} KB, respuestas, fecha y GPS, 5 candidatos offline`);
  const ndG = await noDescartadas();
  comprobar(ndG.includes('amanita_phalloides') && ndG.includes('Amanita virosa'),
    `unión con Gemini: phalloides vuelve a la lista roja y se añade A. virosa (${ndG.join(', ')})`);
  comprobar(await p.locator('#rec-gemini-resultado').isVisible() && !PROHIBIDO.test(await textoRec()),
    'respuesta de Gemini con la misma presentación y sin «comestible» ni «se puede comer»');
  await p.locator('#rec-gemini-resultado').scrollIntoViewIfNeeded();
  await captura('reconocer-gemini.png');
  await p.locator('#rec-peligrosas').scrollIntoViewIfNeeded();
  await captura('reconocer-gemini-peligrosas.png');
  console.log('INFORME', JSON.stringify(informe));

  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('e2e OK');
} catch (e) {
  await captura('error.png').catch(() => {});
  console.error(e.message, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
