import type { Manifest } from './tipos';
import { archivoOpfs } from './opfs';

export const BASE_DATOS = new URL('data/', document.baseURI).href;

/** JSON de datos desde la red; sin cobertura, la copia descargada en OPFS. */
export async function cargarJson<T>(nombre: string): Promise<T | null> {
  try {
    const r = await fetch(BASE_DATOS + nombre, { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch { /* sin red */ }
  const f = await archivoOpfs(nombre);
  return f ? JSON.parse(await f.text()) : null;
}

export const cargarManifest = () => cargarJson<Manifest>('manifest.json');

export const mb = (b: number) => `${Math.round(b / 1e6)} MB`;
