// e2e del chat con fotos y enlaces de Google Maps (2026-11-08). Playwright, iPhone Pro Max (430×932), Worker simulado
// (/chat y /resolver-enlace interceptados):
//  - botón de adjuntar → miniaturas con «quitar», máximo 3 fotos; la foto con GPS en el EXIF ofrece el chip «Ubicación
//    de la foto» (se puede quitar); lo que viaja es un JPEG de ≤1280 px SIN EXIF, en base64
//  - enlace corto de Maps del ejemplo real (+ «aquí estaban con gusanos ya») → el cliente pide /resolver-enlace → el
//    mensaje lleva «Ubicación compartida: 36.63153, -4.79242» → chip «📍 Ver en el mapa» que centra el mapa
//  - el modelo consulta estado_en_punto y propone guardar: nada se guarda hasta pulsar «Guardar en Mis sitios»
//  - el historial (memoria y IndexedDB) no guarda el base64; la consulta siguiente manda «[foto enviada antes]»
//  - la CSP del build deja pintar las miniaturas (blob:) sin violaciones
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
const URL_WORKER = 'https://setas-worker.e2e.invalid/identificar';
const AVISO = 'No consumas ninguna seta sin la confirmación de un experto.';
const ENLACE = 'https://maps.app.goo.gl/zcKpg1MnaUy2fDZd7?g_st=ic';
const TEXTO_ENLACE = `${ENLACE} aquí estaban con gusanos ya`;
const PUNTO = { lat: 36.631531, lon: -4.792421 };
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

// ---------------------------------------------------------------- JPEG con EXIF GPS (para probar que se lee y luego se quita)
function exifGps(lat, lon) {
  const u16 = (v) => [v & 255, v >> 8], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const grados = (v) => { const g = Math.floor(v), m = Math.floor((v - g) * 60), s = ((v - g) * 60 - m) * 60; return [[g, 1], [m, 1], [Math.round(s * 100), 100]]; };
  const rac = (v) => grados(Math.abs(v)).flatMap(([n, d]) => [...u32(n), ...u32(d)]);
  const t = [0x49, 0x49, ...u16(42), ...u32(8), ...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(26), ...u32(0)];
  while (t.length < 26) t.push(0);
  t.push(...u16(4), ...u16(1), ...u16(2), ...u32(2), lat >= 0 ? 78 : 83, 0, 0, 0, ...u16(2), ...u16(5), ...u32(3), ...u32(80),
    ...u16(3), ...u16(2), ...u32(2), lon >= 0 ? 69 : 87, 0, 0, 0, ...u16(4), ...u16(5), ...u32(3), ...u32(104), ...u32(0));
  while (t.length < 80) t.push(0);
  t.push(...rac(lat), ...rac(lon));
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  return Buffer.from([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif]);
}
const conExif = (jpeg, lat, lon) => Buffer.concat([jpeg.subarray(0, 2), exifGps(lat, lon), jpeg.subarray(2)]);
/** Ancho y alto de un JPEG (marcador SOF). */
function dimensiones(buf) {
  for (let p = 2; p + 9 < buf.length;) {
    if (buf[p] !== 0xff) return null;
    const m = buf[p + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: buf.readUInt16BE(p + 5), ancho: buf.readUInt16BE(p + 7) };
    p += 2 + buf.readUInt16BE(p + 2);
  }
  return null;
}

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['iPhone 14 Pro Max'], viewport: { width: 430, height: 932 }, geolocation: { latitude: 36.51234, longitude: -4.88876 }, permissions: ['geolocation'], locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.addInitScript((u) => { try { localStorage.setItem('setas:e2e-worker-url', u); } catch { /* sin almacenamiento */ } }, URL_WORKER);

const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let puntosMeteo = null;
await ctx.route('**/api.open-meteo.com/**', async (r) => {
  puntosMeteo ??= await (await fetch(new URL('data/marbella/meteo_puntos.json', BASE))).json();
  const u = new URL(r.request().url());
  const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
  const rel = Array.from({ length: 46 }, (_, i) => i - 30);
  const una = (la, i) => ({ latitude: la, longitude: lon[i], elevation: puntosMeteo.find((p) => p.lat === la && p.lon === lon[i])?.alt_media ?? 0,
    daily: { time: rel.map((k) => sumar(HOY_E2E, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
      temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin),
      et0_fao_evapotranspiration: rel.map(() => FIXTURE.et0), relative_humidity_2m_min: rel.map(() => FIXTURE.hr_min) },
    hourly: { time: rel.flatMap((k) => Array.from({ length: 24 }, (_, h) => `${sumar(HOY_E2E, k)}T${String(h).padStart(2, '0')}:00`)),
      soil_moisture_9_to_27cm: rel.flatMap(() => Array(24).fill(FIXTURE.suelo)) } });
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(lat.length === 1 ? una(lat[0], 0) : lat.map(una)) });
});
await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));

// ---------------------------------------------------------------- Worker simulado
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-expose-headers': 'X-Restantes-Hoy' };
const peticiones = [];      // cuerpos de /chat
const resueltos = [];       // cuerpos de /resolver-enlace
const textoDe = (m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').at(-1)?.text : m.content);
const preguntaDe = (msgs) => {
  const u = [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && !m.content.some((b) => b.type === 'tool_result'));
  return u ? textoDe(u) : '';
};
const GUION_ENLACE = [
  { content: [
    { type: 'tool_use', id: 'toolu_pt', name: 'estado_en_punto', input: { lat: 36.63153, lon: -4.79242, dia: 0 } },
    { type: 'tool_use', id: 'toolu_gu', name: 'proponer_guardar_ubicacion', input: { lat: 36.63153, lon: -4.79242, especie: null, nota: 'Con gusanos', estrellas: null } }], stop_reason: 'tool_use', texto: '' },
  { content: [{ type: 'text', text: 'Ahí no están en su mejor momento. Si quieres, puedes guardar el sitio con el botón de abajo.' }], stop_reason: 'end_turn',
    texto: 'Ahí no están en su mejor momento. Si quieres, puedes guardar el sitio con el botón de abajo.' },
];
const SOLO_TEXTO = (t) => [{ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', texto: t }];
const GUIONES = {
  [TEXTO_ENLACE]: GUION_ENLACE,
  '¿Qué es esto?': SOLO_TEXTO('Podría encajar con varias especies; una foto no basta para identificarla. No comas nada sin que lo confirme un experto micólogo.'),
  'otra pregunta': SOLO_TEXTO('Vale.'),
};
let resolverFalla = false;
await ctx.route('https://setas-worker.e2e.invalid/**', async (r) => {
  const req = r.request();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST, OPTIONS' } });
  const body = JSON.parse(req.postData() ?? '{}');
  if (req.url().endsWith('/resolver-enlace')) {
    resueltos.push(body);
    if (resolverFalla) return r.fulfill({ status: 422, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { codigo: 'enlace_no_resuelto', mensaje: 'x' } }) });
    return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(PUNTO) });
  }
  peticiones.push(body);
  const msgs = body.messages;
  const guion = GUIONES[preguntaDe(msgs)];
  if (!guion) return r.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { codigo: 'solicitud_invalida', mensaje: `sin guion para «${preguntaDe(msgs)}»` } }) });
  const desde = msgs.findLastIndex((m) => m.role === 'user' && Array.isArray(m.content) && !m.content.some((b) => b.type === 'tool_result'));
  const i = msgs.slice(desde).filter((m) => m.role === 'assistant').length;
  await r.fulfill({ status: 200, headers: { ...CORS, ...(i === 0 ? { 'X-Restantes-Hoy': '20' } : {}) }, contentType: 'application/json', body: JSON.stringify({ aviso: AVISO, ...guion[i] }) });
});

const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') console.log('consola:', m.text().slice(0, 200)); });
await p.addInitScript(() => { window.__violaciones = []; document.addEventListener('securitypolicyviolation', (e) => window.__violaciones.push(`${e.violatedDirective} ${e.blockedURI}`)); });
const chat = () => p.evaluate(() => window.__setas.chat());
const alta = async () => { await p.waitForTimeout(800); if ((await p.locator('#chat').getAttribute('data-reten')) !== '2') await abrirHoja(); };
const abrirHoja = async () => { await p.locator('#chat .ta-cab').click(); await p.waitForFunction(() => document.querySelector('#chat').dataset.reten === '2'); await p.waitForTimeout(700); };
const esperarRespuesta = (n) => p.waitForFunction((n) => { const c = window.__setas.chat(); return !c.ocupado && (c.turnos.length === n || c.error); }, n, { timeout: 20000 });
const jpegGrande = async () => Buffer.from(await p.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2000;
  const c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 3000, 2000); g.addColorStop(0, '#3a5a2a'); g.addColorStop(1, '#c8b27a');
  c.fillStyle = g; c.fillRect(0, 0, 3000, 2000); c.fillStyle = '#7a3a1a'; c.beginPath(); c.arc(1500, 1000, 400, 0, 7); c.fill();
  const b = await new Promise((f) => cv.toBlob(f, 'image/jpeg', 0.9));
  let s = ''; const u = new Uint8Array(await b.arrayBuffer()); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
  return btoa(s);
}), 'base64');

try {
  await p.goto(URL_APP);
  const entendido = p.getByRole('button', { name: 'Entendido' });
  if (await entendido.isVisible({ timeout: 15000 }).catch(() => false)) await entendido.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  const csp = await p.locator('meta[http-equiv="Content-Security-Policy"]').count();
  comprobar(csp === 1, 'el build lleva la Content-Security-Policy (las miniaturas se prueban bajo ella)');
  await p.locator('#btn-chat').click();
  await p.waitForFunction(() => !document.querySelector('#chat').hidden);
  await abrirHoja();

  // ---- adjuntar fotos
  comprobar(await p.locator('#chat-foto').isVisible(), 'la caja del chat tiene el botón de adjuntar foto');
  const grande = await jpegGrande();
  const conGps = conExif(grande, PUNTO.lat, PUNTO.lon);
  comprobar(conGps.includes(Buffer.from('Exif')) && dimensiones(conGps).ancho === 3000, 'la foto de prueba mide 3000 px y lleva EXIF con GPS');
  const sin = readFileSync(join(AQUI, 'fixtures/pnoa-tesela.jpg'));
  await p.locator('#chat-foto-input').setInputFiles([{ name: 'seta.jpg', mimeType: 'image/jpeg', buffer: conGps }, { name: 'monte.jpg', mimeType: 'image/jpeg', buffer: sin }]);
  await p.waitForFunction(() => document.querySelectorAll('#chat-adjuntos .chat-miniatura').length === 2);
  comprobar(true, 'dos miniaturas con su botón de quitar');
  const cargadas = await p.$$eval('#chat-adjuntos img', (l) => l.map((i) => i.complete && i.naturalWidth > 0));
  comprobar(cargadas.every(Boolean) && (await p.evaluate(() => window.__violaciones)).length === 0, 'las miniaturas (blob:) se pintan bajo la CSP, sin violaciones');
  const chipGps = await p.locator('#chat-adjuntos .chip-ubicacion').textContent();
  comprobar(/Ubicación de la foto \(36\.6315, -4\.7924\)/.test(chipGps), `el GPS del EXIF se ofrece como «${chipGps.trim()}»`);
  await p.screenshot({ path: join(CAPTURAS, 'chat-fotos-1-adjuntas.png') });
  await p.locator('#chat-foto-input').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: sin }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: sin }]);
  await p.waitForTimeout(800);
  comprobar((await p.locator('#chat-adjuntos .chat-miniatura').count()) === 3 && (await p.locator('#aviso').textContent()).includes('Máximo 3'), 'máximo 3 fotos por mensaje (la cuarta se rechaza con aviso)');
  await p.locator('#chat-adjuntos .chat-miniatura .btn-x').nth(2).click();
  await p.locator('#chat-adjuntos .chat-miniatura .btn-x').nth(1).click();
  comprobar((await p.locator('#chat-adjuntos .chat-miniatura').count()) === 1, 'quitar una miniatura la saca del mensaje');
  // la que queda es la de GPS: se envía con el chip puesto
  await p.locator('#chat-texto').fill('¿Qué es esto?');
  await p.locator('#chat-enviar').click();
  await esperarRespuesta(2);
  const a = peticiones[0].messages[0].content;
  comprobar(JSON.stringify(a.map((b) => b.type)) === JSON.stringify(['text', 'text', 'image', 'text']), 'petición: contexto, ubicación, foto y texto (en ese orden)');
  comprobar(a[1].text.includes('GPS de la foto') && a[1].text.includes('Ubicación compartida: 36.63153, -4.79242'), 'si no se quita el chip, la ubicación de la foto viaja como «Ubicación compartida»');
  const img = a[2];
  const bytes = Buffer.from(img.source.data, 'base64');
  const dim = dimensiones(bytes);
  comprobar(img.source.type === 'base64' && img.source.media_type === 'image/jpeg' && !JSON.stringify(a).includes('"url"'), 'la foto viaja como base64 image/jpeg (nunca por URL)');
  comprobar(Math.max(dim.ancho, dim.alto) === 1280 && bytes.length < 1_200_000, `reducida a ${dim.ancho}×${dim.alto} px (${Math.round(bytes.length / 1024)} KB)`);
  comprobar(!bytes.includes(Buffer.from('Exif')) && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])), 'el JPEG enviado no lleva EXIF (se quitó tras leer el GPS)');
  const c1 = await chat();
  comprobar(c1.turnos[0].fotos === 1 && c1.turnos[0].ubicaciones.length === 1 && c1.turnos[0].ubicaciones[0].origen === 'foto', 'el turno guarda solo cuántas fotos y la ubicación');
  comprobar((await p.locator('#chat-adjuntos').isHidden()) && (await p.locator('.chat-usuario-fotos img').count()) === 1, 'tras enviar, los adjuntos se vacían y la burbuja enseña la miniatura');
  comprobar((await p.locator('.chat-asistente .chat-burbuja').first().textContent()).includes('una foto no basta') && (await p.locator('.chat-aviso').first().textContent()).includes(AVISO), 'la respuesta avisa de que una foto no basta y el pie de seguridad sigue');
  await p.screenshot({ path: join(CAPTURAS, 'chat-fotos-2-enviada.png') });
  // chip de la foto en la burbuja
  await p.locator('.chat-ver-mapa').first().click();
  await p.waitForFunction(() => window.__setas.chatMapa().length === 1);
  const m1 = await p.evaluate(() => window.__setas.chatMapa()[0]);
  comprobar(Math.abs(m1.lat - 36.631531) < 1e-4 && Math.abs(m1.lon + 4.792421) < 1e-4, '«📍 Ver en el mapa» de la foto marca ese punto');

  // ---- foto con la ubicación quitada: no viaja
  await alta();
  await p.locator('#chat-foto-input').setInputFiles([{ name: 'seta.jpg', mimeType: 'image/jpeg', buffer: conGps }]);
  await p.waitForSelector('#chat-adjuntos .chip-ubicacion');
  await p.locator('#chat-adjuntos .chip-ubicacion .btn-x').click();
  comprobar((await p.locator('#chat-adjuntos .chip-ubicacion').count()) === 0, 'el chip de la ubicación de la foto se puede quitar');
  await p.locator('#chat-texto').fill('otra pregunta');
  await p.locator('#chat-enviar').click();
  await esperarRespuesta(4);
  const b = peticiones.at(-1).messages;
  comprobar(!JSON.stringify(b.at(-1)).includes('ubicacion_compartida'), 'sin el chip, la ubicación de la foto no sale del teléfono');
  comprobar(!b[0].content.some((x) => x.type === 'image') && JSON.stringify(b[0].content).includes('[foto enviada antes]') && b.at(-1).content.some((x) => x.type === 'image'),
    'la foto de la consulta anterior vuelve como «[foto enviada antes]»; solo la nueva va completa');

  // ---- enlace corto de Google Maps (el ejemplo real)
  await alta();
  const antes = peticiones.length;
  await p.locator('#chat-texto').fill(TEXTO_ENLACE);
  await p.locator('#chat-enviar').click();
  await esperarRespuesta(6);
  comprobar(resueltos.length === 1 && resueltos[0].url === ENLACE, 'el enlace corto se resuelve con el Worker (POST /resolver-enlace)');
  const e = peticiones[antes].messages[0 + peticiones[antes].messages.length - 1].content;
  comprobar(e[1].text.includes('origen="enlace de Google Maps"') && e[1].text.includes('Ubicación compartida: 36.63153, -4.79242'), 'el mensaje lleva «Ubicación compartida: 36.63153, -4.79242» (36.6315, -4.7924)');
  const ronda2 = peticiones[antes + 1].messages.at(-1).content;
  const resPunto = JSON.parse(ronda2.find((x) => x.tool_use_id === 'toolu_pt').content);
  comprobar(!ronda2.find((x) => x.tool_use_id === 'toolu_pt').is_error && resPunto.especies.length > 0 && 'titularidad' in resPunto && 'acceso' in resPunto && resPunto.punto.lat === 36.63153,
    `estado_en_punto responde con ${resPunto.especies.length} especies, titularidad y acceso`);
  const resGuardar = JSON.parse(ronda2.find((x) => x.tool_use_id === 'toolu_gu').content);
  comprobar(resGuardar.guardado === false && resGuardar.propuesta_mostrada === true, 'proponer_guardar_ubicacion no guarda: solo propone');
  await p.locator('.chat-accion[data-tipo=propuesta]').waitFor({ state: 'visible' });
  comprobar((await p.locator('.chat-accion[data-tipo=propuesta]').textContent()).includes('Con gusanos'), 'la propuesta enseña la nota («Con gusanos») y pide confirmación');
  await p.locator('.pestanas [data-p=p-sitios]').click();
  comprobar((await p.locator('#lista-sitios .sitio').count()) === 0, 'sin pulsar «Guardar» no hay nada en Mis sitios');
  await p.locator('.pestanas [data-p=p-mapa]').click();
  await p.screenshot({ path: join(CAPTURAS, 'chat-fotos-3-enlace.png') });
  const verMapa = p.locator('.chat-ver-mapa', { hasText: 'Ver en el mapa' }).last();
  comprobar(await verMapa.isVisible(), 'el mensaje del enlace lleva el chip «📍 Ver en el mapa»');
  await verMapa.click();
  await p.waitForFunction(() => { const m = window.__setas.chatMapa(); return m.length === 1 && Math.abs(m[0].lat - 36.631531) < 1e-6; });
  await p.waitForTimeout(400);
  const centro = await p.evaluate(() => { const c = window.__setas.mapa.getCenter(); return { lat: c.lat, lon: c.lng, zoom: window.__setas.mapa.getZoom() }; });
  comprobar(Math.abs(centro.lat - 36.6315) < 0.02 && Math.abs(centro.lon + 4.7924) < 0.02 && centro.zoom >= 14, `el chip centra el mapa en 36.6315, -4.7924 (zoom ${centro.zoom.toFixed(1)})`);
  await p.screenshot({ path: join(CAPTURAS, 'chat-fotos-4-mapa.png') });
  await alta();
  await p.locator('.chat-accion[data-tipo=propuesta] .ca-guardar').click();
  await p.locator('.chat-accion[data-tipo=guardado] .ca-deshacer').waitFor({ state: 'visible' });
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForSelector('#lista-sitios .sitio');
  const guardados = await p.$$eval('#lista-sitios .sitio', (l) => l.map((x) => x.textContent));
  comprobar(guardados.length === 1 && guardados[0].includes('Con gusanos'), 'al pulsar «Guardar en Mis sitios» aparece en Mis sitios con la nota');
  await p.locator('.pestanas [data-p=p-mapa]').click();

  // ---- el historial guardado no lleva imágenes
  await p.waitForTimeout(300);
  const guardadoIdb = await p.evaluate(() => new Promise((ok, mal) => {
    const rq = indexedDB.open('setas-chat');
    rq.onsuccess = () => { const g = rq.result.transaction('conversacion').objectStore('conversacion').get('ultima'); g.onsuccess = () => ok(JSON.stringify(g.result)); g.onerror = () => mal(g.error); };
    rq.onerror = () => mal(rq.error);
  }));
  comprobar(!guardadoIdb.includes('/9j/') && !guardadoIdb.includes('"image"') && guardadoIdb.includes('[foto enviada antes]'), 'IndexedDB no guarda el base64 de las fotos: solo la marca');
  await p.reload();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('#btn-chat').click();
  await p.waitForFunction(() => window.__setas.chat().turnos.length === 6);
  comprobar((await p.locator('.chat-usuario-fotos .nota').first().textContent()).includes('1 foto') && (await p.locator('.chat-ver-mapa').count()) >= 2, 'tras recargar quedan la marca «📷 1 foto» y los chips «Ver en el mapa»');

  // ---- enlace corto que no se resuelve: se envía igual, como texto
  await alta();
  await p.locator('#chat-nueva').click();
  resolverFalla = true;
  const n0 = peticiones.length;
  GUIONES['https://maps.app.goo.gl/rota hola'] = SOLO_TEXTO('Vale, sin ubicación.');
  await p.locator('#chat-texto').fill('https://maps.app.goo.gl/rota hola');
  await p.locator('#chat-enviar').click();
  await esperarRespuesta(2);
  comprobar(peticiones.length === n0 + 1 && !JSON.stringify(peticiones.at(-1)).includes('ubicacion_compartida'), 'si el Worker no resuelve el enlace, el mensaje sale sin ubicación (sin inventarla)');

  comprobar((await p.evaluate(() => window.__violaciones)).length === 0, 'ninguna violación de la CSP durante todo el recorrido');
  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('\nTodo OK: chat con fotos y enlaces de Google Maps.');
} catch (err) {
  await p.screenshot({ path: join(CAPTURAS, 'chat-fotos-error.png') }).catch(() => {});
  throw err;
} finally {
  await nav.close();
}
