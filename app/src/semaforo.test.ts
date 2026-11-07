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
    expect(r.motivo).toBe('Ventana actual (lluvia del 01/10, 30 mm, hace 12 días): hasta ~21/10.');
    expect(r.proxima).toBeUndefined();
    expect(r.hasta).toBe(sumarDias(HOY, -12 + 20));
    expect(r.episodio).toBe(sumarDias(HOY, -12));
  });

  it('30 mm hace 3 días → rojo «esperar» (probabilidad baja de la rampa) con desde = episodio + ventana mínima', () => {
    const r = semaforo(serie({ [-3]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('rojo');
    expect(r.probabilidad).toBe(10);
    expect(r.motivo).toBe('Lluvia de 30 mm el 10/10: esperar. Ventana desde ~18/10 hasta ~30/10; puede adelantarse algún día.');
    expect(r.desde).toBe(sumarDias(HOY, -3 + 8));
  });

  it('seco 30 días → rojo «seco»', () => {
    const r = semaforo(serie({ [-20]: 5, [-10]: 8 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo' });
    expect(r.motivo).toBe('Seco: sin lluvia de 25 mm o más en 30 días.');
  });

  it('30 mm hace 30 días (vmax + caída) → rojo «ventana pasada», probabilidad 0', () => {
    const r = semaforo(serie({ [-30]: 30 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo', probabilidad: 0 });
    expect(r.motivo).toBe('Ventana pasada: la última lluvia buena fue el 13/09, hace 30 días.');
  });

  it('30 mm hace 12 días con frío (tmin 3, 5 °C fuera) → rojo por temperatura, indicando cuál falla', () => {
    const r = semaforo(serie({ [-12]: 30 }, 3, 22), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo', probabilidad: 15 });   // 90 × (1 − 5/6)
    expect(r.motivo).toBe('Lluvia suficiente (30 mm el 01/10) pero mínimas frías (3,0 °C; favorable 8–18). Si templa, ventana hasta ~21/10.');
    expect(r.motivo).toMatch(/mínimas/);
    expect(r.motivo).not.toMatch(/máximas/);
  });

  it('esperar con temperatura fuera de rango: el motivo lo dice', () => {
    const r = semaforo(serie({ [-3]: 30 }, 12, 32), AEREUS, HOY);
    expect(r.estado).toBe('rojo');
    expect(r.motivo).toMatch(/esperar/);
    expect(r.motivo).toMatch(/Máximas altas \(32,0 °C; favorable 15–27\)/);
  });

  it('lluvia repartida en 3 días (10+10+10) cuenta como episodio; el episodio acaba el último día', () => {
    const r = semaforo(serie({ [-14]: 10, [-13]: 10, [-12]: 10 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.episodio).toBe(sumarDias(HOY, -12));
    // repartida en 4 días no llega en ninguna ventana de 3
    expect(semaforo(serie({ [-15]: 8, [-14]: 8, [-13]: 8, [-12]: 8 }), AEREUS, HOY)).toMatchObject({ estado: 'rojo', probabilidad: 0 });
  });

  it('episodio solo en la previsión → rojo «lluvia prevista el DD/MM» (hoy no sale nada)', () => {
    const r = semaforo(serie({ [2]: 30 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo', probabilidad: 0 });
    expect(r.motivo).toBe('Lluvia prevista el 15/10 (30 mm): esperar. Ventana desde ~23/10 hasta ~04/11.');
    expect(r.desde).toBe(sumarDias(HOY, 2 + 8));
  });

  it('ventana abierta y además lluvia prevista: sigue verde (la lluvia futura no baja la de hoy) y el motivo la añade', () => {
    const r = semaforo(serie({ [-12]: 30, [3]: 40 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'verde', probabilidad: 90 });
    expect(r.motivo).toBe('Ventana actual (lluvia del 01/10, 30 mm, hace 12 días): hasta ~21/10. Próxima ventana (lluvia prevista el 16/10): desde ~24/10.');
    expect(r.proxima).toEqual({ desde: '2026-10-24', hasta: '2026-11-05', episodio: '2026-10-16', lluvia_mm: 40, prevista: true });
  });

  it('caché de más de 72 h → gris «datos antiguos»', () => {
    const r = semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 73 });
    expect(r).toEqual({ estado: 'gris', motivo: 'datos antiguos' });
    expect(semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 71 }).estado).toBe('verde');
  });

  it('con 2 episodios manda el que más probabilidad da hoy; a igualdad, el más reciente', () => {
    const r = semaforo(serie({ [-25]: 40, [-3]: 30 }), AEREUS, HOY);   // caída (0,5) frente a rampa recién empezada (0,11)
    expect(r).toMatchObject({ estado: 'amarillo', probabilidad: 45, episodio: sumarDias(HOY, -25) });
    expect(r.motivo).toBe('Ventana del 18/09 terminando (40 mm, hace 25 días; la ventana típica acabó el ~08/10): aún puede quedar algo unos días.'
      + ' Próxima ventana (lluvia del 10/10): desde ~18/10.');
    const r2 = semaforo(serie({ [-28]: 40, [-12]: 30 }), AEREUS, HOY);
    expect(r2).toMatchObject({ estado: 'verde', episodio: sumarDias(HOY, -12) });
    expect(semaforo(serie({ [-16]: 30, [-12]: 30 }), AEREUS, HOY).episodio).toBe(sumarDias(HOY, -12));
  });

  it('meseta inclusiva [vmin, vmax] a P_MAX; justo fuera, rampa y caída suaves (no rojo seco)', () => {
    expect(semaforo(serie({ [-8]: 30 }), AEREUS, HOY).probabilidad).toBe(90);
    expect(semaforo(serie({ [-20]: 30 }), AEREUS, HOY).probabilidad).toBe(90);
    expect(semaforo(serie({ [-21]: 30 }), AEREUS, HOY)).toMatchObject({ estado: 'verde', probabilidad: 81 });
    expect(semaforo(serie({ [-7]: 30 }), AEREUS, HOY)).toMatchObject({ estado: 'verde', probabilidad: 74 });
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

  it('lluvia fuerte hoy con una ventana abierta por una lluvia anterior → sigue verde y anuncia la nueva ventana', () => {
    const r = semaforo(serie({ [-14]: 30, 0: 36 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.episodio).toBe(sumarDias(HOY, -14));
    expect(r.motivo).toBe('Ventana actual (lluvia del 29/09, 30 mm, hace 14 días): hasta ~19/10. Próxima ventana (lluvia del 13/10): desde ~21/10.'
      + ' Aguacero hoy (36 mm): barro y accesos difíciles.');
    expect(r.hasta).toBe('2026-10-19');
    expect(r.proxima).toMatchObject({ desde: '2026-10-21', episodio: '2026-10-13', prevista: false });
  });

  it('lluvia reciente y la anterior acabándose → manda la que acaba (poco) y la nueva se anuncia', () => {
    const r = semaforo(serie({ [-28]: 30, [-2]: 30 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo', probabilidad: 18, episodio: sumarDias(HOY, -28) });
    expect(r.motivo).toMatch(/terminando .* Próxima ventana \(lluvia del 11\/10\): desde ~19\/10\.$/);
    expect(r.proxima).toBeUndefined();   // en rojo no va `proxima`
  });

  it('ventana anterior abierta pero temperatura muy fuera de rango → rojo, no verde', () => {
    const r = semaforo(serie({ [-14]: 30, 0: 36 }, 2, 10), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo', probabilidad: 0 });
  });

});

describe('semaforo — hallazgos de revisión', () => {
  it('lluvia pasada en la rampa + lluvia prevista → manda la pasada y se anota la prevista', () => {
    const r = semaforo(serie({ [-5]: 40, [2]: 25 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'amarillo', probabilidad: 42 });
    expect(r.desde).toBe(sumarDias(HOY, -5 + 8));
    expect(r.motivo).toMatch(new RegExp(`lluvia prevista el ${sumarDias(HOY, 2).slice(8, 10)}/`));
  });

  it('dos episodios previstos → manda el más cercano', () => {
    const r = semaforo(serie({ [2]: 30, [5]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('rojo');
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
  it('una sola tormenta en otoño seco → resta (× f_humedad), no bloquea: «lluvia puntual, suelo aún seco»', () => {
    const r = semaforo(serie2({ [-12]: 30 }, { et0: 3, suelo: 0.1 }), V2, HOY);
    expect(r).toMatchObject({ estado: 'verde', probabilidad: 59 });   // 90 × 0,65
    expect(r.motivo).toMatch(/^Lluvia puntual, suelo aún seco/);
    expect(r.motivo).toMatch(/balance −60 mm en 30 días y 1 día de lluvia; llovieron 30 mm/);
  });
  it('lluvia repartida y balance suficiente → verde', () => {
    expect(semaforo(serie2(lluviaRepartida, { et0: 2, suelo: 0.1 }), V2, HOY).estado).toBe('verde');
  });
  it('balance bajo pero suelo húmedo (y días suficientes) → verde: basta una de las dos', () => {
    expect(semaforo(serie2(lluviaRepartida, { et0: 4, suelo: 0.18 }), V2, HOY).probabilidad).toBe(90);
    expect(semaforo(serie2(lluviaRepartida, { et0: 4, suelo: 0.1 }), V2, HOY).probabilidad).toBe(59);
  });
  it('pocos días de lluvia → resta aunque el suelo esté húmedo', () => {
    expect(semaforo(serie2({ [-12]: 60 }, { et0: 1, suelo: 0.3 }), V2, HOY).probabilidad).toBe(59);
  });
  it('sin umbrales en las reglas (manifest antiguo) → no se comprueba', () => {
    expect(semaforo(serie2({ [-12]: 30 }, { et0: 3, suelo: 0.1 }), AEREUS, HOY).estado).toBe('verde');
  });
  it('sin datos de ET0 ni suelo solo cuentan los días de lluvia', () => {
    expect(semaforo(serie(lluviaRepartida), V2, HOY).probabilidad).toBe(90);
    expect(semaforo(serie({ [-12]: 30 }), V2, HOY).probabilidad).toBe(59);
  });
  it('solo afecta al verde: «esperar» sigue igual', () => {
    const r = semaforo(serie2({ [-3]: 30 }, { et0: 3, suelo: 0.1 }), V2, HOY);
    expect(r.motivo).toMatch(/esperar/);
  });
});

describe('semaforo v2 — golpe de calor y aire seco', () => {
  it('un día tras el episodio con máx ≥ media de 10 días + 8 °C → resta (× f_estres) «golpe de calor»', () => {
    const r = semaforo(serie2(lluviaRepartida, {}, { [-5]: { tmax: 30 } }), V2, HOY);   // media 22 → +8
    expect(r.probabilidad).toBe(63);   // 90 × 0,7
    expect(r.motivo).toMatch(/^Golpe de calor el 08\/10/);
    expect(semaforo(serie2(lluviaRepartida, {}, { [-5]: { tmax: 29.9 } }), V2, HOY).probabilidad).toBe(90);
  });
  it('el calor antes del episodio no cuenta', () => {
    expect(semaforo(serie2(lluviaRepartida, {}, { [-13]: { tmax: 35 } }), V2, HOY).probabilidad).toBe(90);
  });
  it('HR mínima < 30 % dos días seguidos tras la lluvia → resta «aire muy seco»; un día suelto, no', () => {
    const r = semaforo(serie2(lluviaRepartida, {}, { [-6]: { hr_min: 25 }, [-5]: { hr_min: 22 } }), V2, HOY);
    expect(r.probabilidad).toBe(63);
    expect(r.motivo).toMatch(/^Aire muy seco desde el 07\/10/);
    expect(semaforo(serie2(lluviaRepartida, {}, { [-6]: { hr_min: 25 }, [-4]: { hr_min: 22 } }), V2, HOY).probabilidad).toBe(90);
  });
  it('vale también sin umbrales de humedad (regla general)', () => {
    expect(semaforo(serie2({ [-12]: 30 }, {}, { [-2]: { tmax: 31 } }), AEREUS, HOY).probabilidad).toBe(63);
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
    expect(r).toMatchObject({ estado: 'rojo', probabilidad: 18 });   // 90 × 0,2
    expect(r.motivo).toBe('Fuera de temporada (sale en mar, abr, may).');
  });
  it('fuera de temporada con episodio fuerte (≥1,5×) y suelo húmedo → amarillo con aviso', () => {
    const r = semaforo(serie2({ ...lluviaRepartida, [-12]: 40 }), PRIMAVERA, HOY);
    expect(r).toMatchObject({ estado: 'amarillo', probabilidad: 41 });   // 90 × 0,45
    expect(r.motivo).toMatch(/^Fuera de temporada \(sale en mar, abr, may\), pero llovió fuerte/);
  });
  it('episodio fuerte pero suelo seco → rojo', () => {
    expect(semaforo(serie2({ [-12]: 60 }, { et0: 4, suelo: 0.1 }), PRIMAVERA, HOY).estado).toBe('rojo');
  });
  it('«esperar» cuenta el mes en que abre la ventana', () => {
    const NOV: Reglas = { ...V2, meses: [11] };
    expect(semaforo(serie2({ [-3]: 30 }), NOV, HOY).estado).toBe('rojo');   // abre el 18/10: octubre
  });
  it('«esperar» con la ventana abriendo ya en temporada → no se rebaja por temporada y conserva `desde`', () => {
    const s = serie2({ [-3]: 30 }).map((d) => ({ ...d, fecha: sumarDias(d.fecha, 15) }));   // hoy = 28/10, abre el 02/11
    const r = semaforo(s, { ...V2, meses: [11] }, '2026-10-28');
    expect(r.motivo).toMatch(/esperar/);
    expect(r.desde).toBe('2026-11-02');
    expect(r.probabilidad).toBe(semaforo(s, V2, '2026-10-28').probabilidad);
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

describe('semaforo — ventana actual y próxima sin contradicción (caso del 18/10/26)', () => {
  // Marbella, 18/10: 27 mm el 04/10 (ventana abierta hasta el 24/10) y lluvia nueva el 18/10 (ventana desde el 26/10).
  const H = '2026-10-18';
  const s18 = (tmin: number, tmax: number) => Array.from({ length: 37 }, (_, i) => {
    const fecha = sumarDias(H, i - 30);
    return { fecha, lluvia: fecha === '2026-10-04' ? 27 : fecha === '2026-10-18' ? 26 : 0, tmin, tmax };
  });

  it('verde: cada fecha dice de qué lluvia es; la próxima va en `proxima`', () => {
    const r = semaforo(s18(12, 22), AEREUS, H);
    expect(r.estado).toBe('verde');
    expect(r.motivo).toBe('Ventana actual (lluvia del 04/10, 27 mm, hace 14 días): hasta ~24/10. Próxima ventana (lluvia del 18/10): desde ~26/10.');
    expect(r.hasta).toBe('2026-10-24');
    expect(r.proxima).toEqual({ desde: '2026-10-26', hasta: '2026-11-07', episodio: '2026-10-18', lluvia_mm: 26, prevista: false });
    expect(r.motivo).not.toMatch(/abrirá otra hacia/);
  });

  it('temperatura 1,5 °C fuera: resta (verde 68) y el motivo lo dice: «Lluvia suficiente pero mínimas altas … Si refresca…»', () => {
    const r = semaforo(s18(16.5, 24), { ...AEREUS, tmin_media: [5, 15] }, H);
    expect(r).toMatchObject({ estado: 'verde', probabilidad: 68 });   // 90 × (1 − 1,5/6)
    expect(r.motivo).toBe('Lluvia suficiente (27 mm el 04/10) pero mínimas altas (16,5 °C; favorable 5–15). Si refresca, ventana hasta ~24/10; próxima desde ~26/10 (lluvia del 18/10).');
    expect(r.proxima?.desde).toBe('2026-10-26');
    expect(r.desde).toBeUndefined();   // no hay «desde» de la actual: no se confunde con «esperar»
  });

  it('rampa con otra lluvia prevista: la segunda ventana se nombra como «próxima»', () => {
    const r = semaforo(serie({ [-5]: 40, [2]: 25 }), AEREUS, HOY);
    expect(r.motivo).toBe('Lluvia de 40 mm el 08/10: la ventana está abriendo (suele empezar hacia ~16/10; hasta ~28/10).'
      + ' Próxima ventana (lluvia prevista el 15/10): desde ~23/10.');
  });

  it('rojo no lleva `proxima`', () => {
    const r = semaforo(serie({ [-25]: 30 }), AEREUS, HOY);
    expect(r.proxima).toBeUndefined();
  });
});

// ---------------------------------------------------------------- v3: probabilidad (docs/investigacion/2026-11-07-semaforo-probabilidad.md)
import { estadoDe, factorTiempo, PARAMS, UMBRAL_AMARILLO, UMBRAL_VERDE } from './semaforo';
import ojen from './__fixtures__/meteo-punto38-2026-11-07.json';

describe('semaforo v3 — probabilidad', () => {
  it('el color sale de la probabilidad con los umbrales exportados', () => {
    expect([UMBRAL_VERDE, UMBRAL_AMARILLO]).toEqual([50, 20]);
    expect([estadoDe(50), estadoDe(49), estadoDe(20), estadoDe(19), estadoDe(0)]).toEqual(['verde', 'amarillo', 'amarillo', 'rojo', 'rojo']);
  });
  it('probabilidad entera 0–100 en todos los casos con datos; gris sin probabilidad', () => {
    for (const ll of [{}, { [-12]: 30 }, { [-3]: 30 }, { [-25]: 30 }, { [2]: 30 }] as Record<number, number>[]) {
      const r = semaforo(serie(ll), AEREUS, HOY);
      expect(Number.isInteger(r.probabilidad)).toBe(true);
      expect(r.probabilidad).toBeGreaterThanOrEqual(0);
      expect(r.probabilidad).toBeLessThanOrEqual(100 * PARAMS.p_max);
      expect(r.estado).toBe(estadoDe(r.probabilidad!));
    }
    expect(semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 73 }).probabilidad).toBeUndefined();
  });
  it('factor del tiempo: rampa antes de vmin (nunca antes de 0,3·vmin), meseta y caída lineal hasta vmax + max(10, 0,4·ancho)', () => {
    // AEREUS: ventana 8–20 → rampa desde el día 2,4, caída de 10 días
    expect(factorTiempo(-1, AEREUS)).toBe(0);
    expect(factorTiempo(2, AEREUS)).toBe(0);
    expect(factorTiempo(5, AEREUS)).toBeCloseTo((5 - 2.4) / 5.6);
    expect([8, 14, 20].map((d) => factorTiempo(d, AEREUS))).toEqual([1, 1, 1]);
    expect(factorTiempo(25, AEREUS)).toBeCloseTo(0.5);
    expect(factorTiempo(30, AEREUS)).toBe(0);
    // ventana ancha (20–40): la caída dura max(10, 8) = 10; rampa desde el día 9
    const ancha: Reglas = { ...AEREUS, ventana_dias: [20, 40] };
    expect(factorTiempo(45, ancha)).toBeCloseTo(0.5);
    expect(factorTiempo(9, ancha)).toBe(0);
  });
  it('caída suave: la ventana pasada hace pocos días no es rojo seco y baja día a día', () => {
    const ps = [21, 23, 25, 27, 29, 30].map((d) => semaforo(serie({ [-d]: 30 }), AEREUS, HOY).probabilidad);
    expect(ps).toEqual([81, 63, 45, 27, 9, 0]);
    const r = semaforo(serie({ [-23]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.motivo).toBe('Ventana del 20/09 terminando (30 mm, hace 23 días; la ventana típica acabó el ~10/10): aún puede quedar algo unos días.');
  });
  it('temperatura casi en rango (0,2 °C fuera) cuesta poco y no suena a bloqueo', () => {
    const r = semaforo(serie({ [-12]: 30 }, 12, 14.8), AEREUS, HOY);   // máximas 14,8; favorable 15–27
    expect(r).toMatchObject({ estado: 'verde', probabilidad: 87 });
    expect(r.motivo).toBe('Ventana actual (lluvia del 01/10, 30 mm, hace 12 días): hasta ~21/10. Máximas casi en rango (14,8 °C; favorable 15–27): resta poco.');
    expect(r.motivo).not.toMatch(/pero|fuera de rango/);
  });
  it('la lluvia prevista no baja la probabilidad de hoy', () => {
    for (const d of [10, 18, 23]) {
      expect(semaforo(serie({ [-d]: 30, [2]: 40 }), AEREUS, HOY).probabilidad).toBe(semaforo(serie({ [-d]: 30 }), AEREUS, HOY).probabilidad);
    }
  });
  it('nunca usa la palabra «comestible»', () => {
    for (const ll of [{}, { [-12]: 30 }, { [-3]: 30 }, { [-25]: 30 }, { [2]: 30 }, { [-28]: 30, [-2]: 30 }] as Record<number, number>[]) {
      expect(semaforo(serie(ll, 3, 32), AEREUS, HOY).motivo).not.toMatch(/comestible/i);
    }
  });
});

describe('semaforo v3 — casos de campo de noviembre de 2026 (Open-Meteo real, punto meteo 38, Monda)', () => {
  // Reglas de la región Marbella (pipeline/especies.yaml).
  const CAESAREA: Reglas = { episodio_mm: 20, ventana_dias: [7, 16], tmin_media: [12, 20], tmax_media: [20, 30], balance_30d_min_mm: -30,
    dias_lluvia_30d_min: 3, humedad_suelo_min: 0.15, meses: [7, 8, 9, 10, 11] };
  const SUILLUS: Reglas = { episodio_mm: 15, ventana_dias: [7, 18], tmin_media: [6, 16], tmax_media: [14, 24], balance_30d_min_mm: -30,
    dias_lluvia_30d_min: 3, humedad_suelo_min: 0.15, meses: [10, 11, 12] };
  const SANGUIFLUUS: Reglas = { episodio_mm: 25, ventana_dias: [20, 40], tmin_media: [3, 14], tmax_media: [10, 22], balance_30d_min_mm: -30,
    dias_lluvia_30d_min: 4, humedad_suelo_min: 0.15, meses: [10, 11, 12, 1] };
  const s = ojen.serie as Dia[];
  it('oronja en Venta Pula (Ojén) el 03/11 (iNat 412643652): verde', () => {
    const r = semaforo(s, CAESAREA, '2026-11-03');
    expect(r.estado).toBe('verde');
    expect(r.episodio).toBe('2026-10-19');
  });
  it('oronja hoy 07/11: ventana del 19/10 terminando, amarillo alto (v2 daba amarillo «esperar» por la lluvia del 09/11)', () => {
    const r = semaforo(s, CAESAREA, '2026-11-07');
    expect(r.estado).toBe('amarillo');
    expect(r.probabilidad).toBeGreaterThanOrEqual(35);
    expect(r.episodio).toBe('2026-10-19');
    expect(r.motivo).toMatch(/^Ventana del 19\/10 terminando/);
    expect(r.motivo).toMatch(/Máximas casi en rango \(19,\d °C; favorable 20–30\): resta poco/);
  });
  it('Suillus y L. sanguifluus hoy 07/11 junto a Monda (hallazgo de campo): ≥ amarillo', () => {
    expect(semaforo(s, SUILLUS, '2026-11-07').estado).toBe('verde');
    expect(semaforo(s, SANGUIFLUUS, '2026-11-07').probabilidad).toBeGreaterThanOrEqual(UMBRAL_AMARILLO);
  });
});
