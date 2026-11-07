// e2e «móvil» (2026-11-07): en un iPhone (390×844 y 375×812, claro y oscuro) cada pestaña (Mapa, Hoy, Mis sitios, Guía con
// su ficha, Reconocer, Ajustes, Zona) y las hojas del mapa (Capas, chat) cumplen:
//  - sin desborde horizontal: scrollWidth <= clientWidth (era el scroll lateral de Hoy: los .sr de la tabla de Temporada);
//  - sin zonas vacías a las que desplazarse: el alto desplazable no supera el último contenido + la barra de pestañas + un margen;
//  - la tarjeta del punto del mapa va en una sola columna (título, motivo, botones en fila a todo el ancho) y
//    «Preguntar a la IA» abre el chat con el punto precargado y editable.
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const HOY = '2026-10-14';
const URL_APP = BASE + `?e2e=1&hoy=${HOY}`;
const CAPTURAS = process.env.CAPTURAS_MOVIL ?? null;
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'fixtures/open-meteo.json'), 'utf8'));
const PUNTO = { lat: 36.589, lon: -5.244 };
const URL_WORKER = 'https://setas-worker.e2e.invalid/identificar';
const MARGEN_VACIO = 56;   // px de aire bajo el último contenido además de la barra de pestañas (padding de .cuerpo y caja del último bloque)

let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const fallos = [];
const comprobar = (c, m) => { if (!c) { fallos.push(m); console.log(`✘ ${++paso}. ${m}`); return; } ok(m); };
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Medidas de la pestaña activa: desborde horizontal y cuánto se puede desplazar más allá del último contenido. */
const medirPestana = (p, id) => p.evaluate((id) => {
  const sec = document.getElementById(id);
  const visible = (e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden' && !e.closest('[hidden]'); };
  sec.scrollTop = 0;
  const top = sec.getBoundingClientRect().top;
  let ultimo = 0;
  for (const e of sec.querySelectorAll('*')) {
    if (!visible(e) || e.classList.contains('sr') || e.closest('.sr') || getComputedStyle(e).position === 'fixed') continue;
    const propio = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(IMG|SVG|INPUT|SELECT|TEXTAREA|CANVAS|BUTTON)$/i.test(e.tagName);
    if (propio) ultimo = Math.max(ultimo, e.getBoundingClientRect().bottom - top);
  }
  const barra = document.querySelector('.pestanas').getBoundingClientRect();
  return { sw: sec.scrollWidth, cw: sec.clientWidth, sh: sec.scrollHeight, ch: sec.clientHeight, ultimo: Math.round(ultimo),
    barra: Math.round(innerHeight - barra.top) };
}, id);

const nav = await chromium.launch();
const errores = [];
try {
  for (const [ancho, alto] of [[390, 844], [375, 812]]) {
    for (const tema of ['light', 'dark']) {
      const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        colorScheme: tema, locale: 'es-ES', timezoneId: 'Europe/Madrid',
        geolocation: { latitude: PUNTO.lat, longitude: PUNTO.lon }, permissions: ['geolocation'] });
      await ctx.addInitScript((u) => { try { localStorage.setItem('setas:e2e-worker-url', u); } catch { /* sin almacenamiento */ } }, URL_WORKER);
      let puntos = null;
      await ctx.route('**/api.open-meteo.com/**', async (r) => {
        puntos ??= await (await fetch(new URL('data/marbella/meteo_puntos.json', BASE))).json();
        const u = new URL(r.request().url());
        const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
        const rel = Array.from({ length: 46 }, (_, i) => i - 30);
        const una = (la, i) => ({ latitude: la, longitude: lon[i], elevation: puntos.find((q) => q.lat === la && q.lon === lon[i])?.alt_media ?? 0,
          daily: { time: rel.map((k) => sumar(HOY, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
            temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin),
            et0_fao_evapotranspiration: rel.map(() => FIXTURE.et0), relative_humidity_2m_min: rel.map(() => FIXTURE.hr_min) },
          hourly: { time: rel.flatMap((k) => Array.from({ length: 24 }, (_, h) => `${sumar(HOY, k)}T${String(h).padStart(2, '0')}:00`)),
            soil_moisture_9_to_27cm: rel.flatMap(() => Array(24).fill(FIXTURE.suelo)) } });
        await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(lat.length === 1 ? una(lat[0], 0) : lat.map(una)) });
      });
      await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
      const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
      const peticionesChat = [];
      await ctx.route('https://setas-worker.e2e.invalid/**', async (r) => {
        const req = r.request();
        if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST, OPTIONS' } });
        peticionesChat.push(JSON.parse(req.postData() ?? '{}'));
        await r.fulfill({ status: 200, headers: CORS, contentType: 'application/json',
          body: JSON.stringify({ aviso: 'x', content: [{ type: 'text', text: 'Respuesta de prueba.' }], stop_reason: 'end_turn', texto: 'Respuesta de prueba.' }) });
      });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errores.push(String(e)));
      const etq = `${ancho}×${alto} ${tema === 'light' ? 'claro' : 'oscuro'}`;
      await p.goto(URL_APP);
      const b = p.getByRole('button', { name: 'Entendido' });
      if (await b.isVisible({ timeout: 15000 }).catch(() => false)) await b.click();
      await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
      const cap = async (n) => { if (CAPTURAS) { await p.waitForTimeout(300); await p.screenshot({ path: join(CAPTURAS, `${n}-${ancho}-${tema}.png`) }); } };

      const revisar = async (id, nombre) => {
        await p.waitForTimeout(900);
        const m = await medirPestana(p, id);
        comprobar(m.sw <= m.cw, `${etq} · ${nombre}: sin desborde horizontal (${m.sw} ≤ ${m.cw})`);
        const vacio = m.sh - m.ultimo;
        comprobar(m.sh <= m.ch || vacio <= m.barra + MARGEN_VACIO,
          `${etq} · ${nombre}: sin zona vacía al desplazar (alto ${m.sh}, contenido hasta ${m.ultimo}, sobra ${vacio} ≤ barra ${m.barra} + ${MARGEN_VACIO})`);
        await cap(`pestana-${id}`);
      };
      await revisar('p-mapa', 'Mapa');
      await p.locator('.pestanas [data-p=p-hoy]').click();
      await p.locator('#top-general li').first().waitFor({ timeout: 20000 });
      await revisar('p-hoy', 'Hoy');
      await p.locator('.pestanas [data-p=p-sitios]').click();
      await revisar('p-sitios', 'Mis sitios');
      await p.locator('.pestanas [data-p=p-guia]').click();
      await p.locator('.tarjeta-guia').first().waitFor();
      await revisar('p-guia', 'Guía');
      await p.locator('.tarjeta-guia[data-id=amanita_caesarea]').click();
      await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
      await revisar('p-guia', 'Guía · ficha');
      await p.locator('.btn-volver').click();
      await p.locator('.pestanas [data-p=p-reconocer]').click();
      await revisar('p-reconocer', 'Reconocer');
      await p.locator('.pestanas [data-p=p-ajustes]').click();
      await revisar('p-ajustes', 'Ajustes');

      // Mapa con zona elegida: tarjeta del punto, Zona, Capas y chat.
      await p.locator('.pestanas [data-p=p-mapa]').click();
      await p.evaluate(({ lat, lon }) => window.__setas.mapa.jumpTo({ center: [lon, lat], zoom: 13 }), PUNTO);
      await p.waitForTimeout(500);
      const pt = await p.evaluate(({ lat, lon }) => { const m = window.__setas.mapa, r = m.getCanvas().getBoundingClientRect(), q = m.project([lon, lat]); return { x: r.left + q.x, y: r.top + q.y }; }, PUNTO);
      await p.mouse.click(pt.x, pt.y);
      await p.locator('#tarjeta-zona').waitFor({ state: 'visible', timeout: 15000 });
      await p.waitForTimeout(700);
      // --tz-alto lo pone un ResizeObserver: con la máquina cargada tarda un poco en subir los botones flotantes.
      await p.waitForFunction(() => document.querySelector('.fabs').getBoundingClientRect().bottom <= document.querySelector('#tarjeta-zona').getBoundingClientRect().top + 1, null, { timeout: 8000 }).catch(() => {});
      const tz = await p.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const t = r('#tarjeta-zona'), est = r('#tz-estado'), mot = r('#tz-motivo'), acc = r('.tz-acciones'), ver = r('#tz-ver'), nav = r('#tz-navegar'), gu = r('#tz-guardar'), ia = r('#tz-ia');
        const linea = parseFloat(getComputedStyle(document.querySelector('#tz-estado')).lineHeight) || 22;
        return { t: [t.left, t.right, t.top, t.bottom], estadoLineas: Math.round(est.height / linea),
          columnaUnica: est.left < t.left + 80 && mot.left < t.left + 24 && mot.right > t.right - 40 && acc.right > t.right - 24,
          fila: Math.abs(ver.top - nav.top) < 2 && Math.abs(nav.top - gu.top) < 2, ancho: acc.width / t.width,
          abajo: acc.top >= mot.bottom && ia.top >= acc.bottom, botonesAncho: [ver.width, nav.width, gu.width].map(Math.round),
          fabs: document.querySelector('.fabs').getBoundingClientRect().bottom <= t.top + 1 };
      });
      comprobar(tz.columnaUnica && tz.fila && tz.abajo && tz.ancho > 0.88, `${etq} · tarjeta del punto: una columna, botones en una fila a todo el ancho (${tz.botonesAncho.join('/')} px)`);
      comprobar(tz.estadoLineas <= 3, `${etq} · tarjeta del punto: el título ocupa ${tz.estadoLineas} líneas (≤ 3)`);
      comprobar(tz.fabs, `${etq} · los botones flotantes quedan sobre la tarjeta`);
      await cap('tarjeta-punto');

      // «Preguntar a la IA»: abre el chat con el punto precargado (editable) y la respuesta llega.
      await p.locator('#tz-ia').click();
      await p.locator('#chat:not([hidden])').waitFor();
      await p.waitForTimeout(900);
      const pre = await p.locator('#chat-texto').inputValue();
      comprobar(/^¿Merece la pena ir hoy a este sitio a por .+\?/.test(pre) && /Punto: 36\.5\d+, -5\.2\d+/.test(pre) && /Ahora: .*Buen momento|Ahora: .*≈ \d+ %|Ahora: sin datos/.test(pre),
        `${etq} · «Preguntar a la IA» abre el chat con la pregunta y los datos del punto: «${pre.replace(/\n/g, ' / ')}»`);
      const ta = await p.evaluate(() => { const t = document.querySelector('#chat-texto'); return { sh: t.scrollHeight, ch: t.clientHeight, dentro: t.getBoundingClientRect().bottom <= innerHeight }; });
      comprobar(ta.dentro && ta.sh <= ta.ch + 1, `${etq} · la pregunta precargada se ve entera en la caja (${ta.sh} ≤ ${ta.ch})`);
      await cap('chat-desde-tarjeta');
      await p.locator('#chat-texto').fill(pre + '\nGracias.');   // editable
      await p.locator('#chat-enviar').click();
      await p.waitForFunction(() => { const c = window.__setas.chat(); return !c.ocupado && c.turnos.length === 2; }, null, { timeout: 20000 });
      const texto = JSON.stringify(peticionesChat.at(-1)?.messages?.at(-1) ?? {});
      comprobar(/Merece la pena ir hoy/.test(texto) && /Gracias\./.test(texto), `${etq} · la pregunta editada es la que se envía al worker`);
      const hch = await p.evaluate(() => { const c = document.querySelector('#chat'); return c.scrollWidth <= c.clientWidth + 1; });
      comprobar(hch, `${etq} · chat: sin desborde horizontal`);
      await p.locator('#chat-cerrar').click();
      await p.locator('#tz-cerrar').click();
      await p.locator('#btn-capas').click();
      await p.locator('#capas').waitFor({ state: 'visible' });
      await p.waitForTimeout(900);
      const capas = await p.evaluate(() => { const c = document.querySelector('#capas'); return { sw: c.scrollWidth, cw: c.clientWidth }; });
      comprobar(capas.sw <= capas.cw + 1, `${etq} · Capas: sin desborde horizontal`);
      await p.locator('#capas-cerrar').click();
      await p.locator('.pestanas [data-p=p-hoy]').click();
      await p.locator('#hoy-zona').click();
      await p.locator('#lista-semaforo .semaforo-fila').first().waitFor();
      await revisar('p-zona', 'Zona');
      await ctx.close();
    }
  }
  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  if (fallos.length) throw new Error(`Falla (${fallos.length}):\n- ${fallos.join('\n- ')}`);
  console.log('e2e móvil OK');
} finally {
  await nav.close();
}
