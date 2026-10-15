import type { Manifest, PaqueteModelo } from './tipos';
import { regionActiva } from './region';
import { dirDe, quitarRuta } from './opfs-rutas';

// Dos paquetes con el mismo mecanismo (staging + intercambio): los mapas de cada región y, aparte y opcional, el reconocedor.
interface Paquete { clave: string; claveStaging: string; dir: string; dirNuevo: string }
/** Mapas de una región: staging en mapas-nuevo/<region>, definitivos en mapas/<region>. */
export const paqueteMapas = (region: string): Paquete => ({
  clave: `setas:mapas-descargados:${region}`, claveStaging: `setas:mapas-nuevo-generado:${region}`,
  dir: `mapas/${region}`, dirNuevo: `mapas-nuevo/${region}`,
});
const MODELO: Paquete = { clave: 'setas:modelo-descargado', claveStaging: 'setas:modelo-nuevo-version', dir: 'modelo', dirNuevo: 'modelo-nuevo' };
/** `generado` = versión del paquete (manifest.generado en los mapas, paquete.version en el modelo). */
export interface EstadoDescarga { fecha: string; bytes: number; generado: string; archivos: Record<string, number> }

function estadoDe(p: Paquete): EstadoDescarga | null {
  try { return JSON.parse(localStorage.getItem(p.clave) ?? 'null'); } catch { return null; }
}
export const estadoDescarga = (region = regionActiva()) => estadoDe(paqueteMapas(region));
export const estadoModelo = () => estadoDe(MODELO);

/** El archivo descargado, solo si la descarga terminó y el tamaño cuadra. */
async function archivoDe(p: Paquete, nombre: string): Promise<File | null> {
  const est = estadoDe(p);
  if (!est || !(nombre in est.archivos) || !navigator.storage?.getDirectory) return null;
  try {
    const raiz = await navigator.storage.getDirectory();
    const f = await (await (await dirDe(raiz, p.dir)).getFileHandle(nombre)).getFile();
    return f.size === est.archivos[nombre] ? f : null;
  } catch { return null; }
}
export const archivoOpfs = (nombre: string, region = regionActiva()) => archivoDe(paqueteMapas(region), nombre);
export const archivoModelo = (nombre: string) => archivoDe(MODELO, nombre);

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

/** Orden 'mover' del worker de descarga sin limpiar el destino (la migración a regiones: si se cortó a medias,
 * lo ya movido se queda y en el siguiente arranque se mueve el resto). */
export const moverEnOpfs = (desde: string, hacia: string, nombres: string[]) =>
  trabajador({ tipo: 'mover', desde, hacia, nombres, limpiar: false }).then(() => {});

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
async function descargarPaquete(p: Paquete, version: string, lista: { nombre: string; bytes: number }[], total: number, base: string,
  alAvanzar: (hecho: number, total: number) => void) {
  const persistente = await navigator.storage.persist?.().catch(() => false) ?? false;
  const raiz = await navigator.storage.getDirectory();
  const borrarStaging = async () => {
    await quitarRuta(raiz, p.dirNuevo);
    localStorage.removeItem(p.claveStaging);
  };
  if (localStorage.getItem(p.claveStaging) !== version) await borrarStaging();
  localStorage.setItem(p.claveStaging, version);
  const nuevo = await dirDe(raiz, p.dirNuevo, true);

  let hecho = 0;
  const archivos: Record<string, number> = {};
  try {
    for (const a of lista) {
      if (a.bytes > 0 && await tamano(nuevo, a.nombre) === a.bytes) {
        archivos[a.nombre] = a.bytes;
      } else {
        archivos[a.nombre] = await conReintentos(async () => {
          let parcial = 0;
          const n = await trabajador({ tipo: 'descargar', url: base + a.nombre, nombre: a.nombre, dir: p.dirNuevo },
            (b) => { parcial += b; alAvanzar(hecho + parcial, total); });
          if (a.bytes > 0 && n !== a.bytes) throw new Error(`${a.nombre} incompleto (${n} de ${a.bytes} bytes)`);
          return n;
        });
      }
      hecho += archivos[a.nombre];
      alAvanzar(hecho, total);
    }
    // Todo bajado: a partir de aquí el estado antiguo deja de valer (los archivos van a cambiar).
    localStorage.removeItem(p.clave);
    await trabajador({ tipo: 'mover', desde: p.dirNuevo, hacia: p.dir, nombres: lista.map((a) => a.nombre) });
  } catch (e) {
    await borrarStaging();
    throw e;
  }
  const est: EstadoDescarga = { fecha: new Date().toISOString(), bytes: hecho, generado: version, archivos };
  localStorage.setItem(p.clave, JSON.stringify(est));
  await borrarStaging();
  return { estado: est, persistente };
}

export const descargarMapas = (m: Manifest, region: string, base: string, alAvanzar: (hecho: number, total: number) => void) =>
  descargarPaquete(paqueteMapas(region), m.generado, [...m.archivos, { nombre: 'manifest.json', bytes: 0 }], m.total_bytes, base, alAvanzar);

/** Reconocedor: descarga aparte y opcional (≈100 MB), en data/<dir> (p. ej. data/modelo/). */
export const descargarModelo = (m: PaqueteModelo, base: string, alAvanzar: (hecho: number, total: number) => void) =>
  descargarPaquete(MODELO, m.version, m.archivos, m.total_bytes, base + m.dir, alAvanzar);

async function borrarPaquete(p: Paquete) {
  localStorage.removeItem(p.clave);
  localStorage.removeItem(p.claveStaging);
  const raiz = await navigator.storage.getDirectory();
  await quitarRuta(raiz, p.dir);
  await quitarRuta(raiz, p.dirNuevo);
}
export const borrarMapas = (region = regionActiva()) => borrarPaquete(paqueteMapas(region));
export const borrarModelo = () => borrarPaquete(MODELO);
