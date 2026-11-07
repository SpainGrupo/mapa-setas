// Observaciones de «Explorar aquí» (observaciones-datos.ts) en IndexedDB, en su propia base como rutas.ts (idb-keyval crea
// un único almacén por base). Las fotos son Blob dentro del registro y quedan en el teléfono hasta que pulsas «Analizar».
import { createStore, del, entries, get, set } from 'idb-keyval';
import { validarObservacion, type Observacion } from './observaciones-datos';

const almacen = createStore('setas-observaciones', 'observaciones');

/** Más reciente primero. */
export async function listarObservaciones(): Promise<Observacion[]> {
  const t = await entries<string, unknown>(almacen);
  return t.map(([, o]) => validarObservacion(o)).filter((o): o is Observacion => !!o).sort((a, b) => b.t - a.t);
}
export const leerObservacion = async (id: string) => validarObservacion(await get(id, almacen));
export const guardarObservacion = (o: Observacion) => set(o.id, o, almacen);
export const borrarObservacion = (id: string) => del(id, almacen);
