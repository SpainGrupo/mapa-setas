import { createStore, del, entries, get, set, setMany } from 'idb-keyval';
import type { Sitio } from './tipos';

const almacen = createStore('setas', 'sitios');

export async function listarSitios(): Promise<Sitio[]> {
  const t = await entries<string, Sitio>(almacen);
  return t.map(([, s]) => s).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
export const leerSitio = (id: string) => get<Sitio>(id, almacen);
export const guardarSitio = (s: Sitio) => set(s.id, s, almacen);
export const borrarSitio = (id: string) => del(id, almacen);
export const guardarVarios = (l: Sitio[]) => setMany(l.map((s) => [s.id, s]), almacen);
