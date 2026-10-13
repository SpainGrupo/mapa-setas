import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';
import {
  ALERTAS, AVISO_EXPERTO, DESCARTES, evaluar, gruposDe, NO_SE, PELIGROSAS_GRUPO, PREGUNTA, PREGUNTAS,
  respuestasParaWorker, sinComestible, type Evaluacion, type FichaMin, type Respuestas,
} from './seguridad';

const fichas: FichaMin[] = datos as never;
const porId = new Map(fichas.map((f) => [f.id, f]));
const cand = (...ids: string[]) => ids.map((id) => ({ nombre: porId.get(id)!.nombre_cientifico, idGuia: id }));
const noDescartadas = (e: Evaluacion) => e.peligrosas.filter((p) => !p.descartada).map((p) => p.id);
const descartadas = (e: Evaluacion) => e.peligrosas.filter((p) => p.descartada).map((p) => p.id);

describe('datos de seguridad coherentes con la guía', () => {
  it('las peligrosas de cada grupo existen y son mortales o tóxicas', () => {
    for (const ids of Object.values(PELIGROSAS_GRUPO)) for (const id of ids) {
      expect(['mortal', 'toxica'], id).toContain(porId.get(id)?.grupo);
    }
  });
  it('toda mortal y tóxica de la guía pertenece a algún grupo (si no, ninguna foto la activaría)', () => {
    const cubiertas = new Set(Object.values(PELIGROSAS_GRUPO).flat());
    for (const f of fichas) if (f.grupo === 'mortal' || f.grupo === 'toxica') expect(cubiertas.has(f.id), f.id).toBe(true);
  });
  it('reglas y alertas citan preguntas y respuestas que existen, y nunca «no sé»', () => {
    for (const r of [...DESCARTES, ...ALERTAS]) for (const [q, vals] of Object.entries(r.si)) {
      expect(PREGUNTA[q], q).toBeDefined();
      for (const v of vals) {
        expect(PREGUNTA[q].opciones.map((o) => o.v), `${q}=${v}`).toContain(v);
        expect(v).not.toBe(NO_SE);
      }
    }
    for (const r of DESCARTES) expect(porId.has(r.especie), r.especie).toBe(true);
  });
  it('todas las preguntas tienen «No sé» y claves válidas para el Worker', () => {
    for (const p of PREGUNTAS) {
      expect(p.opciones.some((o) => o.v === NO_SE), p.id).toBe(true);
      expect(p.id).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    }
    expect(PREGUNTAS.length).toBeLessThanOrEqual(20);
  });
  it('los textos de preguntas, alertas y motivos no dicen «comestible»', () => {
    const textos = [...PREGUNTAS.flatMap((p) => [p.texto, p.ayuda ?? '', ...p.opciones.map((o) => o.t)]),
      ...ALERTAS.map((a) => a.texto), ...DESCARTES.map((d) => d.motivo), AVISO_EXPERTO];
    for (const t of textos) expect(t).not.toMatch(/comestible|se puede comer/i);
  });
});

describe('grupos morfológicos', () => {
  it.each([
    ['Amanita caesarea', ['amanitoide']], ['Amanita virosa', ['amanitoide']], ['Agaricus campestris', ['amanitoide']],
    ['Boletus edulis', ['boletoide']], ['Suillus bellinii', ['boletoide']], ['Cantharellus cibarius', ['cantareloide']],
    ['Omphalotus olearius', ['cantareloide']], ['Macrolepiota procera', ['lepiotoide']], ['Lactarius deliciosus', ['lactarioide']],
    ['Leucoagaricus leucothites', ['amanitoide', 'lepiotoide']], ['Russula cyanoxantha', ['otros']], ['Trametes versicolor', ['otros']],
  ])('%s → %j', (n, g) => expect(gruposDe(n)).toEqual(g));
});

describe('A. caesarea en el top-1', () => {
  const c = cand('amanita_caesarea');
  it('activa el grupo amanitoide y lista phalloides y verna (mortales) como no descartadas', () => {
    const e = evaluar(c, fichas, {});
    expect(e.grupos).toEqual(['amanitoide']);
    expect(noDescartadas(e).slice(0, 2).sort()).toEqual(['amanita_phalloides', 'amanita_verna']);
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_muscaria', 'amanita_pantherina']));
    expect(e.alertas).toEqual([]);
    expect(e.aviso).toBe(AVISO_EXPERTO);
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['interior_huevo', 'laminas_pie_color', 'volva_saco']));
  });
  it('«no sé» en todo las mantiene', () => {
    const r: Respuestas = Object.fromEntries(PREGUNTAS.map((p) => [p.id, NO_SE]));
    const e = evaluar(c, fichas, r);
    expect(descartadas(e)).toEqual([]);
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna']));
  });
  it('«no es un huevo» no descarta nada', () => {
    expect(descartadas(evaluar(c, fichas, { interior_huevo: 'no_es_huevo' }))).toEqual([]);
  });
  it('interior naranja y amarillo descarta phalloides, verna y pantherina, pero no muscaria; el aviso sigue', () => {
    const e = evaluar(c, fichas, { interior_huevo: 'naranja_amarillo' });
    expect(descartadas(e).sort()).toEqual(['amanita_pantherina', 'amanita_phalloides', 'amanita_verna']);
    expect(noDescartadas(e)).toEqual(['amanita_muscaria']);
    expect(e.peligrosas.find((p) => p.id === 'amanita_phalloides')?.motivo).toMatch(/naranja/);
    expect(e.aviso).toBe(AVISO_EXPERTO);
  });
  it('láminas y pie amarillos descartan también muscaria', () => {
    expect(noDescartadas(evaluar(c, fichas, { laminas_pie_color: 'amarillos' }))).toEqual([]);
  });
  it('interior blanco → alerta roja MORTAL, y phalloides/verna no se pueden descartar con otra respuesta', () => {
    const e = evaluar(c, fichas, { interior_huevo: 'blanco', laminas_pie_color: 'amarillos' });
    expect(e.alertas).toHaveLength(1);
    expect(e.alertas[0]).toMatchObject({ nivel: 'mortal', especies: ['amanita_phalloides', 'amanita_verna'] });
    expect(e.alertas[0].texto).toMatch(/MORTALES/);
    expect(noDescartadas(e).slice(0, 2)).toEqual(['amanita_phalloides', 'amanita_verna']);
    expect(e.peligrosas.slice(0, 2).every((p) => p.alerta)).toBe(true);
  });
  it('láminas blancas + volva en saco → alerta MORTAL; con volva «no sé» no hay alerta', () => {
    expect(evaluar(c, fichas, { laminas_pie_color: 'blancos', volva_saco: 'si' }).alertas[0]?.nivel).toBe('mortal');
    expect(evaluar(c, fichas, { laminas_pie_color: 'blancos', volva_saco: NO_SE }).alertas).toEqual([]);
  });
});

describe('especies mortales fuera del top-5 o del vocabulario siguen saliendo por el grupo', () => {
  it('una Amanita sin ficha (A. virosa) activa phalloides y verna', () => {
    const e = evaluar([{ nombre: 'Amanita virosa' }], fichas, {});
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna']));
    expect(e.peligrosas.find((p) => p.id === 'amanita_verna')?.origen[0]).toMatch(/^grupo:/);
  });
  it('Russula cyanoxantha (grupo «otros») trae A. phalloides por «No confundir con…»', () => {
    const e = evaluar(cand('russula_cyanoxantha'), fichas, {});
    expect(e.grupos).toEqual(['otros']);
    expect(noDescartadas(e)).toEqual(['amanita_phalloides']);
    expect(e.peligrosas[0].origen).toEqual(['se confunde con Russula cyanoxantha']);
    expect(e.preguntas.map((p) => p.id)).toContain('interior_huevo');
  });
  it('«no reconocido» lista todas las mortales de la guía', () => {
    const e = evaluar([], fichas, {}, true);
    expect(noDescartadas(e).sort()).toEqual(['amanita_phalloides', 'amanita_verna', 'lepiota_brunneoincarnata']);
  });
  it('una seta sin grupo ni confusiones no inventa peligrosas, pero el aviso fijo sigue', () => {
    const e = evaluar([{ nombre: 'Trametes versicolor' }], fichas, {});
    expect(e.peligrosas).toEqual([]);
    expect(e.preguntas).toEqual([]);
    expect(e.aviso).toBe(AVISO_EXPERTO);
  });
  it('un candidato peligroso aparece como «es uno de los candidatos»', () => {
    const e = evaluar(cand('amanita_phalloides'), fichas, {});
    expect(e.peligrosas[0]).toMatchObject({ id: 'amanita_phalloides', nivel: 'mortal', descartada: false });
    expect(e.peligrosas[0].origen).toContain('es uno de los candidatos');
  });
  it('los candidatos no peligrosos (sinónimos incluidos) nunca salen como peligrosas', () => {
    const e = evaluar([{ nombre: 'Boletus aestivalis', idGuia: 'boletus_reticulatus' }], fichas, {});
    expect(e.peligrosas.map((p) => p.id)).not.toContain('boletus_reticulatus');
    expect(e.grupos).toEqual(['boletoide']);
  });
});

describe('boletos', () => {
  const c = cand('boletus_edulis');
  it('lista las cuatro tóxicas del grupo', () => {
    expect(noDescartadas(evaluar(c, fichas, {})).sort()).toEqual(
      ['caloboletus_calopus', 'caloboletus_radicans', 'rubroboletus_satanas', 'tylopilus_felleus']);
  });
  it('con poros rojos R. satanas NO se descarta (aunque no azulee)', () => {
    const e = evaluar(c, fichas, { color_poros: 'rojo_naranja', azulea_al_corte: 'no', color_reticulo: 'claro' });
    expect(noDescartadas(e)).toEqual(['rubroboletus_satanas']);
  });
  it('poros claros + no azulea + red clara descartan las cuatro', () => {
    const e = evaluar(c, fichas, { color_poros: 'blanco_amarillo_verdoso', azulea_al_corte: 'no', color_reticulo: 'claro' });
    expect(noDescartadas(e)).toEqual([]);
  });
  it('si azulea, ninguna se descarta salvo T. felleus por poros y red claros', () => {
    const e = evaluar(c, fichas, { color_poros: 'blanco_amarillo_verdoso', azulea_al_corte: 'si', color_reticulo: 'claro' });
    expect(descartadas(e)).toEqual(['tylopilus_felleus']);
  });
  it('red parda oscura mantiene T. felleus', () => {
    const e = evaluar(c, fichas, { color_poros: 'blanco_amarillo_verdoso', azulea_al_corte: 'no', color_reticulo: 'pardo_oscuro' });
    expect(noDescartadas(e)).toEqual(['tylopilus_felleus']);
  });
});

describe('rebozuelos', () => {
  const c = cand('cantharellus_cibarius');
  it('Omphalotus no descartado hasta pliegues + no en matas', () => {
    expect(noDescartadas(evaluar(c, fichas, {}))).toEqual(['omphalotus_olearius']);
    expect(noDescartadas(evaluar(c, fichas, { himenio_cantarelo: 'pliegues' }))).toEqual(['omphalotus_olearius']);
    expect(noDescartadas(evaluar(c, fichas, { himenio_cantarelo: 'pliegues', en_matas_madera: 'no' }))).toEqual([]);
  });
  it('láminas + en matas → alerta de tóxica', () => {
    const e = evaluar(c, fichas, { himenio_cantarelo: 'laminas', en_matas_madera: 'si' });
    expect(e.alertas).toEqual([expect.objectContaining({ nivel: 'toxica', especies: ['omphalotus_olearius'] })]);
  });
});

describe('parasoles', () => {
  const c = cand('macrolepiota_procera');
  it('lista L. brunneoincarnata (mortal) primero, y C. rhacodes y A. pantherina', () => {
    const e = evaluar(c, fichas, {});
    expect(noDescartadas(e)[0]).toBe('lepiota_brunneoincarnata');
    expect(noDescartadas(e).sort()).toEqual(['amanita_pantherina', 'chlorophyllum_rhacodes', 'lepiota_brunneoincarnata']);
  });
  it('sombrero >10 cm + anillo doble móvil + piel de serpiente + carne que no enrojece descartan las tres', () => {
    const e = evaluar(c, fichas, { sombrero_mayor_10cm: 'si', anillo_doble_movil: 'si', pie_serpiente: 'si', carne_enrojece: 'no' });
    expect(noDescartadas(e)).toEqual([]);
  });
  it('sombrero pequeño → alerta MORTAL de lepiota', () => {
    const e = evaluar(c, fichas, { sombrero_mayor_10cm: 'no', anillo_doble_movil: 'si' });
    expect(e.alertas[0]).toMatchObject({ nivel: 'mortal', especies: ['lepiota_brunneoincarnata'] });
    expect(noDescartadas(e)).toContain('lepiota_brunneoincarnata');
  });
});

describe('níscalos', () => {
  const c = cand('lactarius_deliciosus');
  it('látex naranja descarta las dos tóxicas; blanco las mantiene', () => {
    expect(noDescartadas(evaluar(c, fichas, { color_latex: 'naranja_zanahoria' }))).toEqual([]);
    expect(noDescartadas(evaluar(c, fichas, { color_latex: 'blanco' })).sort()).toEqual(['lactarius_chrysorrheus', 'lactarius_torminosus']);
  });
  it('una especie afín (L. vinosus → ficha de L. deliciosus) activa también el grupo', () => {
    const e = evaluar([{ nombre: 'Lactarius vinosus', idGuia: 'lactarius_deliciosus' }], fichas, {});
    expect(e.grupos).toEqual(['lactarioide']);
  });
});

describe('cada regla de descarte exige todas sus condiciones; «no sé» en cualquiera la anula', () => {
  for (const r of DESCARTES) {
    it(`${r.especie}: ${r.motivo}`, () => {
      const c = cand(r.especie);
      const todas = Object.fromEntries(Object.entries(r.si).map(([q, v]) => [q, v[0]]));
      const e = evaluar(c, fichas, todas);
      const alerta = e.peligrosas.find((p) => p.id === r.especie)!.alerta;
      if (!alerta) expect(descartadas(e)).toContain(r.especie);
      for (const q of Object.keys(r.si)) {
        const conNoSe = evaluar(c, fichas, { ...todas, [q]: NO_SE });
        const sigue = conNoSe.peligrosas.find((p) => p.id === r.especie)!;
        const otra = DESCARTES.some((o) => o !== r && o.especie === r.especie
          && Object.entries(o.si).every(([qq, vv]) => qq !== q && vv.includes(todas[qq])));
        if (!otra) expect(sigue.descartada, `${r.especie} con ${q}=no_se`).toBe(false);
      }
    });
  }
});

describe('textos para fuera', () => {
  it('respuestasParaWorker: texto legible y «no sé»/sin responder → null', () => {
    const ps = [PREGUNTA.interior_huevo, PREGUNTA.volva_saco, PREGUNTA.color_latex];
    expect(respuestasParaWorker(ps, { interior_huevo: 'naranja_amarillo', volva_saco: NO_SE }))
      .toEqual({ interior_huevo: 'Naranja y amarillo', volva_saco: null, color_latex: null });
    expect(respuestasParaWorker([PREGUNTA.volva_saco], { volva_saco: 'inventada' })).toEqual({ volva_saco: null });
  });
  it('sinComestible borra afirmaciones de comestibilidad', () => {
    expect(sinComestible('Buen comestible, se puede comer. Apta para el consumo.')).not.toMatch(/comestible|se puede comer|consumo/i);
    expect(sinComestible('Láminas amarillas')).toBe('Láminas amarillas');
  });
});
