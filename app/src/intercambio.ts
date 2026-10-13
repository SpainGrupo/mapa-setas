import type { Sitio } from './tipos';

const NS = 'https://setas.local/gpx/1';

export function nuevoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const estrellasTxt = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** GPX 1.1 con un wpt por sitio; name/desc legibles en OsmAnd o Locus y extensión propia para volver a importar. */
export function aGPX(sitios: Sitio[], nombres: Record<string, string> = {}): string {
  const wpts = sitios.map((s) => {
    const nombre = `${estrellasTxt(s.estrellas)} ${nombres[s.especie] ?? (s.especie || 'Sitio')}`;
    return `  <wpt lat="${s.lat}" lon="${s.lon}">
    <time>${esc(s.fecha)}</time>
    <name>${esc(nombre)}</name>
    <desc>${esc(s.nota)}</desc>
    <extensions><setas:sitio id="${esc(s.id)}" estrellas="${s.estrellas}" especie="${esc(s.especie)}"/></extensions>
  </wpt>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mapa de setas" xmlns="http://www.topografix.com/GPX/1/1" xmlns:setas="${NS}">
${wpts}
</gpx>
`;
}

export function deGPX(texto: string): Sitio[] {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'gpx') {
    throw new Error('El archivo no es un GPX válido.');
  }
  const hijo = (el: Element, n: string) => [...el.children].find((c) => c.localName === n)?.textContent ?? '';
  return [...doc.getElementsByTagNameNS('*', 'wpt')].map((w) => {
    const ext = w.getElementsByTagNameNS(NS, 'sitio')[0];
    const lat = Number(w.getAttribute('lat'));
    const lon = Number(w.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Punto sin coordenadas válidas.');
    const fecha = hijo(w, 'time') || new Date().toISOString();
    if (ext) {
      const e = Number(ext.getAttribute('estrellas'));
      return { id: ext.getAttribute('id') || nuevoId(), lat, lon, estrellas: (e >= 1 && e <= 3 ? e : 1) as 1 | 2 | 3,
        nota: hijo(w, 'desc'), especie: ext.getAttribute('especie') ?? '', fecha };
    }
    const nota = [hijo(w, 'name'), hijo(w, 'desc')].filter(Boolean).join(' — ');
    return { id: nuevoId(), lat, lon, estrellas: 1 as const, nota, especie: '', fecha };
  });
}

async function aBase64(b: Blob): Promise<string> {
  const u = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

function deBase64(b64: string, tipo: string): Blob {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Blob([u], { type: tipo });
}

export async function aJSON(sitios: Sitio[]): Promise<string> {
  const lista = await Promise.all(sitios.map(async ({ foto, ...s }) =>
    foto ? { ...s, foto: { tipo: foto.type || 'image/jpeg', base64: await aBase64(foto) } } : s));
  return JSON.stringify({ formato: 'mapa-setas', version: 1, exportado: new Date().toISOString(), sitios: lista }, null, 1);
}

export function deJSON(texto: string): Sitio[] {
  const d = JSON.parse(texto);
  if (d?.formato !== 'mapa-setas' || !Array.isArray(d.sitios)) throw new Error('El JSON no es una copia de Mis sitios.');
  return d.sitios.map((s: Sitio & { foto?: { tipo: string; base64: string } }) => {
    const { foto, ...resto } = s;
    return foto ? { ...resto, foto: deBase64(foto.base64, foto.tipo) } : resto;
  });
}
