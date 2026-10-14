// Lógica pura de la pestaña Zona y de la capa Semáforo.
import type { PuntoMeteo } from './meteo';
import type { Estado } from './semaforo';

// Paleta de estado (fija; siempre acompañada de icono y texto, nunca solo color).
export const COLOR_ESTADO: Record<Estado, string> = { verde: '#0ca30c', amarillo: '#fab219', rojo: '#d03b3b', gris: '#8a8a86' };
export const NOMBRE_ESTADO: Record<Estado, string> = { verde: 'Buen momento', amarillo: 'Esperar', rojo: 'Mal momento', gris: 'Sin datos fiables' };

/** Punto más cercano (equirectangular; de sobra para distancias de decenas de km). */
export function puntoMasCercano(ps: PuntoMeteo[], lat: number, lon: number): PuntoMeteo | null {
  const k = Math.cos((lat * Math.PI) / 180);
  let mejor: PuntoMeteo | null = null, dmin = Infinity;
  for (const p of ps) {
    const d = (p.lat - lat) ** 2 + ((p.lon - lon) * k) ** 2;
    if (d < dmin) { dmin = d; mejor = p; }
  }
  return mejor;
}

export function haceTexto(horas: number): string {
  if (horas < 0.5) return 'hace unos minutos';
  if (horas < 1) return `hace ${Math.round(horas * 60)} min`;
  if (horas < 24) return `hace ${Math.round(horas)} h`;
  const d = Math.round(horas / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/** Expresión MapLibre fill-color: color del estado de cada punto (por la propiedad id de su polígono). */
export function expresionColores(estados: Record<number, Estado>): any {
  const pares = Object.entries(estados).flatMap(([id, e]) => [Number(id), COLOR_ESTADO[e]]);
  return pares.length ? ['match', ['get', 'id'], ...pares, COLOR_ESTADO.gris] : COLOR_ESTADO.gris;
}
