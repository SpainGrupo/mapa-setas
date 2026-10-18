import type { Map as MapaML, GeoJSONSource } from 'maplibre-gl';

export interface Posicion { lat: number; lon: number; precision: number }

function circulo(lon: number, lat: number, radio: number) {
  const pts: [number, number][] = [];
  const dLat = radio / 111320, dLon = radio / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return pts;
}

export const ESPERA_GPS_MS = 20000;
const SIN_PERMISO = 'Sin permiso de ubicación. Actívalo en los ajustes del navegador.';

interface Espera { ok: (p: Posicion) => void; mal: (e: Error) => void; t: ReturnType<typeof setTimeout> }

export class Gps {
  ultima: Posicion | null = null;
  private watch: number | null = null;
  private esperando: Espera[] = [];
  private avisado = false;      // el aviso de error sale una vez hasta la siguiente lectura buena
  private escuchas = new Set<(p: Posicion) => void>();
  constructor(private mapa: MapaML, private alError: (m: string) => void) {}

  private montar() {
    if (this.mapa.getSource('gps')) return;
    this.mapa.addSource('gps', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    this.mapa.addLayer({ id: 'gps-precision', type: 'fill', source: 'gps', filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': '#1565c0', 'fill-opacity': 0.15 } });
    this.mapa.addLayer({ id: 'gps-punto', type: 'circle', source: 'gps', filter: ['==', '$type', 'Point'],
      paint: { 'circle-radius': 9, 'circle-color': '#1565c0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  }

  private rechazar(mensaje: string) {
    this.esperando.splice(0).forEach((w) => { clearTimeout(w.t); w.mal(new Error(mensaje)); });
  }

  iniciar() {
    if (this.watch !== null) return;
    if (!('geolocation' in navigator)) { this.rechazar('Este dispositivo no tiene GPS disponible.'); this.alError('Este dispositivo no tiene GPS disponible.'); return; }
    this.montar();
    this.watch = navigator.geolocation.watchPosition((p) => {
      const pos = { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy };
      this.ultima = pos;
      this.avisado = false;
      (this.mapa.getSource('gps') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(pos.lon, pos.lat, pos.precision)] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] } },
      ] });
      this.esperando.splice(0).forEach((w) => { clearTimeout(w.t); w.ok(pos); });
      this.escuchas.forEach((f) => f(pos));
    }, (e) => {
      const denegado = e.code === e.PERMISSION_DENIED;
      const mensaje = denegado ? SIN_PERMISO : 'No se pudo obtener la posición GPS.';
      if (denegado && this.watch !== null) {   // se para para que otro toque vuelva a pedir permiso
        navigator.geolocation.clearWatch(this.watch);
        this.watch = null;
      }
      this.rechazar(mensaje);
      if (!this.avisado) { this.avisado = true; this.alError(mensaje); }
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }

  /** Posición actual (espera a la primera lectura si aún no hay); falla con error o a los 20 s. */
  posicion(): Promise<Posicion> {
    if (this.ultima) { this.iniciar(); return Promise.resolve(this.ultima); }
    return new Promise((ok, mal) => {
      const w: Espera = { ok, mal, t: setTimeout(() => {
        this.esperando = this.esperando.filter((x) => x !== w);
        mal(new Error('No se encontró tu posición a tiempo. Prueba en un sitio más despejado.'));
      }, ESPERA_GPS_MS) };
      this.esperando.push(w);
      this.iniciar();
    });
  }

  /** Llama a `f` con cada lectura nueva (arranca el GPS); devuelve la función para dejar de escuchar. */
  /** Escucha las lecturas sin arrancar el GPS (solo si otra parte de la app ya lo tiene en marcha). */
  alLeer(f: (p: Posicion) => void): () => void {
    this.escuchas.add(f);
    return () => { this.escuchas.delete(f); };
  }

  escuchar(f: (p: Posicion) => void): () => void {
    this.escuchas.add(f);
    this.iniciar();
    if (this.ultima) f(this.ultima);
    return () => { this.escuchas.delete(f); };
  }

  async centrar() {
    const p = await this.posicion();
    this.mapa.flyTo({ center: [p.lon, p.lat], zoom: Math.max(this.mapa.getZoom(), 14) });
  }
}
