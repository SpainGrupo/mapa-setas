// GPS de «Ir al sitio» y «Grabar ruta»: un único watchPosition compartido con altitud, rumbo de la marcha y hora.
// Independiente del Gps del mapa (gps.ts), que solo da latitud, longitud y precisión y pinta el punto azul.
export interface PosicionGps {
  lat: number;
  lon: number;
  precision: number;
  /** Altitud del GPS (m) y su precisión; null si el teléfono no la da. */
  alt: number | null;
  precAlt: number | null;
  /** Rumbo de la marcha (grados) y velocidad (m/s) del GPS; null parado o sin dato. */
  rumbo: number | null;
  velocidad: number | null;
  t: number;
}

const oyentes = new Set<(p: PosicionGps) => void>();
const errores = new Set<(m: string) => void>();
let watch: number | null = null;
let ultima: PosicionGps | null = null;
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export const ultimaPosicion = () => ultima;

function arrancar() {
  if (watch !== null) return;
  if (!('geolocation' in navigator)) { errores.forEach((f) => f('Este dispositivo no tiene GPS disponible.')); return; }
  watch = navigator.geolocation.watchPosition((p) => {
    const c = p.coords;
    ultima = { lat: c.latitude, lon: c.longitude, precision: c.accuracy, alt: num(c.altitude) ? c.altitude : null,
      precAlt: num(c.altitudeAccuracy) ? c.altitudeAccuracy : null, rumbo: num(c.heading) ? c.heading : null,
      velocidad: num(c.speed) ? c.speed : null, t: Date.now() };
    oyentes.forEach((f) => f(ultima!));
  }, (e) => {
    const m = e.code === e.PERMISSION_DENIED ? 'Sin permiso de ubicación. Actívalo en los ajustes del navegador.'
      : 'No se pudo obtener la posición GPS.';
    if (e.code === e.PERMISSION_DENIED) parar();
    errores.forEach((f) => f(m));
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
}

function parar() {
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  ultima = null;   // al volver a arrancar no se reutiliza una posición vieja (p. ej. de antes de ir en coche)
}

/** Escucha el GPS (lo arranca); devuelve la función para dejar de escuchar. Con nadie escuchando, se para. */
export function escucharGps(f: (p: PosicionGps) => void, error?: (m: string) => void): () => void {
  oyentes.add(f);
  if (error) errores.add(error);
  arrancar();
  if (ultima && Date.now() - ultima.t < 30000) f(ultima);
  return () => {
    oyentes.delete(f);
    if (error) errores.delete(error);
    if (!oyentes.size) parar();
  };
}
