import { describe, expect, it } from 'vitest';
import { AVISO_CITAS, COLOR_ORIGEN, expresionColorOrigen, filasCita, filtroCitas, ORIGENES_CITA, textoFecha, textoPrecision } from './citas';

describe('citas', () => {
  it('un color por origen (foro, literatura, iNat, Observation, GBIF)', () => {
    expect(ORIGENES_CITA).toEqual(['foro', 'literatura', 'inat', 'observation', 'gbif']);
    expect(new Set(ORIGENES_CITA.map((o) => COLOR_ORIGEN[o])).size).toBe(5);
    const e = expresionColorOrigen();
    expect(e[0]).toBe('match');
    expect(e).toContain('observation');
  });
  it('filtra por la especie del mapa', () => {
    expect(filtroCitas('amanita_caesarea')).toEqual(['==', ['get', 'especie_mapa'], 'amanita_caesarea']);
    expect(filtroCitas(null)).toBeNull();
  });
  it('popup: especie, fecha, precisión, origen, enlace y atribución/licencia', () => {
    const f = filasCita({ especie: 'amanita_caesarea', fecha: '2021-10-03', precision_m: 1500, origen: 'inat',
      fuente: 'iNaturalist (research)', url: 'https://www.inaturalist.org/observations/1', atribucion: 'pepe', licencia: 'CC-BY-NC' },
    (id) => (id === 'amanita_caesarea' ? 'Amanita caesarea' : id));
    expect(f.map((x) => x.etiqueta)).toEqual(['Especie', 'Fecha', 'Precisión', 'Origen', 'Fuente', 'Atribución']);
    expect(f.map((x) => x.valor)).toEqual(['Amanita caesarea', '03/10/2021', '1,5 km', 'iNaturalist', 'iNaturalist (research)', 'pepe · CC-BY-NC']);
    expect(f[4].enlace).toBe('https://www.inaturalist.org/observations/1');
    expect(filasCita({ url: 'javascript:alert(1)' }, (x) => x)[4].enlace).toBeUndefined();
  });
  it('textos auxiliares', () => {
    expect(textoPrecision(12.4)).toBe('12 m');
    expect(textoPrecision(null)).toBe('sin dato');
    expect(textoFecha(undefined)).toBe('sin fecha');
    expect(AVISO_CITAS).toMatch(/no dice que se pueda recoger/);
  });
});
