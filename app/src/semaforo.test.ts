import { describe, expect, it } from 'vitest';
import { semaforo, sumarDias, type Reglas } from './semaforo';
import type { Dia } from './meteo';

const HOY = '2026-10-13';
const AEREUS: Reglas = { episodio_mm: 25, ventana_dias: [8, 20], tmin_media: [8, 18], tmax_media: [15, 27] };

/** 30 días pasados + hoy + 6 de previsión; `lluvia` = {díasRelativosAHoy: mm} (negativo = pasado). */
function serie(lluvia: Record<number, number> = {}, tmin = 12, tmax = 22): Dia[] {
  return Array.from({ length: 37 }, (_, i) => {
    const rel = i - 30;
    return { fecha: sumarDias(HOY, rel), lluvia: lluvia[rel] ?? 0, tmin, tmax };
  });
}

describe('semaforo', () => {
  it('30 mm hace 12 días con temperatura templada → verde, hasta el fin de la ventana', () => {
    const r = semaforo(serie({ [-12]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.motivo).toMatch(/ventana abierta/);
    expect(r.hasta).toBe(sumarDias(HOY, -12 + 20));
    expect(r.episodio).toBe(sumarDias(HOY, -12));
  });

  it('30 mm hace 3 días → amarillo «esperar» con desde = episodio + ventana mínima', () => {
    const r = semaforo(serie({ [-3]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/esperar/);
    expect(r.desde).toBe(sumarDias(HOY, -3 + 8));
  });

  it('seco 30 días → rojo «seco»', () => {
    const r = semaforo(serie({ [-20]: 5, [-10]: 8 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo' });
    expect(r.motivo).toMatch(/seco/);
  });

  it('30 mm hace 25 días → rojo «ventana pasada»', () => {
    const r = semaforo(serie({ [-25]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('rojo');
    expect(r.motivo).toMatch(/ventana pasada/);
  });

  it('30 mm hace 12 días con frío (tmin 3) → amarillo por temperatura, indicando cuál falla', () => {
    const r = semaforo(serie({ [-12]: 30 }, 3, 22), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/lluvia buena, temperatura justa/);
    expect(r.motivo).toMatch(/mínimas/);
    expect(r.motivo).not.toMatch(/máximas/);
  });

  it('esperar con temperatura fuera de rango: el motivo lo dice', () => {
    const r = semaforo(serie({ [-3]: 30 }, 12, 32), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/esperar/);
    expect(r.motivo).toMatch(/máximas/);
  });

  it('lluvia repartida en 3 días (10+10+10) cuenta como episodio; el episodio acaba el último día', () => {
    const r = semaforo(serie({ [-14]: 10, [-13]: 10, [-12]: 10 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.episodio).toBe(sumarDias(HOY, -12));
    // repartida en 4 días no llega en ninguna ventana de 3
    expect(semaforo(serie({ [-15]: 8, [-14]: 8, [-13]: 8, [-12]: 8 }), AEREUS, HOY).estado).toBe('rojo');
  });

  it('episodio solo en la previsión → amarillo «lluvia prevista el DD/MM»', () => {
    const r = semaforo(serie({ [2]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/lluvia prevista el 15\/10/);
    expect(r.desde).toBe(sumarDias(HOY, 2 + 8));
  });

  it('ventana abierta y además lluvia prevista: sigue verde y el motivo añade la lluvia prevista', () => {
    const r = semaforo(serie({ [-12]: 30, [3]: 40 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.motivo).toMatch(/lluvia prevista el 16\/10/);
  });

  it('caché de más de 72 h → gris «datos antiguos»', () => {
    const r = semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 73 });
    expect(r).toEqual({ estado: 'gris', motivo: 'datos antiguos' });
    expect(semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 71 }).estado).toBe('verde');
  });

  it('con 2 episodios manda el más reciente', () => {
    const r = semaforo(serie({ [-25]: 40, [-3]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.episodio).toBe(sumarDias(HOY, -3));
    const r2 = semaforo(serie({ [-28]: 40, [-12]: 30 }), AEREUS, HOY);
    expect(r2.estado).toBe('verde');
    expect(r2.episodio).toBe(sumarDias(HOY, -12));
  });

  it('límites de la ventana inclusivos', () => {
    expect(semaforo(serie({ [-8]: 30 }), AEREUS, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-20]: 30 }), AEREUS, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-21]: 30 }), AEREUS, HOY).estado).toBe('rojo');
    expect(semaforo(serie({ [-7]: 30 }), AEREUS, HOY).estado).toBe('amarillo');
  });

  it('el umbral de episodio es inclusivo', () => {
    expect(semaforo(serie({ [-12]: 25 }), AEREUS, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-12]: 24.9 }), AEREUS, HOY).estado).toBe('rojo');
  });

  it('media de temperaturas de los últimos 10 días (hoy incluido), no de toda la serie', () => {
    const s = serie({ [-12]: 30 }).map((d, i) => (i < 21 ? { ...d, tmin: 0 } : d));   // frío antes de los 10 últimos días
    expect(semaforo(s, AEREUS, HOY).estado).toBe('verde');
  });

  it('hoy fuera de la serie → gris', () => {
    expect(semaforo(serie(), AEREUS, '2026-12-01').estado).toBe('gris');
  });
});

describe('semaforo — hallazgos de revisión', () => {
  it('lluvia pasada esperando + lluvia prevista → manda la pasada y se anota la prevista', () => {
    const r = semaforo(serie({ [-5]: 40, [2]: 25 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.desde).toBe(sumarDias(HOY, -5 + 8));
    expect(r.motivo).toMatch(new RegExp(`lluvia prevista el ${sumarDias(HOY, 2).slice(8, 10)}/`));
  });

  it('dos episodios previstos → manda el más cercano', () => {
    const r = semaforo(serie({ [2]: 30, [5]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.episodio).toBe(sumarDias(HOY, 2));
  });

  it('llovizna de 0,2 mm tras el episodio no mueve su fecha', () => {
    const r = semaforo(serie({ [-12]: 30, [-10]: 0.2 }), AEREUS, HOY);
    expect(r.episodio).toBe(sumarDias(HOY, -12));
  });
});

// ---------------------------------------------------------------- v2: humedad acumulada, estrés y temporada
import { bandaAltitud, humedadAcumulada, textoBanda } from './semaforo';

const V2: Reglas = { ...AEREUS, balance_30d_min_mm: -30, dias_lluvia_30d_min: 4, humedad_suelo_min: 0.15 };
/** Serie con ET0, HR mínima y humedad del suelo constantes salvo `cambios` (por día relativo). */
function serie2(lluvia: Record<number, number>, o: { et0?: number; hr?: number; suelo?: number } = {},
  cambios: Record<number, Partial<Dia>> = {}): Dia[] {
  return serie(lluvia).map((d, i) => ({ ...d, et0: o.et0 ?? 2, hr_min: o.hr ?? 50, suelo: o.suelo ?? 0.2, ...cambios[i - 30] }));
}
const lluviaRepartida = { [-12]: 30, [-20]: 10, [-18]: 10, [-15]: 10 };   // 60 mm, 4 días de lluvia

describe('humedadAcumulada', () => {
  it('balance P − ET0 y días de lluvia en los 30 días que acaban hoy; suelo de hoy', () => {
    const h = humedadAcumulada(serie2(lluviaRepartida, { et0: 2 }, { 0: { suelo: 0.21 } }), HOY);
    expect(h).toEqual({ balance_mm: 60 - 60, dias_lluvia: 4, suelo: 0.21 });
  });
  it('la lluvia de hace 30 días ya no cuenta; la de hace 29, sí', () => {
    expect(humedadAcumulada(serie2({ [-30]: 10 }), HOY).dias_lluvia).toBe(0);
    expect(humedadAcumulada(serie2({ [-29]: 10 }), HOY).dias_lluvia).toBe(1);
  });
  it('sin ET0 (caché antigua) → balance NaN; sin suelo → NaN', () => {
    const h = humedadAcumulada(serie({ [-12]: 30 }), HOY);
    expect(h.balance_mm).toBeNaN();
    expect(h.suelo).toBeNaN();
    expect(h.dias_lluvia).toBe(1);
  });
});

describe('semaforo v2 — humedad acumulada', () => {
  it('una sola tormenta en otoño seco → amarillo «lluvia puntual, suelo aún seco»', () => {
    const r = semaforo(serie2({ [-12]: 30 }, { et0: 3, suelo: 0.1 }), V2, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/lluvia puntual, suelo aún seco/);
    expect(r.motivo).toMatch(/balance −60 mm en 30 días y 1 día de lluvia; llovieron 30 mm/);
  });
  it('lluvia repartida y balance suficiente → verde', () => {
    expect(semaforo(serie2(lluviaRepartida, { et0: 2, suelo: 0.1 }), V2, HOY).estado).toBe('verde');
  });
  it('balance bajo pero suelo húmedo (y días suficientes) → verde: basta una de las dos', () => {
    expect(semaforo(serie2(lluviaRepartida, { et0: 4, suelo: 0.18 }), V2, HOY).estado).toBe('verde');
    expect(semaforo(serie2(lluviaRepartida, { et0: 4, suelo: 0.1 }), V2, HOY).estado).toBe('amarillo');
  });
  it('pocos días de lluvia → amarillo aunque el suelo esté húmedo', () => {
    expect(semaforo(serie2({ [-12]: 60 }, { et0: 1, suelo: 0.3 }), V2, HOY).estado).toBe('amarillo');
  });
  it('sin umbrales en las reglas (manifest antiguo) → no se comprueba', () => {
    expect(semaforo(serie2({ [-12]: 30 }, { et0: 3, suelo: 0.1 }), AEREUS, HOY).estado).toBe('verde');
  });
  it('sin datos de ET0 ni suelo solo cuentan los días de lluvia', () => {
    expect(semaforo(serie(lluviaRepartida), V2, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-12]: 30 }), V2, HOY).estado).toBe('amarillo');
  });
  it('solo afecta al verde: «esperar» sigue igual', () => {
    const r = semaforo(serie2({ [-3]: 30 }, { et0: 3, suelo: 0.1 }), V2, HOY);
    expect(r.motivo).toMatch(/esperar/);
  });
});

describe('semaforo v2 — golpe de calor y aire seco', () => {
  it('un día tras el episodio con máx ≥ media de 10 días + 8 °C → amarillo «golpe de calor»', () => {
    const r = semaforo(serie2(lluviaRepartida, {}, { [-5]: { tmax: 30 } }), V2, HOY);   // media 22 → +8
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/golpe de calor el 08\/10/);
    expect(semaforo(serie2(lluviaRepartida, {}, { [-5]: { tmax: 29.9 } }), V2, HOY).estado).toBe('verde');
  });
  it('el calor antes del episodio no cuenta', () => {
    expect(semaforo(serie2(lluviaRepartida, {}, { [-13]: { tmax: 35 } }), V2, HOY).estado).toBe('verde');
  });
  it('HR mínima < 30 % dos días seguidos tras la lluvia → amarillo «aire muy seco»; un día suelto, no', () => {
    const r = semaforo(serie2(lluviaRepartida, {}, { [-6]: { hr_min: 25 }, [-5]: { hr_min: 22 } }), V2, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/aire muy seco desde el 07\/10/);
    expect(semaforo(serie2(lluviaRepartida, {}, { [-6]: { hr_min: 25 }, [-4]: { hr_min: 22 } }), V2, HOY).estado).toBe('verde');
  });
  it('vale también sin umbrales de humedad (regla general)', () => {
    expect(semaforo(serie2({ [-12]: 30 }, {}, { [-2]: { tmax: 31 } }), AEREUS, HOY).estado).toBe('amarillo');
  });
});

describe('semaforo v2 — temporada', () => {
  const OTONO: Reglas = { ...V2, meses: [9, 10, 11, 12] };
  const PRIMAVERA: Reglas = { ...V2, meses: [3, 4, 5] };
  it('en temporada no cambia nada', () => {
    expect(semaforo(serie2(lluviaRepartida), OTONO, HOY).estado).toBe('verde');
  });
  it('fuera de temporada → rojo «fuera de temporada» con los meses', () => {
    const r = semaforo(serie2(lluviaRepartida), PRIMAVERA, HOY);
    expect(r.estado).toBe('rojo');
    expect(r.motivo).toBe('fuera de temporada (sale en mar, abr, may)');
  });
  it('fuera de temporada con episodio fuerte (≥1,5×) y suelo húmedo → amarillo con aviso', () => {
    const r = semaforo(serie2({ ...lluviaRepartida, [-12]: 40 }), PRIMAVERA, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/^fuera de temporada \(sale en mar, abr, may\), pero llovió fuerte/);
  });
  it('episodio fuerte pero suelo seco → rojo', () => {
    expect(semaforo(serie2({ [-12]: 60 }, { et0: 4, suelo: 0.1 }), PRIMAVERA, HOY).estado).toBe('rojo');
  });
  it('«esperar» cuenta el mes en que abre la ventana', () => {
    const NOV: Reglas = { ...V2, meses: [11] };
    expect(semaforo(serie2({ [-3]: 30 }), NOV, HOY).estado).toBe('rojo');   // abre el 18/10: octubre
  });
  it('«esperar» con la ventana abriendo ya en temporada → sigue amarillo', () => {
    const s = serie2({ [-3]: 30 }).map((d) => ({ ...d, fecha: sumarDias(d.fecha, 15) }));   // hoy = 28/10, abre el 02/11
    const r = semaforo(s, { ...V2, meses: [11] }, '2026-10-28');
    expect(r.estado).toBe('amarillo');
    expect(r.desde).toBe('2026-11-02');
  });
});

describe('bandaAltitud', () => {
  // Punto a 500 m con medias de 10 días tmin 12 y tmax 22; AEREUS: tmin 8–18, tmax 15–27.
  it('intersección de las dos bandas, redondeada a 50 m', () => {
    // tmin: a ∈ [500 + (12−18)/0,0065, 500 + (12−8)/0,0065] = [−423, 1115]; tmax: [500 − 769, 500 + 1077] = [−269, 1577]
    expect(bandaAltitud(serie(), HOY, AEREUS, 500)).toEqual({ desde: 0, hasta: 1100, encaja: true });
  });
  it('con calor la banda sube («empieza por arriba»)', () => {
    const b = bandaAltitud(serie({}, 18, 30), HOY, AEREUS, 300)!;
    // tmin: [300, 300 + 10/0,0065 = 1838]; tmax: [300 + 3/0,0065 = 762, 300 + 15/0,0065 = 2608] → [762, 1838]
    expect(b).toEqual({ desde: 750, hasta: 1850, encaja: true });
    expect(textoBanda(b, 300)).toBe('Empieza por arriba, mejor ahora entre 750 y 1850 m.');
  });
  it('con frío la banda baja («ya baja»)', () => {
    const b = bandaAltitud(serie({}, 4, 14), HOY, AEREUS, 1200)!;
    // tmin: [1200 + (4−18)/0,0065, 1200 − 4/0,0065 = 585]; tmax: [1200 − 13/0,0065 = −800, 1200 − 1/0,0065 = 1046]
    expect(b.encaja).toBe(true);
    expect(b.hasta).toBe(600);
    expect(textoBanda(b, 1200)).toBe('Ya baja, mejor ahora entre 0 y 600 m.');
  });
  it('la zona dentro de la banda', () => {
    expect(textoBanda({ desde: 0, hasta: 1100, encaja: true }, 500)).toBe('Esta altitud va bien, mejor ahora entre 0 y 1100 m.');
  });
  it('sin cota que cumpla las dos → la que menos se sale', () => {
    // amplitud térmica enorme: tmin 2 y tmax 30 → bajar sube la tmin pero pasa la tmax
    const b = bandaAltitud(serie({}, 2, 30), HOY, AEREUS, 500)!;
    expect(b.encaja).toBe(false);
    expect(textoBanda(b, 500)).toMatch(/^Ahora ninguna altitud tiene la temperatura justa/);
  });
  it('hoy fuera de la serie → null', () => {
    expect(bandaAltitud(serie(), '2027-01-01', AEREUS, 500)).toBeNull();
    expect(textoBanda(null, 500)).toBe('');
  });
});
