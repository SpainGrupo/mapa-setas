// e2e de disposición (2026-10-18): en un iPhone (390×844 y 375×812, claro y oscuro, con zonas seguras simuladas:
// notch arriba y barra de inicio abajo) nada queda tapado por la cabecera fija, la barra de pestañas o el notch.
// En cada vista principal: el primer elemento queda bajo la cabecera y, con el scroll al final, el último queda por
// encima de la barra de pestañas. En la hoja «Capas del mapa», cada interruptor se ve entero y el último texto se
// alcanza con el scroll de la hoja.
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const HOY = '2026-10-14';
const URL_APP = BASE + `?e2e=1&hoy=${HOY}`;
const CAPTURAS = process.env.CAPTURAS_DISPOSICION ?? null;   // carpeta para capturas (opcional, no se versionan)
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
const FIXTURE = JSON.parse(readFileSync(join(AQUI, 'fixtures/open-meteo.json'), 'utf8'));
const PUNTO = { lat: 36.589, lon: -5.244 };
const ACCESO = { lat: 36.61083, lon: -5.24579 };   // celda con acceso calculado (ver offline.e2e.mjs)
// Zonas seguras de un iPhone con notch en vertical (Chromium no emula env(safe-area-inset-*)).
const SEGURA = { sup: 47, inf: 34 };
const MARGEN = 1;   // px de tolerancia por redondeos

let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const fallos = [];
/** Anota el fallo y sigue (así un solo pase enseña todo lo tapado); al final, si hubo alguno, falla. */
const comprobar = (c, m) => { if (!c) { fallos.push(m); console.log(`✘ ${++paso}. ${m}`); return; } ok(m); };
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

const nav = await chromium.launch();
const errores = [];
try {
  for (const [ancho, alto] of [[390, 844], [375, 812]]) {
    for (const tema of ['light', 'dark']) {
      const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        colorScheme: tema, locale: 'es-ES', timezoneId: 'Europe/Madrid',
        geolocation: { latitude: PUNTO.lat, longitude: PUNTO.lon }, permissions: ['geolocation'] });
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
      await ctx.addInitScript(({ sup, inf }) => {
        const s = document.createElement('style');
        s.textContent = `:root { --sup: ${sup}px !important; --inf: ${inf}px !important; }`;
        document.addEventListener('DOMContentLoaded', () => document.head.append(s));
      }, SEGURA);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errores.push(String(e)));
      const etq = `${ancho}×${alto} ${tema === 'light' ? 'claro' : 'oscuro'}`;
      await p.goto(URL_APP);
      const b = p.getByRole('button', { name: 'Entendido' });
      if (await b.isVisible({ timeout: 15000 }).catch(() => false)) await b.click();
      await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
      // Una zona elegida (para que «Zona: cuándo ir» tenga semáforo, gráfico y tabla) y el tiempo cargado.
      await p.evaluate(({ lat, lon }) => window.__setas.mapa.jumpTo({ center: [lon, lat], zoom: 13 }), PUNTO);
      await p.waitForTimeout(500);
      const pt = await p.evaluate(({ lat, lon }) => {
        const m = window.__setas.mapa, r = m.getCanvas().getBoundingClientRect(), q = m.project([lon, lat]);
        return { x: r.left + q.x, y: r.top + q.y };
      }, PUNTO);
      await p.mouse.click(pt.x, pt.y);
      await p.locator('#tarjeta-zona').waitFor({ state: 'visible', timeout: 15000 });

      // Hoja «Capas del mapa»: cada interruptor entero y el último texto alcanzable.
      await p.locator('#tz-cerrar').click();
      await p.locator('#btn-capas').click();
      await p.locator('#capas').waitFor({ state: 'visible' });
      await p.waitForTimeout(900);   // el muelle de entrada
      const capas = await p.evaluate(() => {
        const hoja = document.querySelector('#capas'), cuerpo = hoja.querySelector('.hoja-cuerpo');
        const labels = [...hoja.querySelectorAll('.interruptores > label')].filter((l) => l.offsetParent);
        const recortados = labels.filter((l) => l.scrollHeight > l.clientHeight + 1 || l.getBoundingClientRect().height < 44).map((l) => l.textContent.trim());
        const caja = hoja.querySelector('.interruptores');
        const cajaEntera = caja.scrollHeight <= caja.clientHeight + 1;
        cuerpo.scrollTop = cuerpo.scrollHeight;
        const ultimo = [...cuerpo.children].filter((c) => c.offsetParent).at(-1).getBoundingClientRect();
        const h = hoja.getBoundingClientRect(), barra = document.querySelector('.pestanas').getBoundingClientRect();
        return { recortados, cajaEntera, ultimoBajo: ultimo.bottom, hojaBajo: h.bottom, hojaAlto: h.top, barra: barra.top, n: labels.length };
      });
      if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, `capas-${ancho}-${tema}.png`) });
      comprobar(capas.n > 0 && !capas.recortados.length && capas.cajaEntera,
        `${etq} · Capas: los ${capas.n} interruptores se ven enteros${capas.recortados.length ? ` (recortados: ${capas.recortados.join(', ')})` : ''}`);
      comprobar(capas.ultimoBajo <= capas.hojaBajo + MARGEN && capas.hojaBajo <= capas.barra + MARGEN && capas.hojaAlto >= SEGURA.sup - MARGEN,
        `${etq} · Capas: el último texto (${Math.round(capas.ultimoBajo)}) cabe en la hoja (${Math.round(capas.hojaAlto)}–${Math.round(capas.hojaBajo)}), sobre la barra (${Math.round(capas.barra)})`);
      await p.locator('#capas-cerrar').click();

      // Hojas «Acceso» y «Ruta a pie» (arrastrables con retenes): la ruta abre a media altura; un gesto de scroll hacia
      // arriba con el dedo dentro del contenido la sube del todo y entonces el contenido llega hasta el final; se cierra.
      const cdp = await ctx.newCDPSession(p);
      /** Arrastre táctil real (eventos touch de CDP) de (x, y0) a (x, y1). */
      const arrastrar = async (x, y0, y1) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
        for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 8 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const finalHoja = (sel) => p.evaluate((sel) => {
        const h = document.querySelector(sel), c = h.querySelector('.hoja-cuerpo');
        c.scrollTop = c.scrollHeight;
        const u = [...c.children].filter((x) => x.getBoundingClientRect().height > 0).at(-1).getBoundingClientRect();
        const caja = h.getBoundingClientRect();
        return { ultimo: u.bottom, visibleHasta: Math.min(caja.bottom, innerHeight), alto: caja.top, barra: document.querySelector('.pestanas').getBoundingClientRect().top, reten: h.dataset.reten };
      }, sel);
      await p.evaluate(({ lat, lon }) => window.__setas.mapa.jumpTo({ center: [lon, lat], zoom: 15 }), ACCESO);
      await p.waitForTimeout(600);
      const pa = await p.evaluate(({ lat, lon }) => {
        const m = window.__setas.mapa, r = m.getCanvas().getBoundingClientRect(), q = m.project([lon, lat]);
        return { x: r.left + q.x, y: r.top + q.y };
      }, ACCESO);
      await p.mouse.move(pa.x, pa.y); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
      await p.locator('#tarjeta-acceso[data-estado=ok]').waitFor({ timeout: 20000 });
      await p.waitForTimeout(900);
      const acc = await finalHoja('#tarjeta-acceso');
      comprobar(acc.ultimo <= acc.visibleHasta + MARGEN && acc.visibleHasta <= acc.barra + MARGEN && acc.alto >= SEGURA.sup,
        `${etq} · Acceso: con scroll se llega al final (${Math.round(acc.ultimo)} ≤ ${Math.round(acc.visibleHasta)}), sobre la barra`);
      await p.locator('#ta-ruta').click();
      await p.locator('#tarjeta-ruta[data-estado=ok]').waitFor({ timeout: 20000 });
      await p.waitForTimeout(900);
      const medio = await p.evaluate(() => document.querySelector('#tarjeta-ruta').dataset.reten);
      const cr = await p.locator('#tarjeta-ruta .hoja-cuerpo').boundingBox();
      const yIni = Math.min(cr.y + 150, (await p.evaluate(() => document.querySelector('.pestanas').getBoundingClientRect().top)) - 20);
      await arrastrar(cr.x + cr.width / 2, yIni, yIni - 120);
      await p.waitForTimeout(900);
      const ru = await finalHoja('#tarjeta-ruta');
      if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, `ruta-${ancho}-${tema}.png`) });
      comprobar(medio === '1' && ru.reten === '2' && ru.ultimo <= ru.visibleHasta + MARGEN && ru.visibleHasta <= ru.barra + MARGEN && ru.alto >= SEGURA.sup,
        `${etq} · Ruta: abre a media altura (retén ${medio}), el dedo dentro del contenido la sube (retén ${ru.reten}) y el scroll llega al final (${Math.round(ru.ultimo)} ≤ ${Math.round(ru.visibleHasta)})`);
      await p.locator('#ru-cerrar').click();
      await p.locator('#tarjeta-ruta').waitFor({ state: 'hidden' });
      ok(`${etq} · Ruta: se cierra`);

      // Hoja «Elige una seta»: la última fila se alcanza con el scroll y la hoja no baja de la pantalla.
      await p.locator('#btn-especie').click();
      await p.locator('#dlg-especie[open]').waitFor();
      await p.waitForTimeout(400);
      const sel = await p.evaluate(() => {
        const d = document.querySelector('#dlg-especie'), l = d.querySelector('#lista-especies');
        l.scrollTop = l.scrollHeight;
        const u = [...l.querySelectorAll('[role=option]')].filter((o) => o.offsetParent).at(-1).getBoundingClientRect();
        return { ultimo: u.bottom, lista: l.getBoundingClientRect().bottom, hoja: d.getBoundingClientRect().bottom, alto: innerHeight };
      });
      comprobar(sel.ultimo <= sel.lista + MARGEN && sel.hoja <= sel.alto + MARGEN,
        `${etq} · Elige una seta: la última fila (${Math.round(sel.ultimo)}) se ve dentro de la hoja (${Math.round(sel.hoja)} ≤ ${sel.alto})`);
      await p.keyboard.press('Escape');
      await p.locator('#dlg-especie').waitFor({ state: 'hidden' });

      // Vistas principales: Hoy, Zona, Mis sitios, Guía, Reconocer, Ajustes.
      for (const [id, irA] of [['p-hoy', '.pestanas [data-p=p-hoy]'], ['p-zona', null], ['p-sitios', '.pestanas [data-p=p-sitios]'],
        ['p-guia', '.pestanas [data-p=p-guia]'], ['p-reconocer', '.pestanas [data-p=p-reconocer]'], ['p-ajustes', '.pestanas [data-p=p-ajustes]']]) {
        if (irA) await p.locator(irA).click();
        else {   // Zona: desde el mapa, tocar la zona → «Ver zona»
          await p.locator('.pestanas [data-p=p-mapa]').click();
          await p.mouse.click(pt.x, pt.y);
          await p.locator('#tz-ver').click();
        }
        await p.locator(`#${id}.activa`).waitFor();
        await p.waitForTimeout(400);
        const r = await p.evaluate((id) => {
          const pan = document.getElementById(id);
          const visible = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
          /** Último descendiente visible con contenido (hoja del árbol), recorriendo de atrás adelante. */
          const ultimoDe = (raiz) => {
            let e = raiz;
            for (;;) {
              const hijos = [...e.children].filter(visible);
              if (!hijos.length) return e;
              e = hijos.at(-1);
            }
          };
          const primeroDe = (raiz) => [...raiz.children].filter(visible)[0];
          const cuerpo = [...pan.querySelectorAll('.cuerpo')].filter(visible)[0];
          const cab = [...pan.querySelectorAll('.cab')].filter(visible)[0];
          pan.scrollTop = 0;
          const cabBajo = cab.getBoundingClientRect().bottom, cabAlto = cab.getBoundingClientRect().top;
          const titulo = cab.querySelector('h1').getBoundingClientRect().top;
          const primero = primeroDe(cuerpo).getBoundingClientRect().top;
          pan.scrollTop = pan.scrollHeight;
          const u = ultimoDe(cuerpo);
          const barra = document.querySelector('.pestanas').getBoundingClientRect().top;
          return { cabBajo, cabAlto, titulo, primero, ultimo: u.getBoundingClientRect().bottom, ultimoTxt: (u.textContent || u.tagName).trim().slice(0, 50), barra };
        }, id);
        if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, `${id}-${ancho}-${tema}.png`) });
        if (id === 'p-hoy') {
          // Los enlaces «saltar a» llevan la sección justo bajo la cabecera, no debajo de ella.
          const saltos = await p.locator('#p-hoy .saltos a').count();
          for (let i = 0; i < saltos; i++) {
            const a = p.locator('#p-hoy .saltos a').nth(i);
            await p.evaluate(() => { document.getElementById('p-hoy').scrollTop = 0; });
            await a.click();
            await p.waitForTimeout(150);
            const s = await a.evaluate((a) => ({ destino: document.querySelector(a.getAttribute('href')).getBoundingClientRect().top,
              cab: document.querySelector('#p-hoy .cab').getBoundingClientRect().bottom, txt: a.textContent.trim() }));
            comprobar(s.destino >= s.cab - MARGEN, `${etq} · Hoy: «${s.txt}» deja su sección bajo la cabecera (${Math.round(s.destino)} ≥ ${Math.round(s.cab)})`);
          }
        }
        comprobar(r.titulo >= SEGURA.sup - MARGEN && r.primero >= r.cabBajo - MARGEN,
          `${etq} · ${id}: el título queda bajo el notch (${Math.round(r.titulo)} ≥ ${SEGURA.sup}) y el contenido empieza bajo la cabecera (${Math.round(r.primero)} ≥ ${Math.round(r.cabBajo)})`);
        comprobar(r.ultimo <= r.barra - MARGEN,
          `${etq} · ${id}: al final, «${r.ultimoTxt}» (${Math.round(r.ultimo)}) queda sobre la barra de pestañas (${Math.round(r.barra)})`);
      }
      await ctx.close();
    }
  }
  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  if (fallos.length) throw new Error(`Falla (${fallos.length}):\n- ${fallos.join('\n- ')}`);
  console.log('e2e disposición OK');
} finally {
  await nav.close();
}
