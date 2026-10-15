// Rutas anidadas en OPFS ('mapas/marbella'): getDirectoryHandle solo acepta un nombre por llamada.
// Lo usan opfs.ts (hilo principal) y descarga.worker.ts.
export function partes(ruta: string): string[] {
  const p = ruta.split('/').filter(Boolean);
  if (!p.length || p.some((x) => x === '.' || x === '..')) throw new Error(`Ruta OPFS no válida: ${ruta}`);
  return p;
}

export async function dirDe(raiz: FileSystemDirectoryHandle, ruta: string, crear = false): Promise<FileSystemDirectoryHandle> {
  let d = raiz;
  for (const x of partes(ruta)) d = await d.getDirectoryHandle(x, { create: crear });
  return d;
}

/** Borra la última entrada de la ruta (recursiva) y después los padres que hayan quedado vacíos. Nunca lanza. */
export async function quitarRuta(raiz: FileSystemDirectoryHandle, ruta: string): Promise<void> {
  const p = partes(ruta);
  const cadena: FileSystemDirectoryHandle[] = [raiz];
  try { for (const x of p.slice(0, -1)) cadena.push(await cadena[cadena.length - 1].getDirectoryHandle(x)); } catch { return; }
  await cadena[cadena.length - 1].removeEntry(p[p.length - 1], { recursive: true }).catch(() => {});
  // Sin `recursive`, removeEntry falla si el directorio no está vacío: así solo caen los vacíos.
  for (let i = p.length - 2; i >= 0; i--) {
    try { await cadena[i].removeEntry(p[i]); } catch { break; }
  }
}
