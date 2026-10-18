// Rutas grabadas (grabacion.ts) en IndexedDB, como Mis sitios (sitios.ts), en su propia base: idb-keyval crea un único
// almacén por base, y la de los sitios ya existe. La grabación en curso va en otro almacén y se escribe a cada punto
// aceptado (con un mínimo entre escrituras), para no perderla si iOS recarga la página.
import { createStore, del, entries, get, set } from 'idb-keyval';
import { validarTrack, type Track } from './grabacion';

const almacen = createStore('setas-rutas', 'rutas');
const enCurso = createStore('setas-grabacion', 'en-curso');
const CLAVE = 'actual';

export async function listarRutas(): Promise<Track[]> {
  const t = await entries<string, Track>(almacen);
  return t.map(([, r]) => validarTrack(r)).filter((r): r is Track => !!r).sort((a, b) => b.inicio - a.inicio);
}
export const leerRuta = async (id: string) => validarTrack(await get(id, almacen));
export const guardarRuta = (r: Track) => set(r.id, r, almacen);
export const borrarRuta = (id: string) => del(id, almacen);

export const leerGrabacion = async () => validarTrack(await get(CLAVE, enCurso).catch(() => null));
export const guardarGrabacion = (r: Track) => set(CLAVE, r, enCurso);
export const borrarGrabacion = () => del(CLAVE, enCurso);
