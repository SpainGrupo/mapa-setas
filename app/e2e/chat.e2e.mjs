// e2e del chat «Pregunta a Claude» (2026-10-25). Playwright, viewport de iPhone Pro Max (430×932), worker /chat
// interceptado con respuestas de Claude grabadas (el contenido de cada `tool_use` es el que mandaría Claude; el resultado
// de la herramienta lo calcula la app de verdad con sitios.json, el semáforo y Mis sitios).
//  - desde Hoy: botón «Pregunta a Claude» → hoja sobre el mapa; el contexto lleva la pestaña, el top visible y la posición
//    redondeada a 0,01°; «Pensando…» mientras espera
//  - pregunta → tool_use buscar_sitios → la app ejecuta y reenvía (assistant TAL CUAL + un tool_result) → respuesta final
//    → tarjetas (solo de la herramienta) → «Ver» encuadra el mapa sobre la hoja → «Guardar» → aparece en Mis sitios →
//    «Deshacer» lo quita → pie de seguridad fijo bajo cada respuesta
//  - varios tool_use en un mensaje → un solo mensaje de resultados (id desconocido = is_error, sin efecto)
//  - texto del modelo con una coordenada inventada → ninguna tarjeta; 429 tope_gasto → su mensaje; sin conexión el botón
//    atenuado y no se envía nada; la última conversación sobrevive a recargar y «Conversación nueva» la borra
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
const PROHIBIDO = /comestib|se puede comer/i;
const POS = { latitude: 36.51234, longitude: -4.88876 };       // se redondea a 36.51 / -4.89 hacia Claude
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['iPhone 14 Pro Max'], viewport: { width: 430, height: 932 }, geolocation: POS, permissions: ['geolocation'],
  locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.addInitScript((u) => { try { localStorage.setItem('setas:e2e-worker-url', u); } catch { /* sin almacenamiento */ } }, URL_WORKER);

// Open-Meteo falso (como offline.e2e.mjs): past_days (60) días pasados + 16 de previsión alrededor de «hoy».
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let puntosMeteo = null;
await ctx.route('**/api.open-meteo.com/**', async (r) => {
  puntosMeteo ??= await (await fetch(new URL('data/marbella/meteo_puntos.json', BASE))).json();
  const u = new URL(r.request().url());
  const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
  const pas = Number(u.searchParams.get('past_days') ?? 30);   // los días pasados que pide la app (DIAS_PASADOS)
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

// ---------------------------------------------------------------- el Worker de /chat simulado
const sitiosJson = await (await fetch(new URL('data/marbella/sitios.json', BASE))).json();
const REAL = `boletus_aereus:${sitiosJson.especies.boletus_aereus[0].id}`;     // un id que existe de verdad
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-expose-headers': 'X-Restantes-Hoy' };
const THINKING = { type: 'thinking', thinking: 'Voy a mirar los sitios del día.', signature: 'firma-e2e-1' };
const peticiones = [];                // cuerpos recibidos, en orden
let restantes = 30;
let retardoMs = 0;
const preguntaDe = (msgs) => {
  const u = [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && !m.content.some((b) => b.type === 'tool_result'));
  return u ? u.content[1].text : '';
};
const GRABADAS = {
  '¿Adónde voy hoy?': [
    { content: [THINKING, { type: 'tool_use', id: 'toolu_e2e_1', name: 'buscar_sitios',
      input: { especie: 'boletus_aereus', grupo: null, dia: 0, radio_km: null, solo_publicos: null, max_dificultad: null, orden: null, n: 3 } }], stop_reason: 'tool_use', texto: '' },
    { content: [{ type: 'text', text: 'Te propongo estos tres sitios de boleto negro para hoy; el primero es el de mejor puntuación.' }], stop_reason: 'end_turn',
      texto: 'Te propongo estos tres sitios de boleto negro para hoy; el primero es el de mejor puntuación.' },
  ],
  'Todo a la vez': [
    { content: [{ type: 'tool_use', id: 'toolu_p1', name: 'mostrar_en_mapa', input: { sitio_ids: [REAL] } },
      { type: 'tool_use', id: 'toolu_p2', name: 'ruta_a', input: { sitio_id: REAL } },
      { type: 'tool_use', id: 'toolu_p3', name: 'semaforo', input: { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:99999999', dia: 0 } }], stop_reason: 'tool_use', texto: '' },
    { content: [{ type: 'text', text: 'Te lo he marcado en el mapa. El semáforo de ese id no existe, así que no te lo puedo decir.' }], stop_reason: 'end_turn',
      texto: 'Te lo he marcado en el mapa. El semáforo de ese id no existe, así que no te lo puedo decir.' },
  ],
  'Dime un sitio nuevo': [
    { content: [{ type: 'text', text: 'Prueba en 36.9999, -4.1234, junto al arroyo.' }], stop_reason: 'end_turn', texto: 'Prueba en 36.9999, -4.1234, junto al arroyo.' },
  ],
  'Resume mi última ruta': [
    { content: [{ type: 'tool_use', id: 'toolu_n1', name: 'notas_de_ruta', input: { ruta: null, n: null } }], stop_reason: 'tool_use', texto: '' },
    { content: [{ type: 'text', text: 'No tienes ninguna ruta grabada todavía.' }], stop_reason: 'end_turn', texto: 'No tienes ninguna ruta grabada todavía.' },
  ],
};
await ctx.route('https://setas-worker.e2e.invalid/**', async (r) => {
  const req = r.request();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST, OPTIONS' } });
  const body = JSON.parse(req.postData() ?? '{}');
  peticiones.push(body);
  const msgs = body.messages;
  const q = preguntaDe(msgs);
  if (retardoMs) await new Promise((f) => setTimeout(f, retardoMs));
  if (q === 'Pregunta cara') return r.fulfill({ status: 429, headers: CORS, contentType: 'application/json',
    body: JSON.stringify({ error: { codigo: 'tope_gasto', mensaje: 'Hoy se ha agotado el presupuesto del chat. Vuelve mañana.' } }) });
  const guion = GRABADAS[q];
  if (!guion) return r.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { codigo: 'solicitud_invalida', mensaje: `sin guion para «${q}»` } }) });
  // Paso del guion = asistentes que hay desde la pregunta del usuario hasta ahora.
  const desde = msgs.findLastIndex((m) => m.role === 'user' && Array.isArray(m.content) && !m.content.some((b) => b.type === 'tool_result'));
  const i = msgs.slice(desde).filter((m) => m.role === 'assistant').length;
  const headers = { ...CORS, ...(i === 0 ? { 'X-Restantes-Hoy': String(--restantes) } : {}) };
  await r.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ aviso: AVISO, ...guion[i] }) });
});

const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
const chat = () => p.evaluate(() => window.__setas.chat());
const ultimaTarjeta = async () => { const c = await chat(); return c.turnos.filter((t) => t.rol === 'asistente').at(-1); };
const preguntar = async (texto) => {
  if ((await p.locator('#chat').getAttribute('data-reten')) !== '2') await abrirHoja();   // a media altura la caja queda tapada: se toca la cabecera
  await p.locator('#chat-texto').fill(texto);
  await p.locator('#chat-enviar').click();
};
const esperarRespuesta = (n) => p.waitForFunction((n) => { const c = window.__setas.chat(); return !c.ocupado && (c.turnos.length === n || c.error); }, n, { timeout: 20000 });
const abrirHoja = async () => {   // lleva la hoja al retén alto (tocar la cabecera, como haría el usuario)
  await p.locator('#chat .ta-cab').click();
  await p.waitForFunction(() => document.querySelector('#chat').dataset.reten === '2');
  await p.waitForTimeout(700);
};
const reposo = async () => { // espera a que la hoja deje de moverse
  let antes = -1;
  for (let i = 0; i < 30; i++) { const t = await p.evaluate(() => Math.round(document.querySelector('#chat').getBoundingClientRect().top)); if (t === antes) return; antes = t; await p.waitForTimeout(120); }
};

try {
  await p.goto(URL_APP);
  const entendido = p.getByRole('button', { name: 'Entendido' });
  if (await entendido.isVisible({ timeout: 15000 }).catch(() => false)) await entendido.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });

  // ---- botones de entrada
  comprobar(await p.locator('#btn-chat').isVisible() && (await p.locator('#btn-chat').getAttribute('aria-disabled')) === 'false', 'en el Mapa hay un botón «Pregunta» activo');
  await p.locator('#btn-centrar').click();   // arranca el GPS (sin él, el chat avisa «sin GPS»)
  await p.waitForTimeout(2000);
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForSelector('#top-especie .top-fila', { timeout: 30000 });
  comprobar(await p.locator('#hoy-pregunta').isVisible() && (await p.locator('#hoy-pregunta').textContent()).trim() === 'Pregunta a Claude', 'en Hoy hay un botón «Pregunta a Claude»');

  // ---- abrir desde Hoy → hoja sobre el mapa
  await p.locator('#hoy-pregunta').click();
  await p.waitForFunction(() => !document.querySelector('#chat').hidden && document.querySelector('#p-mapa').classList.contains('activa'));
  await reposo();
  comprobar(await p.locator('#chat-sugerencias button').allTextContents().then((l) => JSON.stringify(l) === JSON.stringify(['¿Adónde voy hoy?', 'Algo nuevo cerca', '¿Qué tal mañana?', 'Resume mi última ruta'])),
    'sugerencias rápidas: ¿Adónde voy hoy? · Algo nuevo cerca · ¿Qué tal mañana? · Resume mi última ruta');
  await p.screenshot({ path: join(CAPTURAS, 'chat-1-vacio.png') });

  // ---- pregunta → tool_use → ejecuta → reenvía → respuesta final
  retardoMs = 700;
  await p.locator('#chat-sugerencias button', { hasText: '¿Adónde voy hoy?' }).click();
  await p.locator('.chat-pensando').waitFor({ state: 'visible', timeout: 5000 });
  comprobar((await p.locator('.chat-pensando').textContent()).includes('Pensando'), '«Pensando…» mientras espera a Claude');
  await p.screenshot({ path: join(CAPTURAS, 'chat-2-pensando.png') });
  retardoMs = 0;
  await esperarRespuesta(2);
  comprobar(peticiones.length === 2, 'dos peticiones al Worker: la pregunta y el reenvío con el resultado de la herramienta');
  const [p1, p2] = peticiones;
  const ctxApp = JSON.parse(p1.messages[0].content[0].text.replace(/<\/?contexto_app>/g, ''));
  comprobar(p1.messages.length === 1 && p1.messages[0].role === 'user' && p1.messages[0].content[0].text.startsWith('<contexto_app>') && p1.messages[0].content[1].text === '¿Adónde voy hoy?',
    'el contexto va como bloque <contexto_app> delante del texto del usuario');
  comprobar(ctxApp.posicion.lat === 36.51 && ctxApp.posicion.lon === -4.89 && !JSON.stringify(p1).includes('36.512') && !JSON.stringify(p1).includes('4.888'),
    'la posición va redondeada a 0,01° (36.51, -4.89); la exacta no sale del teléfono');
  comprobar(ctxApp.pestana === 'hoy' && ctxApp.region === 'marbella' && ctxApp.fecha === HOY_E2E && ctxApp.en_linea === true && Array.isArray(ctxApp.top_visible) && ctxApp.top_visible.length > 0
    && /^[a-z_]+:\d+$/.test(ctxApp.top_visible[0].id), `contexto: pestaña hoy, región, fecha y ${ctxApp.top_visible.length} sitios del top visible con id especie:id`);
  comprobar(p2.messages.length === 3 && JSON.stringify(p2.messages[1].content) === JSON.stringify(GRABADAS['¿Adónde voy hoy?'][0].content),
    'el content del asistente (con su thinking) vuelve TAL CUAL en el reenvío');
  const resultados = p2.messages[2].content;
  comprobar(p2.messages[2].role === 'user' && resultados.length === 1 && resultados[0].type === 'tool_result' && resultados[0].tool_use_id === 'toolu_e2e_1' && !resultados[0].is_error,
    'un mensaje user con el tool_result de buscar_sitios');
  const datosHerr = JSON.parse(resultados[0].content);
  comprobar(datosHerr.resultados.length === 3 && datosHerr.resultados.every((r) => /^boletus_aereus:\d+$/.test(r.id) && typeof r.puntuacion === 'number' && r.razon), 'buscar_sitios devolvió 3 sitios reales con puntuación y razón');
  comprobar(datosHerr.aviso_posicion === undefined, 'con GPS no hay aviso de posición');

  const turno = await ultimaTarjeta();
  comprobar(turno.texto.startsWith('Te propongo') && turno.tarjetas.length === 3 && JSON.stringify(turno.tarjetas.map((t) => t.id)) === JSON.stringify(datosHerr.resultados.map((r) => r.id)),
    'las tarjetas son exactamente los sitios que devolvió la herramienta');
  comprobar(await p.locator('.chat-tarjeta').count() === 3, '3 tarjetas visibles');
  const t0 = p.locator('.chat-tarjeta').first();
  const textoT0 = await t0.textContent();
  comprobar(/\/100/.test(textoT0) && /a pie/.test(textoT0)
    && (await t0.locator('.chip-estado').count()) === 1 && (await t0.locator('.chip-titularidad').count()) === 1, 'la tarjeta enseña puntuación, semáforo, a pie y titularidad');
  comprobar(await t0.locator('.ct-ver').isVisible() && await t0.locator('.ct-ir').isVisible() && await t0.locator('.ct-guardar').isVisible(), 'la tarjeta tiene «Ver», «Ir» y «Guardar»');
  const pie = p.locator('.chat-asistente .chat-aviso').last();
  comprobar((await pie.textContent()).trim() === AVISO && await pie.isVisible(), 'pie de seguridad fijo bajo la respuesta (lo pone la app)');
  comprobar((await p.locator('#chat-cupo').textContent()).includes('quedan 29 hoy'), 'contador «quedan 29 hoy»');
  const botonesAlto = await p.$$eval('.chat-tarjeta .btn, #chat-enviar, #chat-nueva', (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
  comprobar(botonesAlto.every((h) => h >= 48), `botones táctiles de ≥ 48 px (mín. ${Math.min(...botonesAlto)})`);
  await p.screenshot({ path: join(CAPTURAS, 'chat-3-respuesta.png') });
  await t0.scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'chat-3b-tarjetas.png') });

  // ---- «Ir» abre Google Maps (mismo enlace que Mis sitios)
  await p.evaluate(() => { window.__abiertos = []; window.open = (u) => { window.__abiertos.push(u); return null; }; });
  await t0.locator('.ct-ir').click();
  const abierto = (await p.evaluate(() => window.__abiertos))[0];
  comprobar(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d{5},-?\d+\.\d{5}&travelmode=driving$/.test(abierto), `«Ir» abre Google Maps en coche (${abierto})`);

  // ---- «Ver» encuadra el mapa sobre la hoja
  await t0.locator('.ct-ver').click();
  await p.waitForFunction(() => document.querySelector('#chat').dataset.reten === '1');
  await reposo();
  const sitio0 = turno.tarjetas[0];
  const enMapa = await p.evaluate(({ lat, lon }) => {
    const m = window.__setas.mapa, pt = m.project([lon, lat]), hoja = document.querySelector('#chat').getBoundingClientRect(), mp = document.querySelector('#mapa').getBoundingClientRect();
    return { x: pt.x, y: pt.y, ancho: mp.width, techoHoja: hoja.top, zoom: m.getZoom(), marcados: window.__setas.chatMapa() };
  }, sitio0);
  comprobar(enMapa.y > 100 && enMapa.y < enMapa.techoHoja - 20 && enMapa.x > 20 && enMapa.x < enMapa.ancho - 20 && enMapa.zoom >= 14.5,
    `«Ver» encuadra el sitio en la parte libre del mapa (y=${Math.round(enMapa.y)} < hoja ${Math.round(enMapa.techoHoja)}, zoom ${enMapa.zoom.toFixed(1)})`);
  comprobar(enMapa.marcados.length === 1 && enMapa.marcados[0].lat === sitio0.lat, 'el sitio queda marcado en la capa del chat');
  await p.screenshot({ path: join(CAPTURAS, 'chat-4-ver-mapa.png') });

  // ---- «Guardar» → Mis sitios → «Deshacer»
  await abrirHoja();
  await t0.locator('.ct-guardar').click();
  await p.locator('.chat-accion .ca-deshacer').waitFor({ state: 'visible' });
  comprobar((await p.locator('.chat-accion').first().textContent()).includes('Guardado en Mis sitios'), '«Guardar» enseña «Guardado en Mis sitios» con «Deshacer»');
  await p.screenshot({ path: join(CAPTURAS, 'chat-5-guardado.png') });
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForSelector('#lista-sitios .sitio');
  const guardados = await p.$$eval('#lista-sitios .sitio', (l) => l.map((x) => x.textContent));
  comprobar(guardados.length === 1 && /Boleto|Boletus|boleto/i.test(guardados[0]), `el sitio aparece en Mis sitios (${guardados.length})`);
  await p.locator('.pestanas [data-p=p-mapa]').click();
  await p.locator('.chat-accion .ca-deshacer').click();
  await p.waitForFunction(() => /deshecho/.test(document.querySelector('.chat-accion')?.textContent ?? ''));
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForSelector('#lista-sitios .vacio');
  comprobar(await p.locator('#lista-sitios .sitio').count() === 0, '«Deshacer» quita el sitio de Mis sitios');
  await p.locator('.pestanas [data-p=p-mapa]').click();
  // ... y otra vez «Guardar» tras deshacer funciona
  await t0.locator('.ct-guardar').click();
  await p.waitForFunction(() => document.querySelectorAll('.chat-accion .ca-deshacer').length === 1);
  comprobar(true, 'se puede volver a guardar tras deshacer');
  await p.locator('.chat-accion .ca-deshacer').click();
  await p.waitForFunction(() => document.querySelectorAll('.chat-accion .ca-deshacer').length === 0);

  // ---- varios tool_use en el mismo mensaje → un solo mensaje de resultados
  const antes = peticiones.length;
  await preguntar('Todo a la vez');
  await esperarRespuesta(4);
  comprobar(peticiones.length === antes + 2, 'el tool_use múltiple cuesta dos peticiones');
  const rm = peticiones.at(-1).messages.at(-1);
  comprobar(rm.role === 'user' && rm.content.length === 3 && rm.content.every((b) => b.type === 'tool_result') && JSON.stringify(rm.content.map((b) => b.tool_use_id)) === JSON.stringify(['toolu_p1', 'toolu_p2', 'toolu_p3']),
    'los 3 tool_result van en UN solo mensaje user, en el orden de los tool_use');
  comprobar(!rm.content[0].is_error && !rm.content[1].is_error && rm.content[2].is_error === true && /desconocido/.test(rm.content[2].content), 'el id desconocido da is_error y los otros dos salen bien');
  const rutaJson = JSON.parse(rm.content[1].content);
  comprobar(rutaJson.sitio_id === REAL && (rutaJson.aparcar_en || rutaJson.sin_acceso_calculado), `ruta_a responde con ${rutaJson.aparcar_en ? 'aparcamiento ' + rutaJson.aparcar_en : 'el motivo de no tener acceso'}`);
  const t2 = await ultimaTarjeta();
  comprobar(t2.tarjetas.length === 1 && t2.tarjetas[0].id === REAL, 'solo la tarjeta de ruta_a (mostrar_en_mapa y el error no crean tarjetas)');
  comprobar((await p.evaluate(() => window.__setas.chatMapa())).length === 1, 'mostrar_en_mapa marcó el sitio');

  // ---- una coordenada inventada en el texto no genera tarjeta
  const nT = await p.locator('.chat-tarjeta').count();
  const nM = (await p.evaluate(() => window.__setas.chatMapa())).length;
  await preguntar('Dime un sitio nuevo');
  await esperarRespuesta(6);
  const t3 = await ultimaTarjeta();
  comprobar(t3.texto.includes('36.9999') && t3.tarjetas.length === 0 && await p.locator('.chat-tarjeta').count() === nT, 'el texto del modelo con una coordenada inventada no genera tarjeta');
  comprobar((await p.evaluate(() => window.__setas.chatMapa())).length === nM && await p.locator('.chat-asistente').last().locator('.ct-ir, .ct-ver, .ct-guardar').count() === 0, 'ni botones ni marca en el mapa');
  comprobar((await p.locator('.chat-asistente').last().locator('.chat-aviso').textContent()).trim() === AVISO, 'el pie de seguridad sale bajo cada respuesta');

  // ---- sin rutas: notas_de_ruta lo dice
  await preguntar('Resume mi última ruta');
  await esperarRespuesta(8);
  const nr = JSON.parse(peticiones.at(-1).messages.at(-1).content[0].content);
  comprobar(nr.ruta === null && nr.aviso === 'No hay rutas grabadas.' && Array.isArray(nr.mis_sitios), 'notas_de_ruta sin rutas: «No hay rutas grabadas.»');

  // ---- 429 tope_gasto
  const nTurnos = (await chat()).turnos.length;
  await preguntar('Pregunta cara');
  await p.locator('.chat-error').waitFor({ state: 'visible', timeout: 10000 });
  comprobar((await p.locator('.chat-error').textContent()) === 'Hoy se ha agotado el presupuesto del chat. Vuelve mañana.', '429 tope_gasto enseña su mensaje en español');
  comprobar((await chat()).turnos.length === nTurnos && await p.locator('#chat-texto').inputValue() === 'Pregunta cara', 'la conversación no cambia y la pregunta vuelve a la caja para reintentar');
  await p.screenshot({ path: join(CAPTURAS, 'chat-6-error.png') });
  await p.locator('#chat-texto').fill('');

  // ---- nada habla de comestibilidad
  const textoChat = await p.locator('#chat').textContent();
  comprobar(!PROHIBIDO.test(textoChat), 'nada en el chat dice «comestible»');

  // ---- la última conversación sobrevive a recargar; «Conversación nueva» la borra
  const turnosAntes = (await chat()).turnos.length;
  await p.reload();
  if (await entendido.isVisible({ timeout: 5000 }).catch(() => false)) await entendido.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('#btn-chat').click();
  await p.waitForFunction((n) => window.__setas.chat().turnos.length === n, turnosAntes);
  comprobar(await p.locator('.chat-asistente').count() >= 4, `tras recargar, la última conversación (${turnosAntes} mensajes) sigue en el chat`);
  await reposo();
  await p.screenshot({ path: join(CAPTURAS, 'chat-7-recargado.png') });
  comprobar(await p.locator('#chat-sugerencias').isHidden(), 'con conversación no se enseñan las sugerencias');
  await p.locator('#chat-nueva').click();
  await p.waitForFunction(() => window.__setas.chat().turnos.length === 0);
  await p.locator('#chat-sugerencias').waitFor({ state: 'visible', timeout: 5000 });
  comprobar((await p.evaluate(() => window.__setas.chatMapa())).length === 0 && await p.locator('#chat-sugerencias').isVisible(), '«Conversación nueva» vacía el chat y quita las marcas del mapa');
  await p.reload();
  if (await entendido.isVisible({ timeout: 5000 }).catch(() => false)) await entendido.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('#btn-chat').click();
  await p.waitForTimeout(400);
  comprobar((await chat()).turnos.length === 0, 'y tras recargar sigue vacío');

  // ---- sin conexión: botón atenuado, no se envía
  const enviadas = peticiones.length;
  await ctx.setOffline(true);
  await p.waitForFunction(() => document.querySelector('#btn-chat').getAttribute('aria-disabled') === 'true');
  const opacidad = await p.$eval('#btn-chat', (b) => Number(getComputedStyle(b).opacity));
  comprobar(opacidad < 1 && (await p.locator('#btn-chat').getAttribute('title')).includes('Necesita conexión') && (await p.locator('#btn-chat').getAttribute('aria-label')).includes('Necesita conexión'),
    `sin conexión, el botón «Pregunta» queda atenuado (opacidad ${opacidad}) con «Necesita conexión»`);
  comprobar((await p.locator('#hoy-pregunta').textContent()).includes('Necesita conexión') && (await p.locator('#hoy-pregunta').getAttribute('aria-disabled')) === 'true', 'lo mismo en el botón de Hoy');
  comprobar((await p.locator('#chat-estado').textContent()) === 'Necesita conexión.', 'con la hoja abierta, la caja avisa «Necesita conexión.»');
  await p.locator('#chat-texto').fill('¿Qué tal mañana?');
  await p.locator('#chat-texto').press('Enter');   // el botón «Enviar» está atenuado (aria-disabled)
  await p.waitForTimeout(300);
  comprobar(peticiones.length === enviadas && (await chat()).turnos.length === 0, 'sin conexión no se envía nada');
  await p.screenshot({ path: join(CAPTURAS, 'chat-8-sin-conexion.png') });
  await p.locator('#chat-cerrar').click();
  await p.locator('#btn-chat').click({ force: true });   // aria-disabled: Playwright lo da por inactivo, el dedo no
  comprobar((await p.locator('#aviso').textContent()).includes('Necesita conexión') && await p.locator('#chat').isHidden(), 'tocar el botón atenuado explica el motivo y no abre el chat');
  await ctx.setOffline(false);
  await p.waitForFunction(() => document.querySelector('#btn-chat').getAttribute('aria-disabled') === 'false');
  comprobar(true, 'con conexión, el botón vuelve a estar activo');

  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('\nTodo OK: chat «Pregunta a Claude».');
} catch (e) {
  await p.screenshot({ path: join(CAPTURAS, 'chat-error.png') }).catch(() => {});
  throw e;
} finally {
  await nav.close();
}
