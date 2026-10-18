import { describe, expect, it } from 'vitest';
import { AYUDA_MY_MAPS, descripcionSitio, escaparXml, generarKml, MAX_WAYPOINTS_GOOGLE, nombreArchivoKml, nombrePlacemark,
  PIE_SEGURIDAD, seleccionarSitios, textoCompartir, textoTitularidadKml, urlRutaGoogle, urlSitioGoogle, type SitioExport } from './exportar-dia';

const sitio = (o: Partial<SitioExport> = {}): SitioExport => ({
  lat: 36.60184, lon: -4.82185, puntuacion: 81, estado: 'verde',
  setas: [{ cientifico: 'Boletus aereus', comun: 'Boletus negro', grupo: 'Boletus' }],
  porque: 'Puntuación 81/100 por hábitat muy favorable. Verde: lluvia de 27 mm.', minutos: 22, subida_m: 53, dificultad: 'facil',
  titularidad: { clase: 'privado', refuerzos: ['coto'] }, ...o,
});

describe('seleccionarSitios', () => {
  it('verdes delante sin perder el orden elegido, máximo 10', () => {
    const xs = ['amarillo', 'verde', 'gris', 'verde', 'rojo'].map((estado, i) => ({ i, principal: { estado: estado as SitioExport['estado'] } }));
    expect(seleccionarSitios(xs).map((x) => x.i)).toEqual([1, 3, 0, 2, 4]);
    const muchos = Array.from({ length: 14 }, (_, i) => ({ i, principal: { estado: 'verde' as const } }));
    expect(seleccionarSitios(muchos)).toHaveLength(10);
  });
});

describe('urlRutaGoogle', () => {
  it('origen GPS, destino el último, waypoints el resto, en coche', () => {
    const u = new URL(urlRutaGoogle([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: 5, lon: 6 }], { lat: 36.5, lon: -4.9 })!);
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
    expect(u.searchParams.get('api')).toBe('1');
    expect(u.searchParams.get('origin')).toBe('36.50000,-4.90000');
    expect(u.searchParams.get('destination')).toBe('5.00000,6.00000');
    expect(u.searchParams.get('waypoints')).toBe('1.00000,2.00000|3.00000,4.00000');
    expect(u.searchParams.get('travelmode')).toBe('driving');
  });
  it('sin GPS no pone origin; un sitio = sin waypoints; sin sitios = null', () => {
    const u = new URL(urlRutaGoogle([{ lat: 1, lon: 2 }], null)!);
    expect(u.searchParams.has('origin')).toBe(false);
    expect(u.searchParams.has('waypoints')).toBe(false);
    expect(urlRutaGoogle([], null)).toBeNull();
  });
  it('nunca más de 9 waypoints', () => {
    const xs = Array.from({ length: 12 }, (_, i) => ({ lat: i, lon: i }));
    const u = new URL(urlRutaGoogle(xs, null)!);
    expect(u.searchParams.get('waypoints')!.split('|')).toHaveLength(MAX_WAYPOINTS_GOOGLE);
    expect(u.searchParams.get('destination')).toBe('9.00000,9.00000');
  });
  it('enlace por sitio', () => {
    expect(urlSitioGoogle({ lat: 36.60184, lon: -4.82185 })).toBe('https://www.google.com/maps/search/?api=1&query=36.60184%2C-4.82185');
  });
});

describe('KML', () => {
  it('nombre de archivo y escapado XML', () => {
    expect(nombreArchivoKml('2026-10-18')).toBe('setas 18.10.26.kml');
    expect(escaparXml(`a & b <c> "d" 'e'\u0001`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });
  it('un Placemark por sitio con nombre, descripción y pie', () => {
    const k = generarKml('2026-10-18', [sitio(), sitio({ lat: 36.52, lon: -4.75, puntuacion: 71, estado: 'amarillo',
      setas: [{ cientifico: 'Amanita caesarea', comun: 'Oronja', grupo: 'Amanitas (oronja y gurumelo)' }],
      titularidad: { clase: 'monte_junta', monte: 'Sierra <Blanca> & Co' } })], 'Boletus');
    expect(k.match(/<Placemark>/g)).toHaveLength(2);
    expect(k).toContain('<name>setas 18.10.26</name>');
    expect(k).toContain('<name>1 · Boletus aereus (81)</name>');
    expect(k).toContain('<name>2 · Amanita caesarea (71)</name>');
    expect(k).toContain('<coordinates>-4.82185,36.60184,0</coordinates>');
    expect(k).toContain('Seta: Boletus aereus (Boletus negro, grupo Boletus).');
    expect(k).toContain('Acceso: 22 min a pie, 53 m de subida (fácil).');
    expect(k).toContain('Titularidad: PRIVADO, coto. Pide permiso antes de entrar.');
    expect(k).toContain('PÚBLICO, Sierra &lt;Blanca&gt; &amp; Co (Monte público autonómico).');
    expect(k.split(PIE_SEGURIDAD).length - 1).toBe(3);   // documento + 2 sitios
    expect(k).not.toMatch(/comestib/i);
    expect(k).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
  it('varias setas en el mismo sitio y titularidad con paso', () => {
    const s = sitio({ setas: [{ cientifico: 'Boletus aereus', comun: 'Boletus negro', grupo: 'Boletus' },
      { cientifico: 'Amanita caesarea', comun: 'Amanita caesarea', grupo: '' }], subida_m: 2, titularidad: { clase: 'privado', refuerzos: ['coto'], paso: true } });
    expect(nombrePlacemark(s, 3)).toBe('3 · Boletus aereus + Amanita caesarea (81)');
    const d = descripcionSitio(s);
    expect(d).toContain('Setas: Boletus aereus (Boletus negro, grupo Boletus); Amanita caesarea.');
    expect(d).toContain('casi llano');
    expect(textoTitularidadKml({ clase: 'privado' })).toBe('PRIVADO. Pide permiso antes de entrar.');
    expect(d).toContain('con paso público');
  });
});

describe('compartir y ayuda', () => {
  it('texto con sitios, ruta y aviso; sin «comestible»', () => {
    const t = textoCompartir('2026-10-18', [sitio()], 'https://www.google.com/maps/dir/?api=1&destination=1,2');
    expect(t).toContain('1 · Boletus aereus (81): https://www.google.com/maps/search/');
    expect(t).toContain('Ruta en coche: https://www.google.com/maps/dir/');
    expect(t).toContain(PIE_SEGURIDAD);
    expect(t + AYUDA_MY_MAPS).not.toMatch(/comestib/i);
    expect(AYUDA_MY_MAPS).toContain('Importar');
  });
});
