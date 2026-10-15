import type { Manifest } from './tipos';
import { archivoOpfs } from './opfs';
import { baseDatos, raizDatos, regionActiva } from './region';
import { prepararManifest, type ManifestApp } from './manifest-region';

export { mb } from './unidades';
export { baseDatos, raizDatos };

/** JSON de datos de una región desde la red; sin cobertura, la copia descargada en OPFS. */
export async function cargarJson<T>(nombre: string, region = regionActiva()): Promise<T | null> {
  try {
    const r = await fetch(baseDatos(region) + nombre, { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch { /* sin red */ }
  const f = await archivoOpfs(nombre, region);
  return f ? JSON.parse(await f.text()) : null;
}

export async function cargarManifest(region = regionActiva()): Promise<ManifestApp | null> {
  const m = await cargarJson<Manifest>('manifest.json', region);
  return m ? prepararManifest(m, region) : null;
}
