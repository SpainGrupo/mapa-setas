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
const MORTALES = fichas.filter((f) => f.grupo === 'mortal').map((f) => f.id).sort();
/** Quita las mortales que salen siempre (irrelevantes para el grupo que se prueba). */
const sinMortales = (ids: (string | undefined)[]) => ids.filter((id) => !MORTALES.includes(id as string));
const mortalesPresentes = (e: Evaluacion, descartadasEsperadas: string[] = []) => {
  for (const m of MORTALES) {
    const p = e.peligrosas.find((x) => x.id === m);
    expect(p, m).toBeDefined();
    expect(p!.descartada, m).toBe(descartadasEsperadas.includes(m));
  }
};
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
  it('cada alerta tiene el nivel del grupo de la ficha de sus especies', () => {
    for (const a of ALERTAS) for (const id of a.especies) expect(porId.get(id)?.grupo, `${id} en «${a.texto}»`).toBe(a.nivel);
  });
  it('ninguna mortal se descarta con una sola respuesta, salvo el corte del huevo', () => {
    for (const r of DESCARTES) if (porId.get(r.especie)?.grupo === 'mortal' && !('interior_huevo' in r.si))
      expect(Object.keys(r.si).length, `${r.especie}: ${r.motivo}`).toBeGreaterThanOrEqual(2);
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
    ['Amanita caesarea', ['amanitoide']], ['Amanita virosa', ['amanitoide']], ['Agaricus campestris', ['amanitoide', 'clitociboide']],
    ['Boletus edulis', ['boletoide']], ['Suillus bellinii', ['boletoide']], ['Cantharellus cibarius', ['cantareloide']],
    ['Omphalotus olearius', ['cantareloide']], ['Macrolepiota procera', ['lepiotoide']], ['Lactarius deliciosus', ['lactarioide']],
    ['Leucoagaricus leucothites', ['amanitoide', 'lepiotoide']], ['Russula cyanoxantha', ['otros']], ['Trametes versicolor', ['otros']],
    ['Terfezia arenaria', ['hipogeo']], ['Tuber aestivum', ['hipogeo']], ['Choiromyces meandriformis', ['hipogeo']],
    ['Scleroderma verrucosum', ['hipogeo']], ['Rhizopogon obtextus', ['hipogeo']], ['Lycoperdon perlatum', ['amanitoide', 'hipogeo']],
    ['Calvatia gigantea', ['amanitoide', 'hipogeo']], ['Phallus impudicus', ['amanitoide']],
    ['Amanita ponderosa', ['amanitoide']], ['Pleurotus eryngii', ['otros']],
    ['Tricholoma terreum', ['tricolomoide']], ['Tricholoma pardinum', ['tricolomoide']],
    ['Morchella esculenta', ['morcheloide']], ['Gyromitra gigas', ['morcheloide']], ['Verpa bohemica', ['morcheloide']],
    ['Clitocybe rivulosa', ['clitociboide']], ['Marasmius oreades', ['clitociboide']], ['Lepista nuda', ['clitociboide']],
    ['Hygrophorus latitabundus', ['otros']],
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
    expect(sinMortales(noDescartadas(e))).toEqual(['amanita_muscaria']);
    mortalesPresentes(e, ['amanita_phalloides', 'amanita_verna']);
    expect(noDescartadas(e)).toContain('lepiota_brunneoincarnata');
    expect(e.peligrosas.find((p) => p.id === 'amanita_phalloides')?.motivo).toMatch(/naranja/);
    expect(e.aviso).toBe(AVISO_EXPERTO);
  });
  it('hallazgo del traspaso: «láminas amarillas» sola ya no descarta las amanitas mortales (solo muscaria)', () => {
    const e = evaluar(c, fichas, { laminas_pie_color: 'amarillos' });
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna', 'amanita_pantherina']));
    expect(descartadas(e)).toEqual(['amanita_muscaria']);
  });
  it('«sombrero naranja o rojo» sola tampoco las descarta', () => {
    expect(descartadas(evaluar(c, fichas, { color_sombrero: 'naranja_rojo' }))).toEqual([]);
  });
  it('láminas y pie amarillos + sombrero naranja o rojo descartan phalloides, verna, pantherina y muscaria', () => {
    const e = evaluar(c, fichas, { laminas_pie_color: 'amarillos', color_sombrero: 'naranja_rojo' });
    expect(sinMortales(noDescartadas(e))).toEqual([]);
    expect(descartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna', 'amanita_pantherina', 'amanita_muscaria']));
    expect(noDescartadas(e)).toContain('lepiota_brunneoincarnata');   // las respuestas del grupo amanitoide no la descartan
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
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides']));
    expect(e.peligrosas.find((p) => p.id === 'amanita_phalloides')?.origen[0]).toBe('se confunde con Russula cyanoxantha');
    expect(e.preguntas.map((p) => p.id)).toContain('interior_huevo');
  });
  it('«no reconocido» lista todas las mortales de la guía', () => {
    const e = evaluar([], fichas, {}, true);
    expect(noDescartadas(e).sort()).toEqual(MORTALES);
  });
  it('una seta sin grupo ni confusiones no inventa peligrosas, pero el aviso fijo sigue', () => {
    const e = evaluar([{ nombre: 'Trametes versicolor' }], fichas, {});
    expect(e.peligrosas.map((p) => p.id).sort()).toEqual(MORTALES);
    mortalesPresentes(e);
    expect(e.peligrosas.every((p) => p.origen.includes('mortal: el reconocedor puede fallar'))).toBe(true);
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
    const e = evaluar(c, fichas, {});
    mortalesPresentes(e);
    expect(sinMortales(noDescartadas(e)).sort()).toEqual(
      ['caloboletus_calopus', 'caloboletus_radicans', 'rubroboletus_satanas', 'tylopilus_felleus']);
  });
  it('con poros rojos R. satanas NO se descarta (aunque no azulee)', () => {
    const e = evaluar(c, fichas, { color_poros: 'rojo_naranja', azulea_al_corte: 'no', color_reticulo: 'claro' });
    expect(sinMortales(noDescartadas(e))).toEqual(['rubroboletus_satanas']);
    mortalesPresentes(e);
  });
  it('poros claros + no azulea + red clara descartan las cuatro', () => {
    const e = evaluar(c, fichas, { color_poros: 'blanco_amarillo_verdoso', azulea_al_corte: 'no', color_reticulo: 'claro' });
    expect(sinMortales(noDescartadas(e))).toEqual([]);
    mortalesPresentes(e);
  });
  it('si azulea, ninguna se descarta salvo T. felleus por poros y red claros', () => {
    const e = evaluar(c, fichas, { color_poros: 'blanco_amarillo_verdoso', azulea_al_corte: 'si', color_reticulo: 'claro' });
    expect(descartadas(e)).toEqual(['tylopilus_felleus']);
  });
  it('red parda oscura mantiene T. felleus', () => {
    const e = evaluar(c, fichas, { color_poros: 'blanco_amarillo_verdoso', azulea_al_corte: 'no', color_reticulo: 'pardo_oscuro' });
    expect(sinMortales(noDescartadas(e))).toEqual(['tylopilus_felleus']);
    mortalesPresentes(e);
  });
});

describe('rebozuelos', () => {
  const c = cand('cantharellus_cibarius');
  it('Omphalotus no descartado hasta pliegues + no en matas', () => {
    const nd = (r: Respuestas) => { const e = evaluar(c, fichas, r); mortalesPresentes(e); return sinMortales(noDescartadas(e)); };
    expect(nd({})).toEqual(['omphalotus_olearius']);
    expect(nd({ himenio_cantarelo: 'pliegues' })).toEqual(['omphalotus_olearius']);
    expect(nd({ himenio_cantarelo: 'pliegues', en_matas_madera: 'no' })).toEqual([]);
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
    expect(noDescartadas(e).slice(0, MORTALES.length).sort()).toEqual(MORTALES);   // las mortales van antes que las tóxicas
    expect(noDescartadas(e).sort()).toEqual([...MORTALES, 'amanita_pantherina', 'chlorophyllum_rhacodes'].sort());
  });
  it('sombrero >10 cm + anillo doble móvil + piel de serpiente + carne que no enrojece descartan las tres', () => {
    const e = evaluar(c, fichas, { sombrero_mayor_10cm: 'si', anillo_doble_movil: 'si', pie_serpiente: 'si', carne_enrojece: 'no' });
    expect(sinMortales(noDescartadas(e))).toEqual([]);
    expect(descartadas(e)).toContain('lepiota_brunneoincarnata');
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna']));
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
    const nar = evaluar(c, fichas, { color_latex: 'naranja_zanahoria' });
    expect(sinMortales(noDescartadas(nar))).toEqual([]);
    mortalesPresentes(nar);
    const bl = evaluar(c, fichas, { color_latex: 'blanco' });
    expect(sinMortales(noDescartadas(bl)).sort()).toEqual(['lactarius_chrysorrheus', 'lactarius_torminosus']);
    mortalesPresentes(bl);
  });
  it('una especie afín (L. vinosus → ficha de L. deliciosus) activa también el grupo', () => {
    const e = evaluar([{ nombre: 'Lactarius vinosus', idGuia: 'lactarius_deliciosus' }], fichas, {});
    expect(e.grupos).toEqual(['lactarioide']);
  });
});

describe('criadillas, trufas y Scleroderma (grupo hipogeo)', () => {
  const RESP_CRIADILLA: Respuestas = { interior_gleba: 'crema_vetas', piel_dura_escamosa: 'no', cordones_base: 'no' };
  it('una criadilla en el top-1 lista Scleroderma (grupo y «no confundir») y las mortales, con las preguntas del corte', () => {
    const e = evaluar(cand('terfezia_arenaria'), fichas, {});
    expect(e.grupos).toEqual(['hipogeo']);
    const sc = e.peligrosas.find((p) => p.id === 'scleroderma_citrinum')!;
    expect(sc).toMatchObject({ nivel: 'toxica', descartada: false, alerta: false });
    expect(sc.origen).toEqual(expect.arrayContaining(['se confunde con Terfezia arenaria', `grupo: ${'Criadillas, trufas y bolas (sin sombrero ni pie)'}`]));
    mortalesPresentes(e);
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['interior_gleba', 'piel_dura_escamosa', 'cordones_base']));
  });
  it('solo los tres rasgos de la criadilla descartan Scleroderma; las mortales siguen', () => {
    const e = evaluar(cand('terfezia_arenaria'), fichas, RESP_CRIADILLA);
    expect(descartadas(e)).toEqual(['scleroderma_citrinum']);
    mortalesPresentes(e);
    for (const q of Object.keys(RESP_CRIADILLA)) {
      expect(noDescartadas(evaluar(cand('terfezia_arenaria'), fichas, { ...RESP_CRIADILLA, [q]: NO_SE }))).toContain('scleroderma_citrinum');
    }
    expect(noDescartadas(evaluar(cand('terfezia_arenaria'), fichas, { ...RESP_CRIADILLA, interior_gleba: 'blanco_liso' })))
      .toContain('scleroderma_citrinum');
  });
  it('interior negro violáceo → alerta TÓXICA de Scleroderma, que ya no se descarta', () => {
    const e = evaluar(cand('terfezia_arenaria'), fichas, { ...RESP_CRIADILLA, interior_gleba: 'negro_violaceo' });
    expect(e.alertas).toEqual([expect.objectContaining({ nivel: 'toxica', especies: ['scleroderma_citrinum'] })]);
    expect(e.peligrosas.find((p) => p.id === 'scleroderma_citrinum')).toMatchObject({ descartada: false, alerta: true });
  });
  it('piel dura y cordones → alerta aunque el interior parezca de criadilla', () => {
    const e = evaluar(cand('scleroderma_citrinum'), fichas, { interior_gleba: 'crema_vetas', piel_dura_escamosa: 'si', cordones_base: 'si' });
    expect(e.alertas.map((a) => a.especies)).toEqual([['scleroderma_citrinum']]);
    expect(noDescartadas(e)[0]).toBe('amanita_phalloides');
    expect(noDescartadas(e)).toContain('scleroderma_citrinum');
  });
  it('dibujo de una seta dentro → es un huevo: alerta MORTAL de phalloides y verna', () => {
    const e = evaluar(cand('terfezia_arenaria'), fichas, { interior_gleba: 'silueta_seta' });
    expect(e.alertas[0]).toMatchObject({ nivel: 'mortal', especies: ['amanita_phalloides', 'amanita_verna'] });
    expect(noDescartadas(e).slice(0, 2).sort()).toEqual(['amanita_phalloides', 'amanita_verna']);
  });
  it('un pedo de lobo o una Scleroderma fuera de la guía activan el grupo', () => {
    expect(noDescartadas(evaluar([{ nombre: 'Lycoperdon perlatum' }], fichas, {}))).toContain('scleroderma_citrinum');
    expect(noDescartadas(evaluar([{ nombre: 'Scleroderma areolatum' }], fichas, {}))).toContain('scleroderma_citrinum');
  });
});

describe('gurumelo (Amanita ponderosa) y seta de cardo', () => {
  it('el gurumelo es amanitoide y lista A. verna y A. phalloides «se confunde con»; sus rasgos no las descartan', () => {
    const resp: Respuestas = { interior_huevo: 'blanco', laminas_pie_color: 'blancos', volva_saco: 'si' };
    const e = evaluar(cand('amanita_ponderosa'), fichas, resp);
    expect(e.grupos).toEqual(['amanitoide']);
    for (const id of ['amanita_verna', 'amanita_phalloides']) {
      const p = e.peligrosas.find((x) => x.id === id)!;
      expect(p).toMatchObject({ descartada: false, alerta: true });
      expect(p.origen).toContain('se confunde con Amanita ponderosa');
    }
    expect(e.alertas.every((a) => a.nivel === 'mortal')).toBe(true);
    expect(noDescartadas(evaluar(cand('amanita_ponderosa'), fichas, { laminas_pie_color: 'otro', volva_saco: 'si' })))
      .toEqual(expect.arrayContaining(['amanita_verna', 'amanita_phalloides']));
  });
  it('la seta de cardo va a «otros» y aun así salen las mortales', () => {
    const e = evaluar(cand('pleurotus_eryngii'), fichas, {});
    expect(e.grupos).toEqual(['otros']);
    mortalesPresentes(e);
  });
});

describe('negrilla (Tricholoma terreum, tóxica por decisión de 2026-10-15)', () => {
  const c = cand('tricholoma_terreum');
  it('activa tricolomoide y lista la propia negrilla, T. pardinum y T. equestre, más las mortales', () => {
    const e = evaluar(c, fichas, {});
    expect(e.grupos).toEqual(['tricolomoide']);
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['tricholoma_terreum', 'tricholoma_pardinum', 'tricholoma_equestre']));
    expect(e.peligrosas.find((p) => p.id === 'tricholoma_terreum')!.origen).toContain('es uno de los candidatos');
    expect(e.peligrosas.find((p) => p.id === 'tricholoma_pardinum')!.origen).toEqual(expect.arrayContaining(['se confunde con Tricholoma terreum']));
    mortalesPresentes(e);
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['superficie_sombrero', 'laminas_pie_color', 'color_sombrero']));
  });
  it('otro Tricholoma sin ficha trae la negrilla como tóxica del grupo', () => {
    const e = evaluar([{ nombre: 'Tricholoma portentosum' }], fichas, {});
    expect(e.peligrosas.find((p) => p.id === 'tricholoma_terreum')).toMatchObject({ nivel: 'toxica', descartada: false });
  });
  it('sombrero de fieltro gris descarta T. pardinum; láminas blancas y sombrero gris descartan T. equestre; la negrilla sigue', () => {
    const e = evaluar(c, fichas, { superficie_sombrero: 'fieltro_gris', laminas_pie_color: 'blancos', color_sombrero: 'gris' });
    expect(descartadas(e)).toEqual(expect.arrayContaining(['tricholoma_pardinum', 'tricholoma_equestre']));
    expect(noDescartadas(e)).toContain('tricholoma_terreum');
  });
  it('una sola respuesta no descarta T. equestre', () => {
    for (const r of [{ laminas_pie_color: 'blancos' }, { color_sombrero: 'gris' }] as Respuestas[])
      expect(descartadas(evaluar(c, fichas, r))).not.toContain('tricholoma_equestre');
  });
  it('escamas oscuras → alerta TÓXICA de T. pardinum; láminas amarillas + sombrero amarillo verdoso → alerta de T. equestre', () => {
    const p = evaluar(c, fichas, { superficie_sombrero: 'escamas_oscuras' });
    expect(p.alertas.map((a) => a.especies).flat()).toContain('tricholoma_pardinum');
    const q = evaluar(c, fichas, { laminas_pie_color: 'amarillos', color_sombrero: 'amarillo_verdoso' });
    expect(q.alertas.find((a) => a.especies.includes('tricholoma_equestre'))?.nivel).toBe(porId.get('tricholoma_equestre')!.grupo);
    expect(noDescartadas(q)).toContain('tricholoma_equestre');
  });
  it('volva en saco y sombrero naranja descartan T. equestre (los Tricholoma no tienen volva)', () => {
    const e = evaluar(cand('amanita_caesarea'), fichas, { volva_saco: 'si', color_sombrero: 'naranja_rojo' });
    expect(descartadas(e)).toContain('tricholoma_equestre');
  });
});

describe('colmenilla (Morchella)', () => {
  const c = cand('morchella_spp');
  it('activa morcheloide y lista Gyromitra, con las dos preguntas del sombrero y del corte', () => {
    const e = evaluar(c, fichas, {});
    expect(e.grupos).toEqual(['morcheloide']);
    expect(noDescartadas(e)).toContain('gyromitra_esculenta');
    expect(e.peligrosas.find((p) => p.id === 'gyromitra_esculenta')!.origen).toEqual(expect.arrayContaining(['se confunde con Morchella esculenta']));
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['superficie_sombrero', 'morchella_interior']));
  });
  it('solo celdas + hueca la descartan; una sola respuesta no', () => {
    expect(descartadas(evaluar(c, fichas, { superficie_sombrero: 'alveolos', morchella_interior: 'hueca' }))).toContain('gyromitra_esculenta');
    expect(descartadas(evaluar(c, fichas, { superficie_sombrero: 'alveolos' }))).not.toContain('gyromitra_esculenta');
    expect(descartadas(evaluar(c, fichas, { morchella_interior: 'hueca' }))).not.toContain('gyromitra_esculenta');
  });
  it('sombrero como un cerebro o cámaras por dentro → alerta, y ya no se descarta', () => {
    for (const r of [{ superficie_sombrero: 'cerebro' }, { morchella_interior: 'tabiques', superficie_sombrero: 'alveolos' }] as Respuestas[]) {
      const e = evaluar(c, fichas, r);
      expect(e.alertas.some((a) => a.especies.includes('gyromitra_esculenta'))).toBe(true);
      expect(noDescartadas(e)).toContain('gyromitra_esculenta');
    }
  });
});

describe('champiñón, senderuela y Clitocybe (grupo clitociboide)', () => {
  it('el champiñón lista C. dealbata (grupo y «no confundir») además de las amanitas', () => {
    const e = evaluar(cand('agaricus_campestris'), fichas, {});
    expect(e.grupos).toEqual(['amanitoide', 'clitociboide']);
    expect(noDescartadas(e)).toContain('clitocybe_dealbata');
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['laminas_pie_color', 'anillo_pie']));
  });
  it('láminas rosas o marrones + anillo descartan C. dealbata; una sola de las dos o láminas blancas no', () => {
    const c = cand('agaricus_campestris');
    expect(descartadas(evaluar(c, fichas, { laminas_pie_color: 'rosas_marrones', anillo_pie: 'si' }))).toContain('clitocybe_dealbata');
    for (const r of [{ laminas_pie_color: 'rosas_marrones' }, { anillo_pie: 'si' }, { laminas_pie_color: 'blancos', anillo_pie: 'si' }] as Respuestas[])
      expect(descartadas(evaluar(c, fichas, r))).not.toContain('clitocybe_dealbata');
  });
  it('una senderuela (sin ficha) activa el grupo y trae C. dealbata', () => {
    const e = evaluar([{ nombre: 'Marasmius oreades' }], fichas, {});
    expect(e.grupos).toEqual(['clitociboide']);
    expect(e.peligrosas.find((p) => p.id === 'clitocybe_dealbata')!.origen).toEqual(expect.arrayContaining([expect.stringMatching(/^grupo:/)]));
  });
  it('la seta de cardo trae C. dealbata por «No confundir con…»', () => {
    const e = evaluar(cand('pleurotus_eryngii'), fichas, {});
    expect(e.peligrosas.find((p) => p.id === 'clitocybe_dealbata')!.origen).toContain('se confunde con Pleurotus eryngii');
  });
});

describe('hallazgos del code-review max de D1', () => {
  it('las mortales nuevas siguen siendo mortales (se listan siempre)', () => {
    expect(MORTALES).toEqual(expect.arrayContaining(['tricholoma_equestre', 'gyromitra_esculenta', 'clitocybe_dealbata']));
    expect(noDescartadas(evaluar([{ nombre: 'Trametes versicolor' }], fichas, {}))).toContain('clitocybe_dealbata');
  });
  it('láminas blancas y sombrero verdoso o blanco → alerta MORTAL: el huevo naranja ya no descarta phalloides ni verna', () => {
    for (const color of ['amarillo_verdoso', 'blanco']) {
      const e = evaluar(cand('amanita_caesarea'), fichas, { interior_huevo: 'naranja_amarillo', laminas_pie_color: 'blancos', color_sombrero: color });
      expect(e.alertas.some((a) => a.nivel === 'mortal' && a.especies.includes('amanita_phalloides')), color).toBe(true);
      expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna']));
    }
  });
  it('láminas amarillas con sombrero pardo u otro color → alerta de T. equestre, que ya no cae por volva', () => {
    for (const color of ['pardo', 'otro', 'amarillo_verdoso']) {
      const e = evaluar(cand('amanita_caesarea'), fichas, { laminas_pie_color: 'amarillos', color_sombrero: color, volva_saco: 'si' });
      expect(e.alertas.some((a) => a.especies.includes('tricholoma_equestre')), color).toBe(true);
      expect(noDescartadas(e)).toContain('tricholoma_equestre');
    }
  });
  it('una alerta trae su especie aunque ningún candidato la active (T. pardinum sin Tricholoma en el top-5)', () => {
    const e = evaluar([{ nombre: 'Limacella guttata' }], fichas, { superficie_sombrero: 'escamas_oscuras' });
    const p = e.peligrosas.find((x) => x.id === 'tricholoma_pardinum');
    expect(p).toMatchObject({ descartada: false, alerta: true, origen: ['tus respuestas apuntan a ella'] });
  });
  it('huevo naranja por dentro con sombrero verdoso o blanco → alerta MORTAL: phalloides y verna no se descartan', () => {
    for (const color of ['amarillo_verdoso', 'blanco']) {
      const e = evaluar(cand('amanita_caesarea'), fichas, { interior_huevo: 'naranja_amarillo', color_sombrero: color });
      expect(noDescartadas(e), color).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna']));
      expect(e.alertas.some((a) => a.nivel === 'mortal'), color).toBe(true);
    }
  });
  it('láminas blancas y sin anillo → alerta MORTAL de C. dealbata; el champiñón con anillo y láminas rosa vivo la descarta', () => {
    const c = cand('agaricus_campestris');
    const e = evaluar(c, fichas, { laminas_pie_color: 'blancos', anillo_pie: 'no' });
    expect(e.alertas.find((a) => a.especies.includes('clitocybe_dealbata'))?.nivel).toBe('mortal');
    expect(PREGUNTA.laminas_pie_color.opciones.find((o) => o.v === 'rosas_marrones')!.t).toMatch(/rosa vivo/);
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
    const malas = 'Comestibilidad excelente. Es apto para consumo. Se pueden comerlas cocinadas. Tóxica en crudo; se come cocinada. Es segura.';
    expect(sinComestible(malas)).not.toMatch(/comestib|apt[oa] para|se pueden? comer|se come|es segura/i);
    expect(sinComestible('Se confunde con la colmenilla')).toBe('Se confunde con la colmenilla');
    const mas = ['Se puede consumir cocinada.', 'Puede comerse cocinada.', 'Apta para consumir.', 'Se consume cocinada.',
      'Es completamente segura.', 'Es comible.', 'Parece inofensiva.', 'Una especie inofensiva.'];
    for (const m of mas) expect(sinComestible(m), m).toContain('[consulta a un experto]');
    expect(sinComestible('Mortal: no es inofensiva.')).toBe('Mortal: no es inofensiva.');
  });
});

describe('hallazgo de revisión: las mortales salen aunque ningún candidato active su grupo', () => {
  it('top-5 solo de géneros «otros» (Hygrocybe, Russula) → todas las mortales no descartadas, con sus preguntas', () => {
    const e = evaluar([{ nombre: 'Hygrocybe acutoconica' }, { nombre: 'Russula aurea' }], fichas, {});
    const mortales = fichas.filter((f) => f.grupo === 'mortal').map((f) => f.id);
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(mortales));
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['interior_huevo', 'sombrero_mayor_10cm']));
  });
});
