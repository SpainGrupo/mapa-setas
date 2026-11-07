// e2e «Explorar aquí» (2026-10-25): cámara falsa (--use-fake-device-for-media-stream), brújula e inclinación inyectadas
// con eventos deviceorientation y GPS simulado. Barrido de 8 fotos con disparo automático, observación guardada en
// IndexedDB (8 direcciones, JPEG ≤ 400 KB, sin EXIF, con lo que decía el modelo), nota en la ruta que se graba, pregunta de
// hallazgo, «Guardar como sitio», respaldo sin cámara en vivo (una foto por dirección con el selector de archivos) y
// pausa por inactividad, y el análisis con un Worker simulado (aviso de privacidad la primera vez, petición con coordenadas a
// 2 decimales, mejor dirección, marca grande en la cámara, pendiente sin conexión y error 429). Datos reales de Marbella
// (como campo-micro.e2e.mjs).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const Q = '?e2e=1&hoy=2026-10-14';
const CAPTURAS = process.env.CAPTURAS_EXPLORAR ?? mkdtempSync(join(tmpdir(), 'explorar-e2e-'));
const FOTO = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pnoa-tesela.jpg'));
const PROHIBIDO = /comestib|se puede comer/i;
const ESPECIE = 'boletus_aereus';
const YO = { lat: 36.589, lon: -5.244, alt: 300, acc: 5 };     // alcornocal de Los Alcornocales (región Marbella)
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

/** GPS falso y brújula/inclinación: `window.__H` (rumbo) y `window.__beta` se emiten cada 30 ms como lo haría iOS. */
function sensoresFalsos(inicial) {
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
  window.__H = null; window.__beta = 90; window.__acc = 5;
  setInterval(() => {
    if (window.__H === null) return;
    const e = new Event('deviceorientation');
    Object.assign(e, { webkitCompassHeading: window.__H, webkitCompassAccuracy: window.__acc, beta: window.__beta, gamma: 0 });
    window.dispatchEvent(e);
  }, 30);
}
/** URL del Worker simulado: la app la lee de localStorage en ?e2e=1 (urlWorker). */
const conWorker = () => { try { localStorage.setItem('setas:e2e-worker-url', 'https://worker.test/identificar'); } catch { /* sin almacenamiento */ } };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
/** Respuesta fija: la 3.ª foto es un alcornocal abierto y húmedo; el resto, pinar cerrado y seco; una nota dice «comestible». */
const respuestaFalsa = (cuerpo) => ({ aviso: 'x', direcciones: cuerpo.fotos.map((f, i) => (i === 2
  ? { rumbo: f.rumbo, arbol_dominante: 'alcornoque', confianza_arbol: 'alta', densidad_copas: 'media', sotobosque: 'despejado', suelo_visible: ['hojarasca', 'musgo'], humedad_aparente: 'humeda', notas: 'Alcornocal abierto, hojarasca húmeda.' }
  : { rumbo: f.rumbo, arbol_dominante: i === 5 ? 'no_se_ve' : 'pino', confianza_arbol: i === 5 ? 'baja' : 'media', densidad_copas: 'cerrada', sotobosque: 'matorral_denso', suelo_visible: ['roca'], humedad_aparente: 'seca', notas: i === 0 ? 'Bosque comestible y denso.' : '' })) });
const sinCamara = () => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => Promise.reject(new DOMException('denegado', 'NotAllowedError')), configurable: true }); };

const nav = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const errores = [];

async function pagina(extra = []) {
  const ctx = await nav.newContext({ ...devices['Pixel 7'], locale: 'es-ES', timezoneId: 'Europe/Madrid', permissions: ['camera'] });
  await ctx.addInitScript(sensoresFalsos, YO);
  for (const f of extra) await ctx.addInitScript(f);
  await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));
  await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(String(e)));
  p.on('console', (m) => { if (/cámara:/.test(m.text())) console.log('  [consola]', m.text()); });
  p.dialogos = [];
  p.on('dialog', (d) => { p.dialogos.push(d.message()); d.accept(); });
  // Worker simulado: modo 'ok' | '429' | 'caido' (sin conexión).
  const w = { modo: 'ok', peticiones: [] };
  p.w = w;
  await ctx.route('https://worker.test/**', async (r) => {
    const req = r.request();
    if (w.modo === 'caido') return r.abort('internetdisconnected');
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const cuerpo = JSON.parse(req.postData() ?? '{}');
    w.peticiones.push(cuerpo);
    const json = { ...CORS, 'content-type': 'application/json' };
    if (w.modo === '429') return r.fulfill({ status: 429, headers: json, body: JSON.stringify({ error: { codigo: 'limite_diario_superado', mensaje: 'Has alcanzado el límite de 10 barridos por día.' } }) });
    return r.fulfill({ status: 200, headers: json, body: JSON.stringify(respuestaFalsa(cuerpo)) });
  });
  await p.goto(BASE + Q);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 8000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.evaluate((id) => { const s = document.querySelector('#sel-especie'); s.value = id; s.dispatchEvent(new Event('change')); }, ESPECIE);
  return p;
}
async function abrirExplorar(p) {
  await p.locator('#btn-centrar').click();
  await p.waitForSelector('#btn-campo:not([hidden])', { timeout: 15000 });
  await p.locator('#btn-campo').click();
  await p.waitForSelector('#dlg-campo[open]');
  await p.waitForFunction(() => { const c = window.__setas.campo(); return c && c.datos && c.datos !== 'cargando' && c.aqui; }, null, { timeout: 30000 });
  await p.locator('#cp-explorar').click();
  await p.waitForSelector('#dlg-explorar[open]');
  await p.waitForFunction(() => window.__setas.explorar()?.camara, null, { timeout: 15000 });
}
const explorar = (p) => p.evaluate(() => window.__setas.explorar());
const observaciones = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('setas-observaciones');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('observaciones')) { res([]); return; }
    const g = db.transaction('observaciones').objectStore('observaciones').getAll();
    g.onsuccess = async () => {
      const out = [];
      for (const o of g.result) {
        const dirs = [];
        for (const d of o.direcciones) {
          let ancho = null, alto = null, exif = null;
          if (d.foto) {
            const b = new Uint8Array(await d.foto.arrayBuffer());
            const bm = await createImageBitmap(d.foto); ancho = bm.width; alto = bm.height; bm.close();
            exif = new TextDecoder('latin1').decode(b.slice(0, 4096)).includes('Exif');
          }
          dirs.push({ rumbo: d.rumbo, precBrujula: d.precBrujula, tipo: d.foto?.type ?? null, bytes: d.foto?.size ?? null, ancho, alto, exif, analisis: d.analisis });
        }
        out.push({ ...o, direcciones: dirs });
      }
      res(out);
    };
  };
}));
const delta = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

try {
  // ------------------------------------------------------------ 1. barrido automático de 8 fotos
  const p = await pagina([conWorker]);
  // Se graba una ruta para comprobar que la observación queda como nota suya.
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.locator('#btn-grabar-ruta').click();
  await p.waitForFunction(() => window.__setas.grabacion());
  await p.locator('.pestanas [data-p=p-mapa]').click().catch(() => {});
  await abrirExplorar(p);
  let e = await explorar(p);
  comprobar(e.camara === 'vivo', `cámara en vivo (${e.camara}) con la cámara falsa de Chromium`);
  comprobar(await p.locator('#ex-anillo li').count() === 8, 'el anillo del barrido tiene 8 marcas');
  await p.waitForFunction(() => !document.querySelector('#ex-barrer').disabled, null, { timeout: 10000 });
  ok('«Barrer 360°» se habilita cuando llega el GPS');
  // ---- AR ligera: marcas de las microzonas de Modo campo sobre la cámara
  await p.evaluate(() => { window.__H = 0; });
  await p.waitForFunction(() => window.__setas.explorar()?.ar.micro.length > 0 && window.__setas.explorar().ar.estado === 'ok', null, { timeout: 20000 });
  e = await explorar(p);
  const clave = (m) => `${m.fila},${m.col}`;
  const deCampo = await p.evaluate(() => window.__setas.campo().micro.map((m) => ({ fila: m.fila, col: m.col })));
  comprobar(e.ar.micro.map(clave).sort().join('|') === deCampo.map(clave).sort().join('|'), `las ${e.ar.micro.length} marcas son las mismas microzonas que Modo campo (misma selección y seta)`);
  const alvo = e.ar.micro.find((m) => m.dist_m >= 60);
  comprobar(!!alvo, `hay una microzona a ≥ 60 m para probar (${alvo?.idon}/100 a ${Math.round(alvo?.dist_m)} m, rumbo ${Math.round(alvo?.rumbo)}°)`);
  await p.evaluate((h) => { window.__H = h; }, alvo.rumbo);
  await p.waitForFunction((a) => { const x = window.__setas.explorar()?.ar; const m = x?.marcas.find((q) => q.fila === a.fila && q.col === a.col); return m?.visible && Math.abs(m.x - x.ancho / 2) < x.ancho * 0.05; }, alvo, { timeout: 8000 });
  e = await explorar(p);
  const mv = e.ar.marcas.find((q) => q.fila === alvo.fila && q.col === alvo.col);
  comprobar(mv.visible && Math.abs(mv.x - e.ar.ancho / 2) < e.ar.ancho * 0.25, `mirando a ${Math.round(alvo.rumbo)}° la marca está visible y centrada (x ${Math.round(mv.x)} de ${Math.round(e.ar.ancho)})`);
  const el = p.locator(`.ex-marca[data-fila="${alvo.fila}"][data-col="${alvo.col}"]`);
  const tm = await el.innerText();
  comprobar(/^\d+ m( · (casi llano|[↑↓] \d+ m))? · \d+$/.test(tm) && tm.endsWith(`· ${alvo.idon}`), `texto de la marca: «${tm}»`);
  await p.screenshot({ path: join(CAPTURAS, 'explorar-ar.png') });
  await p.evaluate((h) => { window.__H = h; }, (alvo.rumbo + 180) % 360);
  await p.waitForFunction((a) => { const x = window.__setas.explorar()?.ar; const m = x?.marcas.find((q) => q.fila === a.fila && q.col === a.col); return m && !m.visible && x.chips.length > 0; }, alvo, { timeout: 8000 });
  e = await explorar(p);
  comprobar(e.ar.chips.every((c) => /buena zona, \d+ m/.test(c.texto)) && !(await el.count()), `girando 180° la marca sale del cuadro y queda un chip en el borde: «${e.ar.chips[0].texto}»`);
  const norte = { ...YO, lat: YO.lat + 0.0009 };
  await p.evaluate((x) => window.__geo.emitir(x), norte);
  await p.waitForFunction((y) => Math.abs(window.__setas.explorar()?.ar.centro?.lat - y) < 1e-9, norte.lat, { timeout: 15000 });
  await p.evaluate((x) => window.__geo.emitir(x), YO);
  await p.waitForFunction((y) => Math.abs(window.__setas.explorar()?.ar.centro?.lat - y) < 1e-9, YO.lat, { timeout: 15000 });
  ok('al moverte ~100 m (> 50 m) las marcas se recalculan');
  await p.evaluate(() => { window.__H = 92; });
  await p.waitForFunction(() => { const x = window.__setas.explorar(); return x?.hayBrujula && x.orientacion !== null && Math.abs(x.orientacion - 92) < 0.6; }, null, { timeout: 8000 });
  comprobar(/^E 9[12]°$/.test(await p.locator('#ex-rumbo').innerText()), 'la barra superior enseña el rumbo («E 92°»)');
  await p.locator('#ex-barrer').click();
  e = await explorar(p);
  comprobar(e.fase === 'barrido' && e.objetivos.join() === '90,135,180,225,270,315,0,45', `barrido desde 92° → ${e.objetivos.join(', ')}`);
  await p.screenshot({ path: join(CAPTURAS, 'explorar-barrido.png') });
  for (let i = 0; i < 8; i++) {
    if (i > 0) await p.evaluate((h) => { window.__H = h; }, e.objetivos[i] + 2);
    await p.waitForFunction((n) => (window.__setas.explorar()?.hechas.length ?? 0) >= n || window.__setas.explorar()?.fase === 'fin', i + 1, { timeout: 10000 });
  }
  await p.waitForSelector('#ex-fin:not([hidden])', { timeout: 20000 });
  ok('al llegar a la octava foto el barrido se guarda solo y sale la pregunta del hallazgo');
  await p.screenshot({ path: join(CAPTURAS, 'explorar-fin.png') });
  let obs = await observaciones(p);
  comprobar(obs.length === 1, 'hay 1 observación en IndexedDB');
  const o = obs[0];
  comprobar(o.direcciones.length === 8, '8 direcciones');
  comprobar(o.direcciones.every((d, i) => delta(d.rumbo, e.objetivos[i]) <= 10), `rumbos medidos a ±10° de los objetivos: ${o.direcciones.map((d) => d.rumbo).join(', ')}`);
  comprobar(o.direcciones.every((d) => d.tipo === 'image/jpeg' && d.bytes > 0 && d.bytes <= 400 * 1024), `fotos JPEG ≤ 400 KB (${o.direcciones.map((d) => Math.round(d.bytes / 1024)).join(', ')} KB)`);
  comprobar(o.direcciones.every((d) => Math.max(d.ancho, d.alto) <= 1024 && d.ancho > 0), `lado mayor ≤ 1024 px (${o.direcciones[0].ancho}×${o.direcciones[0].alto})`);
  comprobar(o.direcciones.every((d) => d.exif === false && d.precBrujula === 5 && d.analisis === null), 'fotos sin EXIF, con la precisión de la brújula y sin análisis');
  comprobar(Math.abs(o.lat - YO.lat) < 1e-9 && Math.abs(o.lon - YO.lon) < 1e-9 && o.precGps === 5 && o.altGps === 300 && o.especie === ESPECIE,
    'posición, precisión, altitud GPS y seta de la observación');
  comprobar(o.estado === 'sin_analizar' && o.hallazgo === 'no_mirado', 'estado «sin analizar» y hallazgo sin mirar: nada sale a la red');
  comprobar(!!o.modelo && o.modelo.idon >= 0 && o.modeloSector.length === 8 && o.arbolSector.length === 8, `lo que decía el modelo aquí: ${o.modelo?.idon}/100, sectores ${o.modeloSector.join('/')}`);
  comprobar(o.modeloSector.some((x) => typeof x === 'number'), 'al menos un sector con celdas del modelo');
  comprobar(o.altModelo === null || typeof o.altModelo === 'number', `altitud del modelo: ${o.altModelo === null ? 'sin dato' : Math.round(o.altModelo) + ' m'}`);
  const g = await p.evaluate(() => window.__setas.grabacion());
  comprobar(g && g.notas.some((n) => /^Observación: 8 fotos/.test(n.texto)) && o.rutaId === g.id, 'la observación queda como nota de la ruta que se graba (y enlazada por rutaId)');
  const txt = await p.locator('#dlg-explorar').innerText();
  comprobar(!PROHIBIDO.test(txt), 'la pantalla no dice «comestible»');
  // Hallazgo y sitio
  await p.locator('#ex-h-nada').click();
  await p.waitForFunction(() => /no encontraste nada/.test(document.querySelector('#ex-h-estado').textContent));
  obs = await observaciones(p);
  comprobar(obs[0].hallazgo === 'nada', '«Nada» se guarda en la observación');
  await p.locator('#ex-h-si').click();
  await p.locator('#ex-h-especie').selectOption(ESPECIE);
  await p.locator('#ex-h-ok').click();
  await p.waitForFunction(() => /encontraste algo/.test(document.querySelector('#ex-h-estado').textContent));
  obs = await observaciones(p);
  comprobar(obs[0].hallazgo === 'encontrada' && obs[0].especieHallada === ESPECIE, '«Sí» + seta se guarda como hallazgo');
  await p.locator('#ex-sitio').click();
  await p.waitForFunction(() => /Guardado en Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  await p.locator('#ex-sitio').click();
  await p.waitForFunction(() => /Ya estaba en Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  ok('«Guardar como sitio» lo añade a Mis sitios (y no lo duplica)');
  // ---- Análisis con Gemini (Worker simulado)
  comprobar(await p.locator('#ex-analizar').isVisible() && (await p.locator('#ex-an-res li').count()) === 0, '«Analizar» está visible y no se ha enviado nada todavía');
  comprobar(p.w.peticiones.length === 0 && p.dialogos.length === 0, 'hasta pulsar «Analizar» no sale ninguna petición ni aviso');
  await p.locator('#ex-analizar').click();
  await p.waitForSelector('#ex-an-res li', { timeout: 15000 });
  comprobar(p.dialogos.length === 1 && p.dialogos[0].startsWith('Las 8 fotos se envían a Google (Gemini) para describir el bosque. No se guardan en nuestro servidor.'), 'la primera vez sale el aviso de privacidad con el texto fijado');
  comprobar(await p.evaluate(() => localStorage.getItem('setas:explorar-privacidad')) === '1', 'el aviso se recuerda en localStorage');
  const pet = p.w.peticiones[0];
  const dec = (x) => (String(x).split('.')[1] ?? '').length;
  comprobar(p.w.peticiones.length === 1 && pet.fotos.length === 8 && pet.fotos.every((f) => Number.isInteger(f.rumbo) && f.rumbo >= 0 && f.rumbo < 360 && f.jpeg.startsWith('/9j/')), 'la petición lleva 8 fotos JPEG en base64 con rumbo entero 0–359');
  comprobar(dec(pet.contexto.lat) <= 2 && dec(pet.contexto.lon) <= 2 && pet.contexto.lat === Math.round(YO.lat * 100) / 100, `latitud y longitud con ≤ 2 decimales (${pet.contexto.lat}, ${pet.contexto.lon})`);
  comprobar(JSON.stringify(Object.keys(pet.contexto).sort()) === JSON.stringify(['altitud', 'arboles_region', 'especie', 'especie_nombre', 'lat', 'lon', 'mes', 'modelo_sector']) && pet.contexto.modelo_sector.length === 8
    // El mes es el de la observación (reloj real del barrido, no el ?hoy= del e2e).
    && pet.contexto.mes === await p.evaluate(() => new Date().getMonth() + 1),
    `contexto solo con los campos del contrato (${Object.keys(pet.contexto).join(', ')})`);
  comprobar(JSON.stringify(pet).indexOf(String(YO.lat)) < 0 && JSON.stringify(pet).indexOf(String(YO.lon)) < 0, 'el punto exacto no sale del teléfono');
  comprobar(await p.locator('#ex-an-res li').count() === 8 && await p.locator('#ex-an-res li[data-mejor="1"]').count() === 1, 'resultado: 8 direcciones y una sola marcada como mejor');
  const mejorTxt = await p.locator('#ex-an-res .ex-mejor-txt').innerText();
  comprobar(/^Mejor dirección: (N|NE|E|SE|S|SO|O|NO) \d+°$/.test(mejorTxt), `«${mejorTxt}»`);
  comprobar(/no garantiza setas/.test(await p.locator('#ex-an-res').innerText()), 'lleva la línea «Es una orientación por el aspecto del bosque, no garantiza setas»');
  comprobar(!PROHIBIDO.test(await p.locator('#dlg-explorar').innerText()), 'ni las razones ni las notas de Gemini dicen «comestible»');
  comprobar(!(await p.locator('#ex-analizar').isVisible()), '«Analizar» desaparece una vez analizada');
  obs = await observaciones(p);
  comprobar(obs[0].estado === 'analizada' && obs[0].direcciones.every((d) => d.analisis) && obs[0].direcciones.every((d) => d.tipo === 'image/jpeg'), 'la observación queda «analizada» y conserva las fotos');
  await p.locator('#ex-an-res').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'explorar-analisis.png') });
  // ---- La mejor dirección sobre la cámara
  const mejorRumbo = Number(await p.locator('#ex-an-res li[data-mejor="1"]').getAttribute('data-rumbo'));
  await p.locator('#ex-ver-camara').click();
  await p.waitForFunction(() => window.__setas.explorar()?.camara === 'vivo' && window.__setas.explorar()?.fase === 'visor', null, { timeout: 15000 });
  await p.evaluate((h) => { window.__H = h; }, mejorRumbo);
  await p.waitForFunction((h) => { const x = window.__setas.explorar(); return x?.orientacion !== null && Math.abs(x.orientacion - h) < 1 && x.ar.mejor?.visible; }, mejorRumbo, { timeout: 8000 });
  await p.waitForTimeout(150);
  e = await explorar(p);
  comprobar(e.ar.mejor.rumbo === mejorRumbo && Math.abs(e.ar.mejor.x - e.ar.ancho / 2) < e.ar.ancho * 0.25 && await p.locator('.ex-mejor').count() === 1, `mirando a ${mejorRumbo}° la mejor dirección sale como marca grande, centrada`);
  await p.screenshot({ path: join(CAPTURAS, 'explorar-mejor.png') });
  await p.evaluate((h) => { window.__H = h; }, (mejorRumbo + 180) % 360);
  await p.waitForFunction(() => window.__setas.explorar()?.ar.mejor?.visible === false, null, { timeout: 8000 });
  comprobar(await p.locator('.ex-mejor-chip').count() === 1 && await p.locator('.ex-mejor').count() === 0, 'girando 180° queda un chip en el borde');
  await p.locator('#ex-cerrar').click();
  await p.waitForFunction(() => !document.querySelector('#dlg-explorar[open]'));
  await p.locator('#cp-cerrar').click();
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForFunction(() => /Observación \d/.test(document.querySelector('#lista-sitios')?.textContent ?? ''), null, { timeout: 10000 });
  ok('el sitio «Observación …» aparece en Mis sitios');
  // ---- Mis observaciones: lista, resumen, detalle, exportación y borrado
  comprobar(/^Mis observaciones \(1\)$/.test((await p.locator('#btn-observaciones').innerText()).trim()), 'Mis sitios tiene «Mis observaciones (1)» junto a Mis rutas');
  await p.locator('#btn-observaciones').click();
  await p.waitForSelector('#dlg-observaciones[open] #ob-lista li', { timeout: 10000 });
  comprobar(await p.locator('#ob-lista li').count() === 1 && await p.locator('#ob-lista li img').count() === 1, 'la lista tiene la observación, con la miniatura de su primera foto');
  const itemTxt = await p.locator('#ob-lista li').innerText();
  comprobar(/Encontraste algo/.test(itemTxt) && /modelo \d+\/100 aquí/.test(itemTxt), `fila: «${itemTxt.replace(/\n+/g, ' · ')}»`);
  await p.waitForFunction(() => /^Mejor: \S+ \d+°$/.test(document.querySelector('#ob-lista .ob-mejor')?.textContent ?? ''), null, { timeout: 8000 });
  ok('la fila enseña «Mejor: …» porque está analizada');
  const resTxt = await p.locator('#ob-resumen').innerText();
  comprobar(/Modelo ≥ 50 y encontraste: 1 · Modelo ≥ 50 y nada: 0 · Modelo < 50 y encontraste: 0/.test(resTxt) && !/%/.test(resTxt) && /Árbol visto distinto del modelo: 1 caso/.test(resTxt),
    `resumen con 1 observación, sin porcentajes (${resTxt.split('\n').join(' | ')})`);
  const [bajada] = await Promise.all([p.waitForEvent('download'), p.locator('#ob-exportar').click()]);
  comprobar(/^observaciones-\d{4}-\d{2}-\d{2}\.geojson$/.test(bajada.suggestedFilename()), `la exportación se llama ${bajada.suggestedFilename()}`);
  const gj = readFileSync(await bajada.path(), 'utf8');
  const fc = JSON.parse(gj);
  comprobar(fc.type === 'FeatureCollection' && fc.features.length === 1 && fc.features[0].geometry.coordinates[0] === YO.lon && !/foto|jpeg|base64|\/9j\//i.test(gj) && fc.features[0].properties.direcciones.length === 8,
    'GeoJSON con 1 punto, 8 direcciones analizadas y sin fotos');
  await p.locator('#ob-lista .ob-ver').click();
  await p.waitForSelector('#ob-volver');
  comprobar(await p.locator('.ob-foto img').count() === 8 && await p.locator('#ob-analisis li').count() === 8, 'detalle: 8 fotos con su rumbo y el análisis de las 8 direcciones');
  comprobar(!PROHIBIDO.test(await p.locator('#dlg-observaciones').innerText()), 'el detalle no dice «comestible»');
  await p.screenshot({ path: join(CAPTURAS, 'observaciones-detalle.png') });
  await p.locator('#ob-h').selectOption('nada');
  await p.locator('#ob-nota').fill('Zona seca, sin hojarasca.');
  await p.locator('#ob-guardar').click();
  await p.waitForFunction(() => document.querySelector('#ob-nota')?.value === 'Zona seca, sin hojarasca.' && document.querySelector('#ob-h')?.value === 'nada');
  obs = await observaciones(p);
  comprobar(obs[0].hallazgo === 'nada' && obs[0].especieHallada === '' && obs[0].nota === 'Zona seca, sin hojarasca.' && obs[0].estado === 'analizada', 'editar el hallazgo y la nota se guarda (y sigue analizada)');
  await p.locator('#ob-volver').click();
  await p.waitForFunction(() => /Modelo ≥ 50 y nada: 1/.test(document.querySelector('#ob-resumen')?.textContent ?? ''));
  ok('el resumen se actualiza con el nuevo hallazgo');
  await p.locator('#ob-lista .ob-ver').click();
  await p.waitForSelector('#ob-volver');
  await p.getByRole('button', { name: 'Ver en el mapa' }).click();
  await p.waitForFunction(() => !document.querySelector('#dlg-observaciones[open]') && document.querySelector('#p-mapa.activa'));
  ok('«Ver en el mapa» cierra Mis observaciones y lleva al mapa');
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.locator('#btn-observaciones').click();
  await p.waitForSelector('#ob-lista li');
  await p.locator('#ob-lista .ob-ver').click();
  await p.getByRole('button', { name: 'Borrar' }).click();
  await p.waitForFunction(() => document.querySelectorAll('#ob-lista li').length === 0 && /Aún no hay observaciones/.test(document.querySelector('#ob-cuerpo')?.textContent ?? ''));
  comprobar((await observaciones(p)).length === 0, '«Borrar» (con confirmación) elimina la observación de IndexedDB');
  await p.locator('#ob-cerrar').click();
  // La cámara se apaga al cerrar
  comprobar(await p.evaluate(() => !document.querySelector('#ex-camara video')), 'al cerrar, la cámara se apaga');
  await p.context().close();

  // ------------------------------------------------------------ 1b. pendiente sin conexión y error 429
  const z = await pagina([conWorker]);
  await z.evaluate(() => { localStorage.setItem('setas:explorar-privacidad', '1'); });
  await abrirExplorar(z);
  await z.waitForFunction(() => !document.querySelector('#ex-barrer').disabled, null, { timeout: 10000 });
  await z.evaluate(() => { window.__H = 0; });
  await z.waitForFunction(() => window.__setas.explorar()?.hayBrujula, null, { timeout: 8000 });
  await z.locator('#ex-barrer').click();
  for (let i = 0; i < 8; i++) {
    const obj = (await explorar(z)).objetivos[i];
    await z.evaluate((h) => { window.__H = h + 1; }, obj);
    await z.waitForFunction((n) => (window.__setas.explorar()?.hechas.length ?? 0) >= n || window.__setas.explorar()?.fase === 'fin', i + 1, { timeout: 10000 });
  }
  await z.waitForSelector('#ex-fin:not([hidden])', { timeout: 20000 });
  z.w.modo = 'caido';
  await z.locator('#ex-analizar').click();
  await z.waitForFunction(() => /Pendiente: se analizará con conexión/.test(document.querySelector('#ex-an-res')?.textContent ?? ''), null, { timeout: 15000 });
  comprobar(z.dialogos.length === 0 && (await observaciones(z))[0].estado === 'pendiente', 'sin conexión: «Pendiente: se analizará con conexión» y la observación queda pendiente (sin repetir el aviso)');
  z.w.modo = '429';
  await z.locator('#ex-analizar').click();
  await z.waitForFunction(() => /barridos/.test(document.querySelector('#ex-an-res')?.textContent ?? ''), null, { timeout: 15000 });
  const t429 = await z.locator('#ex-an-res').innerText();
  comprobar(/10 barridos por día/.test(t429) && (await observaciones(z))[0].estado === 'error' && /Probar otra vez/.test(await z.locator('#ex-analizar').innerText()), `429: se enseña el mensaje del Worker («${t429}») y «Probar otra vez»`);
  z.w.modo = 'caido';
  await z.locator('#ex-analizar').click();
  await z.waitForFunction(() => /Pendiente/.test(document.querySelector('#ex-an-res')?.textContent ?? ''), null, { timeout: 15000 });
  z.w.modo = 'ok';
  await z.evaluate(() => window.dispatchEvent(new Event('online')));
  await z.waitForSelector('#ex-an-res li', { timeout: 15000 });
  comprobar((await observaciones(z))[0].estado === 'analizada' && z.w.peticiones.length === 2, 'al volver la conexión («online») se analiza la pendiente (una sola petición nueva) y se repinta el resultado');
  await z.context().unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await z.context().close();

  // ------------------------------------------------------------ 2. sin cámara en vivo: una foto por dirección
  const q = await pagina([sinCamara]);
  await abrirExplorar(q);
  e = await explorar(q);
  comprobar(e.camara === 'archivo' && e.manual, 'con getUserMedia roto, la cámara pasa a modo archivo');
  await q.waitForFunction(() => !document.querySelector('#ex-barrer').disabled, null, { timeout: 10000 });
  await q.locator('#ex-barrer').click();
  await q.waitForSelector('#ex-direcciones:not([hidden])');
  comprobar(await q.locator('#ex-direcciones .ex-dir').count() === 8 && /Foto hacia el norte/.test(await q.locator('#ex-direcciones .ex-dir').first().innerText()),
    'aparece un botón «Foto hacia …» por cada dirección, sin disparo automático');
  for (const r of [90, 0]) {
    const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.locator(`#ex-direcciones .ex-dir[data-rumbo="${r}"]`).click()]);
    await fc.setFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: FOTO });
    await q.waitForFunction((n) => window.__setas.explorar()?.hechas.length === n, r === 90 ? 1 : 2);
  }
  ok('elegir una foto por dirección la guarda (en el orden que quieras)');
  await q.locator('#ex-terminar').click();
  await q.waitForSelector('#ex-fin:not([hidden])', { timeout: 20000 });
  obs = await observaciones(q);
  comprobar(obs.length === 1 && obs[0].direcciones.length === 2 && obs[0].direcciones.map((d) => d.rumbo).join() === '0,90' && obs[0].direcciones.every((d) => d.tipo === 'image/jpeg' && d.bytes <= 400 * 1024 && d.exif === false && d.precBrujula === null),
    '«Terminar» con 2 fotos: observación con direcciones 0° y 90°, re-codificadas, sin EXIF y sin precisión de brújula inventada');
  await q.screenshot({ path: join(CAPTURAS, 'explorar-archivo.png') });
  await q.context().close();

  // ------------------------------------------------------------ 3. brújula poco fiable, diagnóstico y pausa por inactividad
  const r = await pagina([() => { window.__setasInactividadMs = 1600; }]);
  await abrirExplorar(r);
  await r.evaluate(() => { window.__acc = 40; window.__H = 10; });
  await r.waitForFunction(() => /Brújula poco fiable/.test(window.__setas.explorar()?.aviso ?? ''), null, { timeout: 5000 });
  ok('con webkitCompassAccuracy > 25 sale «Brújula poco fiable: aléjate del coche y haz un 8…»');
  await r.evaluate(() => { window.__acc = 5; });
  await r.waitForFunction(() => window.__setas.explorar()?.aviso === null);
  ok('con la brújula buena el aviso desaparece');
  for (let i = 0; i < 4; i++) await r.locator('#ex-rumbo').click({ delay: 10 });
  await r.waitForSelector('#ex-diag:not([hidden])');
  const diag = await r.locator('#ex-diag').innerText();
  comprobar(/webkitCompassAccuracy: 5/.test(diag) && /cámara: vivo \d+×\d+/.test(diag) && /pantalla: 0°/.test(diag), `4 toques en el rumbo → diagnóstico (${diag.split('\n')[2]})`);
  await r.waitForFunction(() => window.__setas.explorar()?.pausado === true, null, { timeout: 8000 });
  comprobar(await r.locator('#ex-pausa').isVisible() && !(await r.evaluate(() => document.querySelector('#ex-camara video'))), 'sin toques, se pausa: cámara parada y «Pausado para ahorrar batería»');
  await r.locator('#ex-reanudar').click();
  await r.waitForFunction(() => { const x = window.__setas.explorar(); return x && !x.pausado && x.camara === 'vivo'; }, null, { timeout: 8000 });
  ok('«Reanudar» vuelve a abrir la cámara en vivo');
  await r.context().close();

  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  console.log(`Capturas en ${CAPTURAS}`);
} catch (err) {
  console.error(err.message, `(capturas en ${CAPTURAS})`, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
