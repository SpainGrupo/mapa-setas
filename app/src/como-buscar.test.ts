import { describe, expect, it } from 'vitest';
import { comoBuscar, FUENTE_GUIA, FUENTE_MODELO, PENDIENTE } from './como-buscar';

const PERFIL_AEREUS = { arboles: { alcornoque: 1.0, castano: 0.9, encina: 0.8, quejigo: 0.7 }, orientacion: 'indiferente' as const,
  humedad: 0.1, dosel: { opt: [30, 70] as [number, number] }, altitud: { min: 0, opt_min: 300, opt_max: 900, max: 1200 },
  suelo: { acido: 1.0, otro: 0.5 } };

describe('Cómo buscar', () => {
  it('saca árboles, orientación, humedad y copas del perfil del modelo, con su fuente', () => {
    const l = comoBuscar('boletus_aereus', { perfil: PERFIL_AEREUS, ficha: { habitat: 'Alcornocales.', temporada: 'Otoño.' }, meses: [9, 10] });
    const t = Object.fromEntries(l.map((x) => [x.clave, x]));
    expect(t.arboles.texto).toBe('Sobre todo bajo alcornoque y castaño; también encina y quejigo.');
    expect(t.arboles.fuente).toBe(FUENTE_MODELO);
    expect(t.orientacion.texto).toMatch(/pesa poco/);
    expect(t.humedad.texto).toMatch(/vaguadas/);
    expect(t.copas.texto).toMatch(/30–70 %/);
    expect(t.suelo.texto).toBe('Mejor en suelo ácido (silíceo).');
    expect(t.evitar.texto).toMatch(/^Zonas quemadas/);
    expect(t.temporada.texto).toBe('Otoño. Meses que usa el semáforo: sep, oct.');
    expect(t.habitat).toMatchObject({ texto: 'Alcornocales.', fuente: FUENTE_GUIA });
    expect(t.senales.texto).toMatch(/árbol grande/);
  });
  it('lo que ninguna fuente dice queda PENDIENTE (hojarasca, distancia al tronco)', () => {
    const l = comoBuscar('boletus_aereus', { perfil: PERFIL_AEREUS });
    for (const c of ['hojarasca', 'tronco']) expect(l.find((x) => x.clave === c)).toMatchObject({ texto: PENDIENTE, fuente: null });
  });
  it('sin perfil ni ficha: todo PENDIENTE salvo la táctica general', () => {
    const l = comoBuscar('x', {});
    expect(l.filter((x) => x.texto !== PENDIENTE).map((x) => x.clave)).toEqual(['senales']);
  });
  it('saprófita en claros: sin árbol, sin aviso de incendios', () => {
    const l = comoBuscar('pleurotus_eryngii', { perfil: { cubierta: { pastizal: 1.0, pastizal_matorral: 0.7, matorral: 0.2 }, micorrizica: false } });
    expect(l.find((x) => x.clave === 'arboles')!.texto).toBe('En pastizal y pastizal con matorral sin árboles.');
    expect(l.find((x) => x.clave === 'evitar')!.texto).not.toMatch(/quemadas/);
  });
  it('nunca habla de comer', () => {
    const txt = comoBuscar('amanita_caesarea', { perfil: { ...PERFIL_AEREUS, orientacion: 'solana' } }).map((x) => x.texto).join(' ');
    expect(txt).not.toMatch(/comestib|se puede comer/i);
  });
  it('Craterellus y Pleurotus ostreatus tienen texto propio con fuente, sin comestible', () => {
    for (const id of ['craterellus_cornucopioides', 'pleurotus_ostreatus']) {
      const l = comoBuscar(id, { perfil: PERFIL_AEREUS });
      const propias = l.filter((x) => ['hojarasca', 'madera', 'aviso', 'senales'].includes(x.clave) && x.texto !== PENDIENTE);
      expect(propias.length).toBeGreaterThanOrEqual(2);
      for (const x of propias) expect(x.fuente).toBeTruthy();
      expect(l.map((x) => x.texto).join(' ')).not.toMatch(/comestib|se puede comer/i);
    }
    const c = comoBuscar('craterellus_cornucopioides', {});
    expect(c.find((x) => x.clave === 'hojarasca')!.texto).toMatch(/hojarasca/);
    expect(c.find((x) => x.clave === 'senales')!.texto).toMatch(/grupos/);
    const p = comoBuscar('pleurotus_ostreatus', {});
    expect(p.find((x) => x.clave === 'madera')!.texto).toMatch(/troncos y tocones/);
    expect(p.find((x) => x.clave === 'aviso')!.texto).toMatch(/solo ve el tipo de bosque, no la madera muerta/);
    expect(comoBuscar('boletus_aereus', {}).some((x) => x.clave === 'aviso')).toBe(false);
  });
});
