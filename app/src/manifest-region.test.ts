import { describe, expect, it } from 'vitest';
import { LEGADO_MARBELLA, nombreFuente, prepararManifest, siglaNorma } from './manifest-region';
import type { Manifest } from './tipos';

const base = (extra: Partial<Manifest> = {}): Manifest => ({
  generado: 'G', bbox: [-1, 37, 1, 39], umbrales: [0], zoom: { idoneidad: [8, 13], sombreado: [8, 12], base_max: 15 }, base: null,
  especies: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B', sin_habitat: true }, { id: 'c', nombre: 'C', sin_habitat: false }],
  archivos: [], total_bytes: 0, ...extra,
});

describe('prepararManifest: manifest antiguo de Marbella (sin campos nuevos)', () => {
  const m = prepararManifest(base({ especies: [{ id: 'a', nombre: 'A' }] }), 'marbella');
  it('rellena con los textos de hoy', () => {
    expect(m.region).toEqual({ id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 }, etiqueta_origen: 'de Marbella' });
    expect(m.atribuciones.mapa).toBe('IGN CC BY 4.0, © MITECO MFE, IGME, REDIAM CC BY 4.0, Catastro INSPIRE (D. G. del Catastro), © OpenStreetMap ODbL, Protomaps');
    expect(m.atribuciones.fuentes).toEqual({ rediam: 'REDIAM (Junta de Andalucía)', osm: 'OpenStreetMap' });
    expect(m.texto_protegido).toBe('Consulta la normativa de recolección del espacio.');
    expect(m.chip_sitio_restringido).toBe('Recoger aquí exige autorización');
    expect(m.normas_legado).toEqual(['BOJA']);
    expect(m.legal).toEqual([]);
    expect(m.avisos).toEqual([]);
    expect(m.ccaa).toBeNull();
  });
});

describe('prepararManifest: manifest de Marbella tal como lo emite el pipeline (fase A)', () => {
  const m = prepararManifest(base({
    region: { id: 'marbella', nombre: 'Marbella', origen: [-4.8825, 36.5101], etiqueta_origen: 'de Marbella' },
    legal: { ccaa: [{ id: 'AND', nombre: 'Andalucía', norma: 'Resolución de 23-09-2026, DT de Málaga (BOJA 196, 08-10-2026)', cupo_kg_dia: 3,
      texto: 'Málaga (Res. 23-09-2026, BOJA 196): autoconsumo ≤3 kg…', verificado: false, fuente_url: 'https://www.juntadeandalucia.es/boja/x.pdf' }] },
  }), 'marbella');
  it('origen [lon, lat], id corto de CCAA y sigla del boletín', () => {
    expect(m.region.origen).toEqual({ lat: 36.5101, lon: -4.8825 });
    expect(m.legal).toHaveLength(1);
    expect(m.legal[0]).toMatchObject({ id: 'andalucia', sigla: 'BOJA', cupo_kg_dia: null, verificado: false });
    expect(m.normas_legado).toEqual([]);
  });
  it('sin atribuciones en el manifest: Marbella conserva las de hoy', () => {
    expect(m.atribuciones).toEqual(LEGADO_MARBELLA.atribuciones);
  });
  it('con las atribuciones por capa del yaml (sin mapa ni fuentes): legado para el mapa y las rutas, capas tal cual', () => {
    const a = prepararManifest(base({ atribuciones: { titularidad: 'REDIAM, Junta de Andalucía', idoneidad: 'IGN · REDIAM', n: 3 } }), 'marbella').atribuciones;
    expect(a.mapa).toBe(LEGADO_MARBELLA.atribuciones.mapa);
    expect(a.fuentes).toEqual(LEGADO_MARBELLA.atribuciones.fuentes);
    expect(a.capas).toEqual({ titularidad: 'REDIAM, Junta de Andalucía', idoneidad: 'IGN · REDIAM' });
  });
  it('otra región sin `mapa`: la de idoneidad más el mapa base', () => {
    expect(prepararManifest(base({ atribuciones: { idoneidad: 'IGN · ICV' } }), 'alicante').atribuciones.mapa).toBe('IGN · ICV · Protomaps');
  });
});

describe('prepararManifest: región sin campos nuevos que no es Marbella', () => {
  it('no inventa nada: origen en el centro del bbox, sin normas ni atribución de legado', () => {
    const m = prepararManifest(base(), 'prueba');
    expect(m.region).toEqual({ id: 'prueba', nombre: 'prueba', origen: { lat: 38, lon: 0 }, etiqueta_origen: 'del centro de la zona' });
    expect(m.normas_legado).toEqual([]);
    expect(m.atribuciones).toEqual({ mapa: '', fuentes: { osm: 'OpenStreetMap' }, capas: {} });
  });
});

describe('prepararManifest: campos nuevos', () => {
  const legal = { ccaa: [
    { id: 'comunitat_valenciana', nombre: 'Comunitat Valenciana', norma: 'DOGV', cupo_kg_dia: 2, texto: 'T', verificado: false, fuente_url: 'javascript:alert(1)' },
    { id: 'MUR', nombre: 'Región de Murcia', norma: 'BORM', cupo_kg_dia: null, texto: 'U', verificado: true, fuente_url: 'https://www.borm.es/x' },
    { id: 'galicia', nombre: 'X', norma: 'DOG', cupo_kg_dia: 1, texto: 'V', verificado: true, fuente_url: '' },
    { id: 'CLM', nombre: 'Castilla-La Mancha', norma: 'DOCM', cupo_kg_dia: 5, texto: 'W', verificado: true, fuente_url: '' },
  ], texto_protegido: 'Puede haber limitaciones propias; consulta su PRUG.', chip_sitio_restringido: 'Espacio protegido: consulta sus normas' };
  const m = prepararManifest(base({ region: { id: 'alicante', nombre: 'Alicante', origen: { lat: 38.3452, lon: -0.481 }, etiqueta_origen: 'de Alicante' },
    legal, atribuciones: { mapa: 'ICV CC BY 4.0', fuentes: { icv: 'Institut Cartogràfic Valencià' } }, ccaa: 'ccaa.pmtiles', avisos: ['MFE de Murcia sin datos', 7] }), 'alicante');
  it('separa las especies sin hábitat', () => {
    expect(m.especies.map((e) => e.id)).toEqual(['a', 'c']);
    expect(m.especies_sin_habitat.map((e) => e.id)).toEqual(['b']);
  });
  it('valida la normativa: quita CCAA fuera de la lista cerrada, URLs no https y el cupo no verificado', () => {
    expect(m.legal.map((e) => e.id)).toEqual(['comunitat_valenciana', 'region_murcia', 'castilla_la_mancha']);
    expect(m.legal[0]).toMatchObject({ fuente_url: '', cupo_kg_dia: null, verificado: false, sigla: 'DOGV' });
    expect(m.legal[1]).toMatchObject({ fuente_url: 'https://www.borm.es/x', verificado: true });
    expect(m.legal[2]).toMatchObject({ cupo_kg_dia: 5 });
    expect(m.texto_protegido).toBe('Puede haber limitaciones propias; consulta su PRUG.');
    expect(m.normas_legado).toEqual([]);
  });
  it('región, atribuciones, ccaa y avisos (solo textos)', () => {
    expect(m.region.etiqueta_origen).toBe('de Alicante');
    expect(m.atribuciones.fuentes).toEqual({ osm: 'OpenStreetMap', icv: 'Institut Cartogràfic Valencià' });
    expect(m.atribuciones.mapa).toBe('ICV CC BY 4.0');
    expect(m.ccaa).toBe('ccaa.pmtiles');
    expect(m.avisos).toEqual(['MFE de Murcia sin datos']);
  });
  it('una región del manifest con id distinto del pedido se rechaza (índice y manifest desalineados)', () => {
    expect(() => prepararManifest(base({ region: { id: 'otra', nombre: 'O', origen: { lat: 0, lon: 0 }, etiqueta_origen: 'de O' } }), 'alicante'))
      .toThrow(/no coincide/);
  });
});

describe('siglaNorma', () => {
  it('saca la sigla del boletín de un texto largo; si no hay, el texto corto o nada', () => {
    expect(siglaNorma('Resolución de 23-09-2026 (BOJA 196, 08-10-2026)')).toBe('BOJA');
    expect(siglaNorma('Orden 15/11/2016 (DOCM núm. 225)')).toBe('DOCM');
    expect(siglaNorma('DOGV')).toBe('DOGV');
    expect(siglaNorma('Ley 43/2003 de Montes y otras normas largas sin boletín')).toBe('');
  });
});

describe('nombreFuente', () => {
  it('nombre legible, osm por defecto y guion si no hay fuente', () => {
    expect(nombreFuente('rediam', LEGADO_MARBELLA.atribuciones.fuentes)).toBe('REDIAM (Junta de Andalucía)');
    expect(nombreFuente('osm', {})).toBe('OpenStreetMap');
    expect(nombreFuente('icv', {})).toBe('icv');
    expect(nombreFuente('', {})).toBe('—');
  });
});
