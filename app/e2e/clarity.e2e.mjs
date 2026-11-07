// e2e de Microsoft Clarity y el aviso de cookies (2026-11-07). Con id FALSO (localStorage «setas:e2e-clarity-id»; el del
// build se ignora en e2e) y la red a clarity.ms bloqueada y contada. Comprueba:
//  - sin id: ni aviso, ni «Cookies» en Ajustes, ni una petición a clarity.ms;
//  - con id: aviso modal grande y centrado al primer arranque, por encima de «Antes de empezar», que no se cierra con
//    Escape; «Rechazar» (la app se usa igual) no carga Clarity; «Aceptar» sí, y se recuerda al recargar; el cambio desde
//    Ajustes › Cookies; los campos de texto libre llevan data-clarity-mask.
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const URL_APP = BASE + '?e2e=1';
const ID = 'falso12345';

let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const fallos = [];
const comprobar = (c, m) => { if (!c) { fallos.push(m); console.log(`✘ ${++paso}. ${m}`); return; } ok(m); };

const nav = await chromium.launch();
const errores = [];
/** Contexto nuevo (almacenamiento limpio) con la red a clarity.ms bloqueada y contada. */
async function contexto(conId) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: 'dark', locale: 'es-ES', timezoneId: 'Europe/Madrid',
    geolocation: { latitude: 36.589, longitude: -5.244 }, permissions: ['geolocation'] });
  const clarity = [];
  await ctx.route(/clarity\.ms/, (r) => { clarity.push(r.request().url()); return r.abort(); });
  await ctx.route('**/api.open-meteo.com/**', (r) => r.abort());
  await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  if (conId) await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem('setas:visita-e2e')) { localStorage.setItem(k, v); localStorage.setItem('setas:visita-e2e', '1'); } }, ['setas:e2e-clarity-id', ID]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(String(e)));
  return { ctx, p, clarity };
}
const guardado = (p) => p.evaluate(() => localStorage.getItem('setas:clarity'));

try {
  // ---- sin id de proyecto: nada
  {
    const { ctx, p, clarity } = await contexto(false);
    await p.goto(URL_APP);
    await p.locator('#dlg-inicio[open]').waitFor();
    await p.getByRole('button', { name: 'Entendido' }).click();
    await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
    await p.locator('.pestanas [data-p=p-ajustes]').click();
    comprobar(!(await p.locator('#dlg-cookies').evaluate((d) => d.open)), 'sin id de Clarity no sale el aviso de cookies');
    comprobar(await p.locator('#ajustes-cookies').isHidden(), 'sin id de Clarity no hay «Cookies» en Ajustes');
    comprobar(clarity.length === 0 && !(await p.locator('script[src*="clarity"]').count()), 'sin id de Clarity no se carga nada de clarity.ms');
    await ctx.close();
  }

  // ---- con id: rechazar
  {
    const { ctx, p, clarity } = await contexto(true);
    await p.goto(URL_APP);
    await p.locator('#dlg-cookies[open]').waitFor({ timeout: 15000 });
    await p.locator('#dlg-inicio[open]').waitFor();   // las dos están abiertas: la de cookies debe quedar delante
    await p.waitForTimeout(500);
    const g = await p.evaluate(() => {
      const d = document.querySelector('#dlg-cookies'), r = d.getBoundingClientRect(), a = document.querySelector('#cookies-aceptar').getBoundingClientRect(), x = document.querySelector('#cookies-rechazar').getBoundingClientRect();
      const centro = document.elementFromPoint(innerWidth / 2, r.top + r.height / 2);
      return { w: r.width, h: r.height, dx: Math.abs(r.left + r.width / 2 - innerWidth / 2), dy: Math.abs(r.top + r.height / 2 - innerHeight / 2),
        delante: !!centro?.closest('#dlg-cookies'), aceptarH: a.height, rechazarH: x.height, rechazarDebajo: x.top >= a.bottom, anchos: [a.width, x.width].map(Math.round),
        texto: d.textContent.replace(/\s+/g, ' ') };
    });
    comprobar(g.w >= 300 && g.h >= 280 && g.dx < 4 && g.dy < 60, `aviso grande y centrado (${Math.round(g.w)}×${Math.round(g.h)} px, desvío ${Math.round(g.dx)}/${Math.round(g.dy)})`);
    comprobar(g.delante, 'el aviso de cookies queda por encima de «Antes de empezar»');
    comprobar(g.aceptarH >= 60 && g.rechazarH >= 48 && g.rechazarDebajo && g.anchos[0] === g.anchos[1], `«Aceptar» grande (${Math.round(g.aceptarH)} px) y «Rechazar» debajo a su ancho (${Math.round(g.rechazarH)} px)`);
    comprobar(/Microsoft Clarity/.test(g.texto) && /grabaciones de sesión anónimas/.test(g.texto) && /mapas de calor/.test(g.texto) && /rechazar/i.test(g.texto), 'el aviso explica qué es Clarity y que se puede rechazar');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    comprobar(await p.locator('#dlg-cookies').evaluate((d) => d.open), 'Escape no cierra el aviso mientras no se elige');
    comprobar(clarity.length === 0, 'antes de elegir no se pide nada a clarity.ms');
    await p.locator('#cookies-rechazar').click();
    comprobar(!(await p.locator('#dlg-cookies').evaluate((d) => d.open)) && await guardado(p) === 'no', '«Rechazar» cierra el aviso y guarda la elección');
    await p.getByRole('button', { name: 'Entendido' }).click();
    await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
    comprobar(await p.locator('#mapa canvas').count() > 0, 'rechazando se usa la app igual (el mapa carga)');
    comprobar(clarity.length === 0 && !(await p.locator('script[src*="clarity"]').count()), 'rechazado: no se carga Clarity');
    await p.reload();
    await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
    comprobar(!(await p.locator('#dlg-cookies').evaluate((d) => d.open)) && clarity.length === 0, 'al recargar no vuelve a preguntar ni carga Clarity');

    // ---- cambiar en Ajustes › Cookies y aceptar
    await p.locator('.pestanas [data-p=p-ajustes]').click();
    comprobar(/rechazado/.test(await p.locator('#cookies-estado').textContent()), 'Ajustes › Cookies dice que está rechazado');
    await p.locator('#btn-cookies').click();
    await p.locator('#dlg-cookies[open]').waitFor();
    comprobar(await p.locator('#cookies-cerrar').isVisible(), 'desde Ajustes el aviso se puede cerrar sin cambiar nada');
    await p.locator('#cookies-aceptar').click();
    await p.waitForFunction(() => !!document.querySelector('script[src*="clarity.ms"]'), null, { timeout: 5000 });
    comprobar(await guardado(p) === 'si' && clarity.some((u) => u.includes(`clarity.ms/tag/${ID}`)), `«Aceptar» guarda la elección y carga el script de clarity.ms con el id (${clarity[0]})`);
    const cola = await p.evaluate(() => JSON.stringify(window.clarity?.q ?? []));
    comprobar(/consentv2/.test(cola) && /"analytics_Storage":"granted"/.test(cola), `se avisa a Clarity del consentimiento: ${cola.slice(0, 120)}`);
    comprobar(/aceptado/.test(await p.locator('#cookies-estado').textContent()), 'Ajustes › Cookies dice que está aceptado');
    const antes = clarity.length;
    await p.reload();
    await p.waitForFunction(() => !!document.querySelector('script[src*="clarity.ms"]'), null, { timeout: 10000 });
    comprobar(clarity.length > antes && !(await p.locator('#dlg-cookies').evaluate((d) => d.open)), 'aceptado: al recargar carga Clarity sin volver a preguntar');
    await ctx.close();
  }

  // ---- enmascarado de los campos de texto libre
  {
    const { ctx, p } = await contexto(false);
    await p.goto(URL_APP);
    const m = await p.evaluate(() => ['#chat-texto', '#chat-mensajes', '#lista-sitios', '#lista-rutas', '#guia-buscar', '#frm-sitio textarea[name=nota]']
      .map((s) => [s, document.querySelector(s)?.getAttribute('data-clarity-mask')]));
    comprobar(m.every(([, v]) => v === 'true'), `campos de texto libre con data-clarity-mask: ${m.map(([s, v]) => `${s}=${v}`).join(' ')}`);
    await ctx.close();
  }
  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  if (fallos.length) throw new Error(`Falla (${fallos.length}):\n- ${fallos.join('\n- ')}`);
  console.log('e2e clarity OK');
} finally {
  await nav.close();
}
