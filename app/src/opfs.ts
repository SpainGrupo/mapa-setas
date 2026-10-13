import type { Manifest } from './tipos';

const CLAVE = 'setas:mapas-descargados';
const CLAVE_STAGING = 'setas:mapas-nuevo-generado';   // versión (manifest.generado) que hay a medias en staging
const DIR = 'mapas';
const DIR_NUEVO = 'mapas-nuevo';
export interface EstadoDescarga { fecha: string; bytes: number; generado: string; archivos: Record<string, number> }

export function estadoDescarga(): EstadoDescarga | null {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); } catch { return null; }
}

/** El archivo descargado, solo si la descarga terminó y el tamaño cuadra. */
export async function archivoOpfs(nombre: string): Promise<File | null> {
  const est = estadoDescarga();
  if (!est || !(nombre in est.archivos) || !navigator.storage?.getDirectory) return null;
  try {
    const raiz = await navigator.storage.getDirectory();
    const f = await (await (await raiz.getDirectoryHandle(DIR)).getFileHandle(nombre)).getFile();
    return f.size === est.archivos[nombre] ? f : null;
  } catch { return null; }
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Ejecuta fn hasta `intentos` veces, esperando espera(i) ms tras el fallo i (backoff). */
export async function conReintentos<T>(fn: (intento: number) => Promise<T>, intentos = 3,
  espera: (i: number) => number = (i) => 1000 * 2 ** i, pausa: (ms: number) => Promise<void> = dormir): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(i); } catch (e) {
      if (i >= intentos - 1) throw e;
      await pausa(espera(i));
    }
  }
}

function trabajador(orden: object, alAvanzar: (b: number) => void = () => {}): Promise<number> {
  return new Promise((ok, mal) => {
    const w = new Worker(new URL('./descarga.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'progreso') alAvanzar(m.bytes);
      else { w.terminate(); m.tipo === 'hecho' ? ok(m.bytes) : mal(new Error(m.mensaje)); }
    };
    w.onerror = (e) => { w.terminate(); mal(new Error(e.message || 'Error en la descarga')); };
    w.postMessage(orden);
  });
}

async function tamano(dir: FileSystemDirectoryHandle, nombre: string): Promise<number> {
  try { return (await (await dir.getFileHandle(nombre)).getFile()).size; } catch { return -1; }
}

/**
 * Descarga a un directorio de staging ('mapas-nuevo'); el mapa sigue leyendo los archivos y el estado
 * antiguos hasta que TODO está bajado. Solo entonces se mueven al directorio definitivo y se escribe el
 * estado nuevo. Si algo falla se borra el staging y los mapas antiguos quedan intactos. Si la página se
 * cerró a medias, la siguiente descarga de la misma versión reaprovecha los archivos completos del staging.
 */
export async function descargarMapas(m: Manifest, base: string, alAvanzar: (hecho: number, total: number) => void) {
  const persistente = await navigator.storage.persist?.().catch(() => false) ?? false;
  const raiz = await navigator.storage.getDirectory();
  const borrarStaging = async () => {
    await raiz.removeEntry(DIR_NUEVO, { recursive: true }).catch(() => {});
    localStorage.removeItem(CLAVE_STAGING);
  };
  if (localStorage.getItem(CLAVE_STAGING) !== m.generado) await borrarStaging();
  localStorage.setItem(CLAVE_STAGING, m.generado);
  const nuevo = await raiz.getDirectoryHandle(DIR_NUEVO, { create: true });

  const lista = [...m.archivos, { nombre: 'manifest.json', bytes: 0 }];
  const total = m.total_bytes;
  let hecho = 0;
  const archivos: Record<string, number> = {};
  try {
    for (const a of lista) {
      if (a.bytes > 0 && await tamano(nuevo, a.nombre) === a.bytes) {
        archivos[a.nombre] = a.bytes;
      } else {
        archivos[a.nombre] = await conReintentos(async () => {
          let parcial = 0;
          const n = await trabajador({ tipo: 'descargar', url: base + a.nombre, nombre: a.nombre, dir: DIR_NUEVO },
            (b) => { parcial += b; alAvanzar(hecho + parcial, total); });
          if (a.bytes > 0 && n !== a.bytes) throw new Error(`${a.nombre} incompleto (${n} de ${a.bytes} bytes)`);
          return n;
        });
      }
      hecho += archivos[a.nombre];
      alAvanzar(hecho, total);
    }
    // Todo bajado: a partir de aquí el estado antiguo deja de valer (los archivos van a cambiar).
    localStorage.removeItem(CLAVE);
    await trabajador({ tipo: 'mover', desde: DIR_NUEVO, hacia: DIR, nombres: lista.map((a) => a.nombre) });
  } catch (e) {
    await borrarStaging();
    throw e;
  }
  const est: EstadoDescarga = { fecha: new Date().toISOString(), bytes: hecho, generado: m.generado, archivos };
  localStorage.setItem(CLAVE, JSON.stringify(est));
  await borrarStaging();
  return { estado: est, persistente };
}

export async function borrarMapas() {
  localStorage.removeItem(CLAVE);
  localStorage.removeItem(CLAVE_STAGING);
  const raiz = await navigator.storage.getDirectory();
  await raiz.removeEntry(DIR, { recursive: true }).catch(() => {});
  await raiz.removeEntry(DIR_NUEVO, { recursive: true }).catch(() => {});
}
