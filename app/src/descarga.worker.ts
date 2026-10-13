/// <reference lib="webworker" />
// Operaciones de OPFS con SyncAccessHandle (Chrome, Safari 15.2+, Firefox 111+):
// - descargar: baja un archivo a un directorio (el de staging en las actualizaciones).
// - mover: pasa los archivos del staging al directorio definitivo y quita los que sobran.
const ambito = self as unknown as DedicatedWorkerGlobalScope;

type Orden =
  | { tipo: 'descargar'; url: string; nombre: string; dir: string }
  | { tipo: 'mover'; desde: string; hacia: string; nombres: string[] };

async function descargar(url: string, nombre: string, dirNombre: string) {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle(dirNombre, { create: true });
  const fh = await dir.getFileHandle(nombre, { create: true });
  const h = await (fh as any).createSyncAccessHandle();
  try {
    h.truncate(0);
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} al descargar ${nombre}`);
    const lector = r.body.getReader();
    let pos = 0, pendiente = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      h.write(value, { at: pos });
      pos += value.byteLength;
      pendiente += value.byteLength;
      if (pendiente > 1 << 20) { ambito.postMessage({ tipo: 'progreso', bytes: pendiente }); pendiente = 0; }
    }
    h.flush();
    ambito.postMessage({ tipo: 'progreso', bytes: pendiente });
    return pos;
  } finally {
    h.close();
  }
}

/** Copia byte a byte (si el navegador no tiene FileSystemHandle.move). */
async function copiar(origen: FileSystemFileHandle, destino: FileSystemDirectoryHandle, nombre: string) {
  const f = await origen.getFile();
  const h = await (await destino.getFileHandle(nombre, { create: true }) as any).createSyncAccessHandle();
  try {
    h.truncate(0);
    const TROZO = 8 << 20;
    for (let pos = 0; pos < f.size; pos += TROZO) {
      h.write(new Uint8Array(await f.slice(pos, pos + TROZO).arrayBuffer()), { at: pos });
    }
    h.flush();
  } finally {
    h.close();
  }
}

async function mover(desde: string, hacia: string, nombres: string[]) {
  const raiz = await navigator.storage.getDirectory();
  const origen = await raiz.getDirectoryHandle(desde);
  const destino = await raiz.getDirectoryHandle(hacia, { create: true });
  for (const n of nombres) {
    const fh = await origen.getFileHandle(n);
    await destino.removeEntry(n).catch(() => {});
    if (typeof (fh as any).move === 'function') await (fh as any).move(destino, n);
    else { await copiar(fh, destino, n); await origen.removeEntry(n); }
  }
  const quedan = new Set(nombres);
  const sobran: string[] = [];
  for await (const n of (destino as any).keys() as AsyncIterable<string>) if (!quedan.has(n)) sobran.push(n);
  for (const n of sobran) await destino.removeEntry(n, { recursive: true }).catch(() => {});
}

ambito.onmessage = async (e: MessageEvent<Orden>) => {
  const o = e.data;
  try {
    if (o.tipo === 'descargar') ambito.postMessage({ tipo: 'hecho', bytes: await descargar(o.url, o.nombre, o.dir) });
    else { await mover(o.desde, o.hacia, o.nombres); ambito.postMessage({ tipo: 'hecho', bytes: 0 }); }
  } catch (err) {
    ambito.postMessage({ tipo: 'error', mensaje: String((err as Error)?.message ?? err) });
  }
};
