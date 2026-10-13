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

export class Gps {
  ultima: Posicion | null = null;
  private watch: number | null = null;
  private esperando: ((p: Posicion) => void)[] = [];
  constructor(private mapa: MapaML, private alError: (m: string) => void) {}

  private montar() {
    if (this.mapa.getSource('gps')) return;
    this.mapa.addSource('gps', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    this.mapa.addLayer({ id: 'gps-precision', type: 'fill', source: 'gps', filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': '#1565c0', 'fill-opacity': 0.15 } });
    this.mapa.addLayer({ id: 'gps-punto', type: 'circle', source: 'gps', filter: ['==', '$type', 'Point'],
      paint: { 'circle-radius': 9, 'circle-color': '#1565c0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  }

  iniciar() {
    if (this.watch !== null) return;
    if (!('geolocation' in navigator)) { this.alError('Este dispositivo no tiene GPS disponible.'); return; }
    this.montar();
    this.watch = navigator.geolocation.watchPosition((p) => {
      const pos = { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy };
      this.ultima = pos;
      (this.mapa.getSource('gps') as GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circulo(pos.lon, pos.lat, pos.precision)] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] } },
      ] });
      this.esperando.splice(0).forEach((f) => f(pos));
    }, (e) => {
      this.alError(e.code === e.PERMISSION_DENIED ? 'Sin permiso de ubicación. Actívalo en los ajustes del navegador.'
        : 'No se pudo obtener la posición GPS.');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }

  /** Posición actual (espera a la primera lectura si aún no hay). */
  posicion(): Promise<Posicion> {
    this.iniciar();
    return this.ultima ? Promise.resolve(this.ultima) : new Promise((ok) => this.esperando.push(ok));
  }

  async centrar() {
    const p = await this.posicion();
    this.mapa.flyTo({ center: [p.lon, p.lat], zoom: Math.max(this.mapa.getZoom(), 14) });
  }
}
