import type { Manifest } from './tipos';

const CLAVE = 'setas:mapas-descargados';
export interface EstadoDescarga { fecha: string; bytes: number; generado: string; archivos: Record<string, number> }

export function estadoDescarga(): EstadoDescarga | null {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); } catch { return null; }
}

async function dirMapas() {
  const raiz = await navigator.storage.getDirectory();
  return raiz.getDirectoryHandle('mapas', { create: true });
}

/** El archivo descargado, solo si la descarga terminó y el tamaño cuadra. */
export async function archivoOpfs(nombre: string): Promise<File | null> {
  const est = estadoDescarga();
  if (!est || !(nombre in est.archivos) || !navigator.storage?.getDirectory) return null;
  try {
    const f = await (await (await dirMapas()).getFileHandle(nombre)).getFile();
    return f.size === est.archivos[nombre] ? f : null;
  } catch { return null; }
}

function descargarUno(url: string, nombre: string, alAvanzar: (b: number) => void): Promise<number> {
  return new Promise((ok, mal) => {
    const w = new Worker(new URL('./descarga.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'progreso') alAvanzar(m.bytes);
      else { w.terminate(); m.tipo === 'hecho' ? ok(m.bytes) : mal(new Error(m.mensaje)); }
    };
    w.onerror = (e) => { w.terminate(); mal(new Error(e.message || 'Error en la descarga')); };
    w.postMessage({ url, nombre });
  });
}

export async function descargarMapas(m: Manifest, base: string, alAvanzar: (hecho: number, total: number) => void) {
  localStorage.removeItem(CLAVE);
  const persistente = await navigator.storage.persist?.().catch(() => false) ?? false;
  const lista = [...m.archivos, { nombre: 'manifest.json', bytes: 0 }];
  const total = m.total_bytes;
  let hecho = 0;
  const archivos: Record<string, number> = {};
  for (const a of lista) {
    archivos[a.nombre] = await descargarUno(base + a.nombre, a.nombre, (b) => { hecho += b; alAvanzar(hecho, total); });
  }
  const est: EstadoDescarga = { fecha: new Date().toISOString(), bytes: hecho, generado: m.generado, archivos };
  localStorage.setItem(CLAVE, JSON.stringify(est));
  return { estado: est, persistente };
}

export async function borrarMapas() {
  localStorage.removeItem(CLAVE);
  const raiz = await navigator.storage.getDirectory();
  await raiz.removeEntry('mapas', { recursive: true }).catch(() => {});
}
