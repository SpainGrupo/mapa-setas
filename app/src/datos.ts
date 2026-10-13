import type { Manifest } from './tipos';
import { archivoOpfs } from './opfs';

export const BASE_DATOS = new URL('data/', document.baseURI).href;

/** Manifest de la red; sin cobertura, la copia descargada en OPFS. */
export async function cargarManifest(): Promise<Manifest | null> {
  try {
    const r = await fetch(BASE_DATOS + 'manifest.json', { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch { /* sin red */ }
  const f = await archivoOpfs('manifest.json');
  return f ? JSON.parse(await f.text()) : null;
}

export const mb = (b: number) => `${Math.round(b / 1e6)} MB`;
