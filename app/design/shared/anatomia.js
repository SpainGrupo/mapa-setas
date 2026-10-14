/*
 * Shared anatomy drawings for the "Mapa de setas" direction prototypes.
 * Clean line illustrations, one idea per drawing, legible at 110–180 px wide.
 *
 * Usage: <div data-anat="volva-saco"></div>  → filled on DOMContentLoaded.
 * Theming (set on any ancestor):
 *   --anat-ink    line colour            (default: currentColor)
 *   --anat-paper  fill of white tissue   (default: #fbfaf6)
 *   --anat-soil   soil tint              (default: rgba(120,90,60,.16))
 *   --anat-shade  interior/shadow tint   (default: rgba(0,0,0,.10))
 * Colours that carry meaning (orange cap, yellow gills, blue flesh, olive) are fixed:
 * they are data, not decoration, and must not be themed away.
 *
 * Accuracy notes (from guia/especies.json):
 *  - A. caesarea: volva blanca membranosa en saco; láminas, pie y anillo amarillos; huevo cortado
 *    → sombrero naranja + láminas amarillas; pie amarillo por fuera, blanco en el centro.
 *  - A. phalloides / A. verna: volva en saco; láminas blanco puro; huevo cortado blanco (a veces verdoso).
 *  - A. muscaria: sin saco; la volva queda como verrugas en anillos incompletos sobre el bulbo.
 *  - Macrolepiota procera: anillo doble, grueso, móvil; pie con bandas "piel de serpiente".
 *  - Cantharellus: pliegues (no láminas) gruesos, bifurcados, decurrentes.
 *  - Boletus edulis/aereus/reticulatus: retículo en el pie; poros; carne que no cambia.
 *    Caloboletus / Rubroboletus: carne que azulea al corte.
 */
(function () {
  const INK = 'var(--anat-ink, currentColor)';
  const PAPER = 'var(--anat-paper, #fbfaf6)';
  const SOIL = 'var(--anat-soil, rgba(120,90,60,.16))';
  const SHADE = 'var(--anat-shade, rgba(0,0,0,.10))';
  const C = {
    orange: '#E0661B', yellow: '#F2C12E', paleYellow: '#F7DE86', olive: '#A3A86A',
    oliveLine: '#7F8650', brown: '#8A5A33', blue: '#2F62B0', blueSoft: '#8FB0E3', white: '#FBFAF6',
  };
  const W = 2.4; // main stroke
  const w = 1.4; // detail stroke
  const svg = (vb, body, label) =>
    `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" ` +
    `fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round" ` +
    `style="width:100%;height:auto;display:block;overflow:visible">${body}</svg>`;
  const ground = (y) =>
    `<rect x="4" y="${y}" width="152" height="${160 - y}" fill="${SOIL}" stroke="none"/>` +
    `<path d="M4 ${y} H156" stroke-width="${w}" stroke-dasharray="1 5"/>`;

  // ---------- VOLVA ----------
  const volvaSaco = svg('0 0 160 160', [
    ground(112),
    // opening of the sac (back rim, shaded interior)
    `<ellipse cx="80" cy="82" rx="27" ry="7" fill="${SHADE}"/>`,
    // stipe entering the sac
    `<path d="M69 4 V84 H91 V4" fill="${PAPER}" stroke="none"/>`,
    `<path d="M69 4 V84 M91 4 V84"/>`,
    // free, torn lobes of the membrane standing away from the stipe
    `<path d="M55 84 C50 74 51 64 57 56 C61 64 63 72 65 82" fill="${PAPER}"/>`,
    `<path d="M95 82 C97 72 100 63 105 57 C110 65 110 75 105 84" fill="${PAPER}"/>`,
    // front of the sac (cup), covering the bulb
    `<path d="M53 82 A27 7 0 0 0 107 82 C111 116 102 147 80 147 C58 147 49 116 53 82 Z" fill="${PAPER}"/>`,
    // membrane thickness / folds
    `<path d="M60 96 C62 116 68 132 78 140" stroke-width="${w}"/>`,
    `<path d="M100 96 C99 114 94 128 86 138" stroke-width="${w}"/>`,
  ].join(''), 'Volva en saco: membrana blanca que envuelve la base como una bolsa, con el borde libre');

  const verrugas = [];
  // two incomplete rings of warts on the upper bulb + one bracelet on the stipe
  [[86, 0.95], [98, 1.0]].forEach(([y, s], r) => {
    for (let i = 0; i < 9; i++) {
      if ((i + r) % 4 === 3) continue; // incomplete ring
      const t = -1 + (2 * i) / 8;
      const x = 80 + t * (r ? 22 : 17) * s;
      const yy = y + Math.abs(t) * -3 + (r ? 2 : 0);
      verrugas.push(`<ellipse cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" rx="3.2" ry="2.4" fill="${PAPER}" stroke-width="${w}"/>`);
    }
  });
  for (let i = 0; i < 5; i++) verrugas.push(`<path d="M${71 + i * 4.5} 72 l2 -2" stroke-width="${w}"/>`);
  const volvaVerrugas = svg('0 0 160 160', [
    ground(118),
    `<path d="M69 4 V80 H91 V4" fill="${PAPER}" stroke="none"/>`,
    `<path d="M69 4 V80 M91 4 V80"/>`,
    // napiform bulb, no sac
    `<path d="M69 78 C57 84 51 102 57 116 C63 129 97 129 103 116 C109 102 103 84 91 78 Z" fill="${PAPER}"/>`,
    ...verrugas,
  ].join(''), 'Volva disociada: sin saco; quedan verrugas en anillos incompletos sobre el bulbo');

  // ---------- ANILLO ----------
  const capEdge = `<path d="M18 30 C40 12 120 12 142 30 L142 33 C120 40 40 40 18 33 Z" fill="${PAPER}"/>` +
    [30, 44, 58, 102, 116, 130].map((x) => `<path d="M${x} 35 L${x + (x < 80 ? 6 : -6)} 38" stroke-width="${w}"/>`).join('');
  const anilloFalda = svg('0 0 160 160', [
    `<path d="M70 36 C70 90 68 130 64 152 H96 C92 130 90 90 90 36" fill="${PAPER}"/>`,
    capEdge,
    // hanging skirt
    `<path d="M69 50 C61 58 54 72 52 90 C58 95 64 90 70 95 C76 90 84 96 90 95 C96 90 102 95 108 90 C106 72 99 58 91 50 Z" fill="${PAPER}"/>`,
    // striations on the upper face
    `<path d="M72 54 L66 70 M80 54 V71 M88 54 L94 70" stroke-width="${w}"/>`,
  ].join(''), 'Anillo membranoso: falda colgante unida al pie');

  const serpiente = (x0, x1, y0, y1, col) => {
    let d = '';
    for (let y = y0; y <= y1; y += 9) {
      const j = ((y * 7) % 5) - 2; // irregular
      d += `M${x0 + 1} ${y + j * 0.4} L${(x0 + x1) / 2 - 4} ${y + 5} L${(x0 + x1) / 2 + 2} ${y + 1 + j * 0.3} L${x1 - 1} ${y + 5 + j * 0.3} `;
    }
    return `<path d="${d}" stroke="${col}" stroke-width="2.6"/>`;
  };
  const anilloDoble = svg('0 0 160 160', [
    `<path d="M73 36 C73 90 72 130 66 148 C70 154 90 154 94 148 C88 130 87 90 87 36" fill="${PAPER}"/>`,
    serpiente(73, 87, 88, 140, C.brown),
    capEdge,
    // thick, double-edged collar, free from the stipe
    `<path d="M57 62 A23 6 0 0 0 103 62 V71 A23 6 0 0 1 57 71 Z" fill="${PAPER}"/>`,
    `<ellipse cx="80" cy="62" rx="23" ry="6" fill="${PAPER}"/>`,
    `<path d="M58 66.5 A23 6 0 0 0 102 66.5" stroke-width="${w}"/>`,
    // moves up and down
    `<path d="M122 50 V86 M117 56 L122 50 L127 56 M117 80 L122 86 L127 80" stroke-width="2"/>`,
  ].join(''), 'Anillo doble y móvil: collar grueso que se desliza por el pie');

  const anilloAusente = svg('0 0 160 160', [
    `<path d="M70 36 C70 90 68 130 64 152 H96 C92 130 90 90 90 36" fill="${PAPER}"/>`,
    capEdge,
    `<ellipse cx="80" cy="64" rx="18" ry="5" stroke-width="${w}" stroke-dasharray="2 4"/>`,
  ].join(''), 'Sin anillo: pie liso');

  // ---------- HIMENIO ----------
  const radial = (r0, r1, deg) => {
    const a = (deg * Math.PI) / 180;
    return `M${(80 + r0 * Math.cos(a)).toFixed(1)} ${(80 + r0 * Math.sin(a)).toFixed(1)} L${(80 + r1 * Math.cos(a)).toFixed(1)} ${(80 + r1 * Math.sin(a)).toFixed(1)} `;
  };
  let gills = '';
  for (let d = 0; d < 360; d += 9) gills += radial(17, 62, d);
  let lamellulae = '';
  for (let d = 4.5; d < 360; d += 9) lamellulae += radial(42, 62, d);
  const himenioLaminas = svg('0 0 160 160', [
    `<circle cx="80" cy="80" r="64" fill="${PAPER}"/>`,
    `<path d="${gills}" stroke-width="1.3"/>`,
    `<path d="${lamellulae}" stroke-width="1.1"/>`,
    `<circle cx="80" cy="80" r="12" fill="${SHADE}"/>`,
  ].join(''), 'Láminas: hojas finas en radios, vistas desde abajo');

  let pores = '';
  for (let y = 18; y <= 142; y += 7) {
    for (let x = 18; x <= 142; x += 7) {
      const xx = x + ((y / 7) % 2 ? 3.5 : 0);
      const r = Math.hypot(xx - 80, y - 80);
      if (r > 16 && r < 60) pores += `<circle cx="${xx}" cy="${y}" r="2.1"/>`;
    }
  }
  const himenioPoros = svg('0 0 160 160', [
    `<circle cx="80" cy="80" r="64" fill="${PAPER}"/>`,
    `<g stroke-width="1">${pores}</g>`,
    `<circle cx="80" cy="80" r="12" fill="${SHADE}"/>`,
  ].join(''), 'Poros: superficie como una esponja, vista desde abajo');

  let ridges = '';
  [-1, -0.72, -0.44, -0.16, 0.16, 0.44, 0.72, 1].forEach((t, i) => {
    const xm = 80 + t * 60; // at the margin
    const xs = 80 + t * 8;  // where it runs into the stem
    ridges += `M${xm.toFixed(1)} ${46 - Math.abs(t) * 4} C${(xm * 0.6 + xs * 0.4).toFixed(1)} 62 ${xs.toFixed(1)} 80 ${xs.toFixed(1)} 110 `;
    if (i % 2 === 0) { // forks near the margin
      const xf = xm + (t < 0 ? 9 : -9);
      ridges += `M${xf.toFixed(1)} ${44 - Math.abs(t) * 3} C${(xf + (t < 0 ? 3 : -3)).toFixed(1)} 52 ${(xm * 0.75 + xs * 0.25).toFixed(1)} 58 ${(xm * 0.7 + xs * 0.3).toFixed(1)} 60 `;
    }
  });
  const himenioPliegues = svg('0 0 160 160', [
    // funnel-shaped cap seen from the side, wavy margin
    `<path d="M16 42 C26 34 40 40 52 34 C66 28 94 28 108 34 C120 40 134 34 144 42 C132 60 102 80 90 112 L88 150 H72 L70 112 C58 80 28 60 16 42 Z" fill="${PAPER}"/>`,
    `<path d="${ridges}" stroke-width="1.5"/>`,
  ].join(''), 'Pliegues: venas gruesas, bifurcadas, que bajan por el pie');

  // ---------- HUEVO CORTADO ----------
  const huevo = (cuticle, capFlesh, gillsFill, stemOut, stemCore, label) => svg('0 0 160 180', [
    `<ellipse cx="80" cy="94" rx="54" ry="74" fill="${C.white}"/>`,
    `<ellipse cx="80" cy="96" rx="45" ry="64" stroke-width="${w}" stroke-dasharray="3 3"/>`,
    // cap: cuticle band + flesh
    `<path d="M42 78 C43 44 117 44 118 78 Z" fill="${cuticle}"/>`,
    `<path d="M48 78 C50 52 110 52 112 78 Z" fill="${capFlesh}" stroke-width="${w}"/>`,
    // gills band under the cap
    `<path d="M44 78 H116 L110 90 H50 Z" fill="${gillsFill}"/>`,
    `<path d="${[54, 61, 68, 75, 85, 92, 99, 106].map((x) => `M${x} 80 V88`).join(' ')}" stroke-width="1"/>`,
    // stem
    `<path d="M65 90 V146 C65 154 95 154 95 146 V90" fill="${stemOut}"/>`,
    `<path d="M73 92 V146 C76 149 84 149 87 146 V92 Z" fill="${stemCore}" stroke="none"/>`,
  ].join(''), label);
  const huevoCaesarea = huevo(C.orange, C.white, C.yellow, C.paleYellow, C.white,
    'Huevo de A. caesarea cortado de arriba abajo: piel del sombrero naranja y láminas amarillas');
  const huevoMortal = huevo('#D9DCC8', C.white, '#F4F4EE', C.white, C.white,
    'Huevo de A. phalloides o A. verna cortado: todo blanco, a veces verdoso bajo la piel');

  // ---------- PIE ----------
  let net = '';
  for (let k = -12; k <= 14; k++) {
    const x = 30 + k * 7;
    net += `M${x} 8 L${x + 23} 98 M${x + 23} 8 L${x} 98 `;
  }
  const pieReticulo = svg('0 0 160 160', [
    `<defs><clipPath id="anat-stipe"><path d="M60 8 C56 60 50 110 56 150 H104 C110 110 104 60 100 8 Z"/></clipPath></defs>`,
    `<path d="M60 8 C56 60 50 110 56 150 H104 C110 110 104 60 100 8 Z" fill="${PAPER}"/>`,
    `<g clip-path="url(#anat-stipe)"><path d="${net}" stroke-width="1.2"/></g>`,
    `<path d="M60 8 C56 60 50 110 56 150 H104 C110 110 104 60 100 8 Z"/>`,
  ].join(''), 'Pie con retículo: red fina en relieve sobre el pie');

  const pieSerpiente = (col, label) => svg('0 0 160 160', [
    `<path d="M71 6 C71 60 70 110 64 140 C62 150 98 150 96 140 C90 110 89 60 89 6" fill="${PAPER}"/>`,
    serpiente(71, 89, 14, 128, col),
    `<path d="M64 140 C62 150 98 150 96 140"/>`,
  ].join(''), label);
  const pieSerpienteParda = pieSerpiente(C.brown, 'Pie piel de serpiente: bandas pardas en zigzag (Macrolepiota)');
  const pieJaspeadoVerde = pieSerpiente(C.oliveLine, 'Pie blanco con jaspeado oliváceo en zigzag (A. phalloides)');

  // ---------- CARNE AL CORTE ----------
  const bolete = (dx, flesh, extra) => [
    `<path d="M${dx + 12} 62 C${dx + 12} 22 ${dx + 88} 22 ${dx + 88} 62 Z" fill="${flesh}"/>`,
    `<path d="M${dx + 14} 62 H${dx + 86} L${dx + 82} 74 H${dx + 18} Z" fill="${PAPER}"/>`,
    `<path d="${[22, 30, 38, 46, 54, 62, 70, 78].map((x) => `M${dx + x} 64 V72`).join(' ')}" stroke-width="1"/>`,
    `<path d="M${dx + 38} 74 C${dx + 33} 100 ${dx + 30} 128 ${dx + 36} 150 H${dx + 64} C${dx + 70} 128 ${dx + 67} 100 ${dx + 62} 74" fill="${flesh}"/>`,
    extra || '',
  ].join('');
  const carneAzulea = svg('0 0 200 160', [
    `<defs><linearGradient id="anat-blue" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${C.blue}"/><stop offset=".55" stop-color="${C.blueSoft}"/><stop offset="1" stop-color="#DCE6F5"/></linearGradient></defs>`,
    bolete(0, C.white),
    bolete(100, 'url(#anat-blue)'),
    `<path d="M88 100 H112 M106 95 L112 100 L106 105" stroke-width="2"/>`,
  ].join(''), 'Carne al corte: a la izquierda no cambia; a la derecha azulea en segundos');

  window.ANAT = {
    'volva-saco': { svg: volvaSaco, titulo: 'Volva en saco' },
    'volva-verrugas': { svg: volvaVerrugas, titulo: 'Volva en verrugas' },
    'anillo-falda': { svg: anilloFalda, titulo: 'Anillo membranoso' },
    'anillo-doble': { svg: anilloDoble, titulo: 'Anillo doble móvil' },
    'anillo-ausente': { svg: anilloAusente, titulo: 'Sin anillo' },
    'himenio-laminas': { svg: himenioLaminas, titulo: 'Láminas' },
    'himenio-poros': { svg: himenioPoros, titulo: 'Poros' },
    'himenio-pliegues': { svg: himenioPliegues, titulo: 'Pliegues' },
    'huevo-caesarea': { svg: huevoCaesarea, titulo: 'Huevo cortado: naranja y amarillo' },
    'huevo-mortal': { svg: huevoMortal, titulo: 'Huevo cortado: todo blanco' },
    'pie-reticulo': { svg: pieReticulo, titulo: 'Pie con retículo' },
    'pie-serpiente': { svg: pieSerpienteParda, titulo: 'Pie piel de serpiente' },
    'pie-jaspeado': { svg: pieJaspeadoVerde, titulo: 'Pie jaspeado en zigzag' },
    'carne-azulea': { svg: carneAzulea, titulo: 'Carne al corte' },
  };

  let uid = 0;
  function fill(root) {
    (root || document).querySelectorAll('[data-anat]').forEach((el) => {
      const a = window.ANAT[el.dataset.anat];
      if (!a) { el.textContent = '[' + el.dataset.anat + ']'; return; }
      // make ids unique per instance (clipPath / gradient)
      const n = ++uid;
      el.innerHTML = a.svg.replace(/anat-(stipe|blue)/g, `anat-$1-${n}`);
    });
  }
  window.ANAT_FILL = fill;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill());
  else fill();
})();
