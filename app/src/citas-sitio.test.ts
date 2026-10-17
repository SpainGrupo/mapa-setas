import { describe, expect, it } from 'vitest';
import { filaRefCita, parsearCitasSitio, textoCitado, textoDistancia, type CitasSitio } from './citas';
import { calidad, factorCitas, FACTOR_CITAS, parsearSitios, puntuar, topEspecie, topGeneral, type Opciones, type SitioCandidato, type SitiosJson } from './ranking';

const ref = (o: Record<string, unknown> = {}) => ({ origen: 'inat', fecha: '2023-10-02', precision_m: 12, dist_m: 350,
  url: 'https://www.inaturalist.org/observations/1', fuente: 'iNaturalist (research)', atribucion: 'pepe', licencia: 'CC-BY-NC-4.0', ...o });
const citas = (o: Partial<CitasSitio> = {}): CitasSitio => ({ n: 3, ultima: '2023', nivel: 'punto', origenes: ['inat', 'foro', 'literatura'],
  refs: [ref(), ref({ origen: 'foro', fecha: null, precision_m: null, url: null, fuente: 'Foro X', licencia: 'sin licencia (todos los derechos reservados)' })], ...o });

describe('citas de un sitio: etiqueta y lista de fuentes', () => {
  it('etiqueta «Citado: …» con orígenes en el orden de la capa, número y año', () => {
    expect(textoCitado(citas())).toBe('Citado: foro / literatura / iNat (3 citas, última 2023)');
    expect(textoCitado(citas({ n: 1, ultima: null, origenes: ['gbif'] }))).toBe('Citado: GBIF (1 cita)');
    expect(textoCitado(citas({ origenes: ['observation', 'raro'] }))).toBe('Citado: Observation / raro (3 citas, última 2023)');
  });
  it('fila de una fuente: origen, fecha, precisión, distancia, enlace y atribución · licencia', () => {
    expect(filaRefCita(parsearCitasSitio(citas())!.refs[0])).toEqual({ origen: 'iNaturalist', fecha: '02/10/2023', precision: 'precisión 12 m',
      distancia: 'a 350 m del sitio', enlace: 'https://www.inaturalist.org/observations/1', fuente: 'iNaturalist (research)', atribucion: 'pepe · CC-BY-NC-4.0' });
    const f = filaRefCita(parsearCitasSitio(citas())!.refs[1]);
    expect(f).toMatchObject({ origen: 'Foro o comentario', fecha: 'sin fecha', precision: 'precisión sin dato', fuente: 'Foro X',
      atribucion: 'pepe · sin licencia (todos los derechos reservados)' });
    expect(f.enlace).toBeUndefined();
    expect(textoDistancia(1234)).toBe('a 1,2 km');
    expect(filaRefCita(parsearCitasSitio(citas({ refs: [ref({ fecha: '2018' })] }))!.refs[0]).fecha).toBe('2018');
    expect(filaRefCita(parsearCitasSitio(citas({ refs: [ref({ fecha: '2018-10' })] }))!.refs[0]).fecha).toBe('10/2018');
  });
  it('parsearCitasSitio: forma mínima, URLs solo http(s) y nada raro', () => {
    expect(parsearCitasSitio(undefined)).toBeNull();
    expect(parsearCitasSitio({ n: 0, refs: [] })).toBeNull();
    expect(parsearCitasSitio({ n: 2 })).toBeNull();
    const c = parsearCitasSitio({ n: 2, ultima: 'x', nivel: 'otro', refs: [ref({ url: 'javascript:alert(1)' }), null] })!;
    expect(c.nivel).toBe('paraje');
    expect(c.ultima).toBeNull();
    expect(c.refs).toHaveLength(1);
    expect(c.refs[0].url).toBeNull();
    expect(c.origenes).toEqual(['inat']);
  });
});

let id = 0;
const sitio = (o: Partial<SitioCandidato> = {}): SitioCandidato => ({ id: ++id, lat: 36.5, lon: -5 + id * 0.1, area_ha: 50, punt_media: 80, punt_max: 95,
  t_pie_min: 20, subida_m: 100, dist_camino_m: 400, aparcamiento_id: 1, restringido: false, meteo_id: 1, bonus_pisado: 1, ...o });
const opc = (o: Partial<Opciones> = {}): Opciones => ({ estadoEn: () => 'verde', fiabilidad: () => 'buena', maxDificultad: null, ...o });

describe('factor de citas en el ranking', () => {
  it('×1,15 punto, ×1,05 paraje, ×1 sin citas; solo si la región lo aplica', () => {
    expect(FACTOR_CITAS).toEqual({ punto: 1.15, paraje: 1.05 });
    const p = sitio({ citas: citas() }), q = sitio({ citas: citas({ nivel: 'paraje' }) }), r = sitio();
    expect(factorCitas(p, true)).toBe(1.15);
    expect(factorCitas(q, true)).toBe(1.05);
    expect(factorCitas(r, true)).toBe(1);
    expect(factorCitas(p, false)).toBe(1);
    expect(puntuar('x', p, opc({ factorCitas: true }))!.score).toBeCloseTo(calidad(p) * 1.15, 9);
    expect(puntuar('x', p, opc())!.score).toBeCloseTo(calidad(p), 9);
  });
  it('topEspecie/topGeneral usan factor_citas de sitios.json', () => {
    const a = sitio({ punt_media: 80 }), b = sitio({ punt_media: 75, citas: citas() });   // 75 × 1,15 > 80
    const d = (f?: boolean): SitiosJson => ({ version: 2, generado: '', especies: { x: [a, b] }, ...(f === undefined ? {} : { factor_citas: f }) });
    expect(topEspecie(d(true), 'x', opc()).map((e) => e.sitio.id)).toEqual([b.id, a.id]);
    expect(topEspecie(d(false), 'x', opc()).map((e) => e.sitio.id)).toEqual([a.id, b.id]);
    expect(topEspecie(d(), 'x', opc()).map((e) => e.sitio.id)).toEqual([a.id, b.id]);
    expect(topGeneral(d(true), ['x'], opc(), 1)[0].principal.sitio.id).toBe(b.id);
    expect(topGeneral(d(false), ['x'], opc(), 1)[0].principal.sitio.id).toBe(a.id);
  });
  it('parsearSitios: compatible con archivos sin citas (versión 1) y limpia el campo', () => {
    const v1 = parsearSitios({ version: 1, generado: 'g', especies: { x: [sitio()] } })!;
    expect(v1.factor_citas).toBe(false);
    expect(v1.especies.x[0].citas).toBeUndefined();
    const v2 = parsearSitios({ version: 2, generado: 'g', factor_citas: true,
      especies: { x: [sitio({ citas: citas() }), sitio({ citas: { n: 'raro' } as unknown as CitasSitio })] } })!;
    expect(v2.factor_citas).toBe(true);
    expect(v2.especies.x[0].citas?.n).toBe(3);
    expect('citas' in v2.especies.x[1]).toBe(false);
  });
});
