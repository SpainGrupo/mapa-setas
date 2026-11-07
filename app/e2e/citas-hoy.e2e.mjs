// e2e de las citas en el Top de «Hoy» (2026-10-17): una fila del Top muestra «Citado: …» y al pulsarla se despliega la
// lista de fuentes con al menos un enlace (target=_blank rel=noopener) y su atribución · licencia, más el aviso de las
// citas. También comprueba que Marbella trae factor_citas en sitios.json y que nada de lo nuevo dice «comestible».
// Indicador «≈N× la media · top X % hoy» (2026-10-20): formato, N del tramo de cada sitio, ayuda «?» y móvil a 375 px.
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const URL_APP = BASE + '?e2e=1&hoy=2026-10-14';
const CAPTURAS = join(AQUI, 'capturas'); mkdirSync(CAPTURAS, { recursive: true });
const PROHIBIDO = /comestib|se puede comer/i;
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const sitios = await (await fetch(new URL('data/marbella/sitios.json', BASE))).json();
const conCitas = Object.values(sitios.especies).flat().filter((s) => s.citas);
comprobar(sitios.version >= 2 && typeof sitios.factor_citas === 'boolean' && conCitas.length > 0
  && conCitas.every((s) => s.citas.n >= 1 && ['punto', 'paraje'].includes(s.citas.nivel) && s.citas.refs.length <= 10),
  `sitios.json de Marbella v${sitios.version}: factor_citas ${sitios.factor_citas}, ${conCitas.length} sitios con citas`);

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], geolocation: { latitude: 36.589, longitude: -5.244 }, permissions: ['geolocation'],
  locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));   // el tiempo no es objeto de este e2e
await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
try {
  await p.goto(URL_APP);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 15000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForSelector('#top-general .top-fila');
  comprobar(await p.evaluate(() => window.__setas.tops().factorCitas) === sitios.factor_citas,
    `la pestaña Hoy lee factor_citas (${sitios.factor_citas})`);
  // «Mejor monte público» (2026-10-20): solo si ninguna fila del top general cae en monte público.
  const t0 = await p.evaluate(() => window.__setas.tops());
  const hayPublico = t0.general.some((f) => f.titularidad !== 'privado');
  const filaPub = p.locator('#hoy-publico .top-fila');
  if (hayPublico) comprobar(await p.locator('#hoy-publico').isHidden() && t0.publico === null, 'el top trae monte público: sin bloque «Mejor monte público»');
  else {
    const sPub = Object.values(sitios.especies).flat().find((s) => s.id === t0.publico?.id);
    comprobar(t0.publico && await p.locator('#hoy-publico').isVisible() && await filaPub.count() === 1
      && Number(await filaPub.getAttribute('data-id')) === t0.publico.id && t0.publico.estado !== 'rojo'
      && ['monte_junta', 'monte_municipal'].includes(await filaPub.getAttribute('data-titularidad')) && sPub && !sPub.restringido
      && /^Puntuación \d+\/100 por /.test(await filaPub.locator('.tf-razon').textContent())
      && (await p.locator('#tit-top-publico').textContent()) === 'Mejor monte público',
      `top sin montes públicos → «Mejor monte público»: ${t0.publico?.especie} (${t0.publico?.estado}, ${await filaPub.getAttribute('data-titularidad')}) con su motivo`);
    await p.locator('#hoy-publico').scrollIntoViewIfNeeded();
    await p.screenshot({ path: join(CAPTURAS, 'hoy-mejor-publico.png') });
  }
  // Comodidad del terreno (sitios v5, umbrales por terciles de la región, 2026-11-07): chip corto relativo a la zona en cada
  // fila del top general y frase en su razón; la clase sale de los terciles que trae sitios.json, no de 40/80.
  const NOMBRE_TER = { comodo: 'Terreno cómodo', medio: 'Algo de sube y baja', quebrado: 'Terreno quebrado' };
  const um = sitios.terreno_umbrales;
  comprobar(um && um.metodo === 'terciles' && um.comodo > 0 && um.quebrado >= um.comodo && um.comodo % 5 === 0 && um.quebrado % 5 === 0,
    `sitios.json trae los terciles de la región (cómodo < ${um?.comodo}, quebrado > ${um?.quebrado} m/km)`);
  const claseDe = (km) => (km < um.comodo ? 'comodo' : km <= um.quebrado ? 'medio' : 'quebrado');
  const porIdT = new Map(Object.values(sitios.especies).flat().map((s) => [s.id, s]));
  const terr = await p.$$eval('#top-general .top-fila', (ls) => ls.map((l) => ({ id: Number(l.dataset.id), c: l.dataset.terreno, chip: l.querySelector('.tf-terreno')?.textContent ?? '',
    title: l.querySelector('.tf-terreno')?.getAttribute('title') ?? '', rz: l.querySelector('.tf-razon')?.textContent ?? '' })));
  comprobar(terr.length > 0 && terr.every((f) => {
    const km = porIdT.get(f.id)?.terreno?.desnivel_km;
    return km !== undefined && f.c === claseDe(km) && f.chip === `${NOMBRE_TER[f.c]} para la zona · ${km.toLocaleString('es-ES')} m/km`
      && f.rz.includes(`${NOMBRE_TER[f.c]} para la zona · `) && /relativo a la región/.test(f.title) && f.title.includes(`menos de ${um.comodo} m/km`) && !PROHIBIDO.test(f.rz);
  }) && t0.general.every((g, i) => g.terreno === terr[i].c),
    `comodidad del terreno en las ${terr.length} filas del top general (${[...new Set(terr.map((f) => f.c))].join(', ')}): «${terr[0]?.chip}»`);
  // Indicador «≈N× la media · top X % hoy» (indicador.ts, 2026-10-20): en cada fila de los tops, con ayuda «?».
  const IND = /^(?:.+ · )?(?:≈\d+(?:,\d)?× la media|sin validar) · top \d{1,3}\s% hoy$/;
  const vc = sitios.validacion?.amanita_caesarea;
  comprobar(vc && typeof vc.calibrado === 'boolean' && vc.tramos.length === 4 && vc.tramos.every((t) => 'lift' in t && Number.isInteger(t.obs)),
    `sitios.json trae validacion (A. caesarea: calibrado ${vc?.calibrado}, ${vc?.tramos.length} tramos)`);
  const filasG = await p.$$eval('#top-general .top-fila', (ls) => ls.map((l) => [...l.querySelectorAll('.tf-ind')].map((x) => x.textContent)));
  comprobar(filasG.length > 0 && filasG.every((f) => f.length >= 1 && f.every((t) => IND.test(t))),
    `indicador en las ${filasG.length} filas del top general («${filasG[0]?.[0]}»)`);
  await p.locator('#hoy-especie').selectOption('amanita_caesarea');
  await p.waitForFunction(() => window.__setas.tops().especie === 'amanita_caesarea');
  const filasC = await p.$$eval('#top-especie .top-fila', (ls) => ls.map((l) => ({ id: Number(l.dataset.id), t: l.querySelector('.tf-ind')?.textContent ?? '' })));
  const esperado = (s) => {
    const t = vc.calibrado ? vc.tramos.find((x) => s.punt_media >= x.desde && s.punt_media < x.hasta) : null;
    const n = t && t.obs >= 3 && t.lift !== null ? t.lift : null;
    return n === null ? 'sin validar' : `≈${Math.round(n * 10) / 10 < 10 ? n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(n)}× la media`;
  };
  const porId = new Map(sitios.especies.amanita_caesarea.map((s) => [s.id, s]));
  comprobar(filasC.length > 0 && filasC.every((f) => IND.test(f.t) && f.t.startsWith(esperado(porId.get(f.id)) + ' · top ')),
    `top de A. caesarea: N del tramo de cada sitio («${filasC[0]?.t}»)`);
  const pcts = filasC.map((f) => Number(f.t.match(/top (\d+)/)[1]));
  comprobar(pcts[0] >= 1 && pcts.every((x, i) => !i || pcts[i - 1] <= x), `top X % crece con el puesto (${pcts.join(', ')})`);
  const caja = p.locator('#top-especie .top-fila .tf-indicador').first();
  const btAyuda = caja.locator('.tf-ind-ayuda');
  comprobar(await caja.locator('.tf-ind').getAttribute('title').then((t) => /^No es un % de probabilidad\./.test(t ?? ''))
    && await caja.locator('.tf-ind-nota').isHidden() && await btAyuda.getAttribute('aria-expanded') === 'false',
    'el indicador lleva la ayuda en title y la nota plegada');
  // El indicador va dentro de «Por qué este sitio», plegado: se abre primero.
  const porque = p.locator('#top-especie .top-fila .tf-porque').first();
  comprobar(!(await porque.evaluate((d) => d.open)) && await porque.locator('summary').innerText() === 'Por qué este sitio', '«Por qué este sitio» empieza plegado');
  await porque.locator('summary').click();
  await btAyuda.click();
  const nota = caja.locator('.tf-ind-nota');
  await nota.waitFor({ state: 'visible' });
  const textoNota = await nota.innerText();
  comprobar(await btAyuda.getAttribute('aria-expanded') === 'true' && /^No es un % de probabilidad\./.test(textoNota)
    && /«Top \d+\s% hoy» quiere decir que hoy este sitio está entre el \d+\s% mejor puntuado de la región para esta seta\./.test(textoNota)
    && /«Sin validar»: no hay hallazgos suficientes para comprobarlo\./.test(textoNota) && !PROHIBIDO.test(textoNota),
    'el botón «?» despliega la nota: no es un % de probabilidad, top X %, sin validar; sin «comestible»');
  await p.setViewportSize({ width: 375, height: 812 });
  await caja.scrollIntoViewIfNeeded();
  const desborda = await p.$$eval('#p-hoy .top-fila', (ls) => ls.some((l) => {
    const r = l.getBoundingClientRect();
    return [...l.querySelectorAll('.tf-indicador, .tf-indicador > *')].some((x) => { const b = x.getBoundingClientRect(); return b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5); });
  }) || document.documentElement.scrollWidth > window.innerWidth);
  comprobar(!desborda, 'a 375 px el indicador y su nota caben en la fila (sin scroll horizontal)');
  await p.screenshot({ path: join(CAPTURAS, 'hoy-indicador-375.png') });
  await btAyuda.click();
  comprobar(await nota.isHidden(), 'volver a pulsar «?» pliega la nota');
  await p.setViewportSize(devices['Pixel 7'].viewport);
  // Una seta cuyo top 10 tenga algún sitio con citas.
  const ids = await p.$$eval('#hoy-especie option', (os) => os.map((o) => o.value).filter((v) => !v.startsWith('grupo:')));
  let especie = null;
  for (const id of ids) {
    await p.locator('#hoy-especie').selectOption(id);
    await p.waitForFunction((e) => window.__setas.tops().especie === e, id);
    if (await p.locator('#top-especie .tf-citado').count()) { especie = id; break; }
  }
  comprobar(especie, `el top de ${especie} tiene filas con «Citado: …»`);
  const fila = p.locator('#top-especie .top-fila:has(.tf-citado)').first();
  const etiqueta = (await fila.locator('.tf-citado').first().textContent()).trim();
  comprobar(/^Citado: .+ \(\d+ citas?(, última \d{4})?\)$/.test(etiqueta) && await fila.locator('.tf-fuentes').first().isHidden(),
    `etiqueta «${etiqueta}» con la lista plegada`);
  const tops = await p.evaluate(() => window.__setas.tops());
  const idFila = Number(await fila.getAttribute('data-id'));
  comprobar(tops.top.some((e) => e.id === idFila && e.citas && e.citas.n >= 1), 'la fila corresponde a un sitio con citas en tops()');
  await fila.locator('.tf-citado').first().click();
  const lista = fila.locator('.tf-fuentes').first();
  await lista.waitFor({ state: 'visible' });
  const enlaces = await lista.locator('a').evaluateAll((as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel, t: a.textContent })));
  const atrib = await lista.locator('.tf-fuente-atrib').allTextContents();
  const textoLista = await lista.innerText();
  comprobar(await fila.locator('.tf-citado').first().getAttribute('aria-expanded') === 'true' && enlaces.length >= 1
    && enlaces.every((a) => /^https?:\/\//.test(a.href) && a.target === '_blank' && /noopener/.test(a.rel))
    && atrib.some((t) => t.trim() && t.trim() !== '—'),
    `al pulsarla: ${enlaces.length} enlace(s) de fuente (target=_blank, noopener) y atribución «${atrib[0]}»`);
  comprobar(/no dice que se pueda recoger ahí ni que se pueda consumir/.test(textoLista) && /precisión/.test(textoLista) && /del sitio/.test(textoLista),
    'la lista lleva fecha, precisión, distancia y el aviso de las citas');
  await lista.scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'hoy-citas.png') });
  const nuevos = await p.$$eval('.tf-citas', (cs) => cs.map((c) => c.innerText).join('\n'));
  comprobar(!PROHIBIDO.test(nuevos), 'nada de lo nuevo dice «comestible»');
  await fila.locator('.tf-citado').first().click();
  comprobar(await lista.isHidden(), 'volver a pulsar pliega la lista');
  // Orden compartido de los tops y razón de cada sitio (2026-10-18).
  const nControles = await p.$$eval('#p-hoy ol.tops:not(#top-publico)', (ols) => ols.filter((o) => o.previousElementSibling?.classList.contains('orden-top')).length);
  const nListas = await p.$$eval('#p-hoy ol.tops:not(#top-publico)', (ols) => ols.length);
  comprobar(nControles === nListas && nListas >= 2, `control «Ordenar por» delante de los ${nListas} listados de Hoy`);
  const razones = await p.$$eval('#p-hoy .top-fila .tf-razon', (rs) => rs.map((r) => r.textContent));
  comprobar(razones.length > 0 && razones.every((r) => /^Puntuación \d+\/100 por /.test(r)) && !razones.some((r) => PROHIBIDO.test(r)),
    `cada sitio lleva su razón (${razones.length}), sin «comestible»`);
  await p.locator('#top-especie').locator('xpath=preceding-sibling::div[1]').getByRole('button', { name: 'Dificultad a pie' }).click();
  const ORD = ['facil', 'moderada', 'dificil', 'muy_dificil'];
  const difs = await p.$$eval('#top-especie .top-fila', (ls) => ls.map((l) => l.dataset.dificultad));
  const ordenes = await p.$$eval('#p-hoy ol.tops:not(#top-publico)', (ols) => ols.map((o) => o.dataset.orden));
  comprobar(difs.every((d, i) => !i || ORD.indexOf(difs[i - 1]) <= ORD.indexOf(d)) && ordenes.every((o) => o === 'dificultad'),
    `ordenar por dificultad reordena todos los listados (${difs.join(',')})`);
  await p.locator('#top-especie').locator('xpath=preceding-sibling::div[1]').getByRole('button', { name: 'Probabilidad' }).click();
  const pts = await p.$$eval('#top-especie .top-fila', (ls) => ls.map((l) => Number(l.dataset.puntuacion)));
  comprobar(pts.every((x, i) => !i || pts[i - 1] >= x), 'volver a probabilidad: puntuación de mayor a menor');
  // Filtro por grupo (grupos.ts, 2026-10-18): «Boletus: todo el grupo» combina las cuatro y desduplica a 300 m.
  const og = await p.$$eval('#hoy-especie optgroup', (gs) => gs.map((g) => g.label));
  comprobar(og.length >= 5 && og[0] === 'Boletus', `selector Seta con ${og.length} grupos (${og.join(', ')})`);
  await p.locator('#hoy-especie').selectOption('grupo:boletus');
  await p.waitForFunction(() => window.__setas.tops().especie === 'grupo:boletus');
  const espFilas = await p.$$eval('#top-especie .top-fila', (ls) => ls.map((l) => l.dataset.especies.split(' ')));
  comprobar(espFilas.length > 0 && espFilas.flat().every((e) => e.startsWith('boletus_')) && new Set(espFilas.flat()).size >= 2
    && await p.locator('#hoy-ver-ficha').isHidden(),
    `top del grupo Boletus: ${espFilas.length} filas con ${[...new Set(espFilas.flat())].join(', ')}, sin «Ver ficha»`);
  const indG = await p.$$eval('#top-especie .top-fila', (ls) => ls.map((l) => l.querySelectorAll('.tf-indicador').length));
  comprobar(indG.every((x) => x >= 1), 'indicador en cada fila del top del grupo');
  await p.locator('#tit-top-especie').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'hoy-grupo-boletus.png'), fullPage: false });
  // «Exportar día» (exportar-dia.ts): ruta de Google Maps, KML con los sitios del top y sin «comestible».
  comprobar(await p.locator('#hoy-exportar').isVisible(), 'botón «Exportar día» en Hoy');
  await p.locator('#hoy-exportar').click();
  await p.waitForSelector('#exportar-dia:not([hidden]) #exportar-kml');
  const nExp = Math.min(10, espFilas.length);
  const ruta = new URL(await p.locator('#exportar-ruta').getAttribute('href'));
  const nParadas = ruta.searchParams.get('waypoints')?.split('|').length ?? 0;
  comprobar(ruta.href.startsWith('https://www.google.com/maps/dir/?api=1') && ruta.searchParams.get('travelmode') === 'driving'
    && [null, '36.58900,-5.24400'].includes(ruta.searchParams.get('origin')) && nParadas === nExp - 1 && nParadas <= 9
    && await p.locator('.exportar-lista a[href^="https://www.google.com/maps/search/?api=1&query="]').count() === nExp,
    `ruta de Google Maps (origin ${ruta.searchParams.get('origin') ?? 'sin GPS en la app'}) con ${nParadas} paradas + destino y ${nExp} enlaces por sitio`);
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.locator('#exportar-kml').click()]);
  const kml = readFileSync(await descarga.path(), 'utf8');
  const idsTop = await p.evaluate(() => window.__setas.tops().top.map((x) => x.id));
  const coords = (kml.match(/<coordinates>[^<]+<\/coordinates>/g) ?? []);
  comprobar(/^setas \d\d\.\d\d\.\d\d\.kml$/.test(descarga.suggestedFilename()) && (kml.match(/<Placemark>/g) ?? []).length === nExp
    && coords.length === nExp && idsTop.length >= nExp && kml.includes('<name>1 · Boletus') && kml.includes('Titularidad: P')
    && kml.includes('No consumas ninguna seta sin confirmación de un experto.') && !PROHIBIDO.test(kml),
    `KML «${descarga.suggestedFilename()}» con ${nExp} Placemarks y sin «comestible»`);
  comprobar(!PROHIBIDO.test(await p.locator('#exportar-dia').innerText()) && await p.locator('#exportar-dia').getByText('Importar', { exact: false }).count() > 0,
    'panel de exportar con ayuda de My Maps y sin «comestible»');
  await p.locator('#hoy-especie').selectOption(especie);
  await p.waitForFunction((e) => window.__setas.tops().especie === e, especie);
  // Top de la ficha de la guía.
  const espTop = await p.$eval('#hoy-especie', (s) => s.value);
  await p.evaluate(() => document.querySelector('#top-especie .tf-especie')?.click());
  await p.waitForSelector('#top-guia .top-fila', { timeout: 10000 });
  const nGuia = await p.$$eval('#top-guia .top-fila', (ls) => ls.length);
  const nCand = (sitios.especies[espTop] ?? []).length;
  comprobar(nGuia <= 7 && (nGuia >= Math.min(5, nCand) || nCand < 5) && await p.locator('#top-guia').locator('xpath=preceding-sibling::div[1]').getAttribute('class') === 'orden-top',
    `ficha de ${espTop}: Top de ${nGuia} sitios con control de orden`);
  const indGuia = await p.$$eval('#top-guia .top-fila .tf-ind', (xs) => xs.map((x) => x.textContent));
  comprobar(indGuia.length === nGuia && indGuia.every((t) => IND.test(t)), `indicador en los ${nGuia} sitios del Top de la ficha («${indGuia[0]}»)`);
  await p.screenshot({ path: join(CAPTURAS, 'guia-top-sitios.png'), fullPage: false });
  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  // «Mejor monte público» forzado: sitios.json con todo privado salvo un sitio flojo en monte público.
  const unico = Object.values(sitios.especies).flat().filter((s) => !s.restringido && s.t_pie_min <= 30).sort((a, b) => a.punt_media - b.punt_media)[0];
  const priv = structuredClone(sitios);
  for (const l of Object.values(priv.especies)) for (const s of l) s.titularidad = s.id === unico.id ? { clase: 'monte_junta', monte: 'Monte de prueba' } : { clase: 'privado' };
  const ctx2 = await nav.newContext({ ...devices['Pixel 7'], geolocation: { latitude: 36.589, longitude: -5.244 }, permissions: ['geolocation'],
    locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
  await ctx2.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));
  await ctx2.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx2.route('**/data/marbella/sitios.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(priv) }));
  const p2 = await ctx2.newPage();
  await p2.goto(URL_APP);
  const b2 = p2.getByRole('button', { name: 'Entendido' });
  if (await b2.isVisible({ timeout: 15000 }).catch(() => false)) await b2.click();
  await p2.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p2.locator('.pestanas [data-p=p-hoy]').click();
  await p2.waitForSelector('#hoy-publico:not([hidden]) .top-fila', { timeout: 20000 });
  const t2 = await p2.evaluate(() => window.__setas.tops());
  const fp = p2.locator('#hoy-publico .top-fila');
  comprobar(t2.general.length > 0 && t2.general.every((f) => f.titularidad === 'privado') && t2.publico?.id === unico.id
    && await fp.count() === 1 && await fp.getAttribute('data-titularidad') === 'monte_junta'
    && /^Puntuación \d+\/100 por /.test(await fp.locator('.tf-razon').textContent())
    && /Monte de prueba/.test(await fp.locator('.tf-titularidad').textContent())
    && /Ningún sitio de arriba cae en monte público/.test(await p2.locator('#hoy-publico-nota').textContent())
    && !PROHIBIDO.test(await p2.locator('#hoy-publico').innerText()),
    `top todo privado → «Mejor monte público» con el único sitio público (${t2.publico?.especie}, ${t2.publico?.estado}) y su motivo`);
  await p2.locator('#hoy-publico').scrollIntoViewIfNeeded();
  await p2.screenshot({ path: join(CAPTURAS, 'hoy-mejor-publico.png') });
  console.log('e2e de citas en Hoy: OK');
} finally {
  await nav.close();
}
