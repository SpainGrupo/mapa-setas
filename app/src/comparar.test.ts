import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';
import { construirPares, dibujoDe, FOTO_PREGUNTA, nombreConComun, preguntasQueDeciden, RASGOS } from './comparar';
import { CLAVES_ANATOMIA } from './anatomia';
import { AVISO_BUSCADA, bannerFicha, type Ficha } from './guia';
import { AVISO_EXPERTO, evaluar, NO_SE, PREGUNTAS, type Respuestas } from './seguridad';

const fichas = datos as Ficha[];
const porId = new Map(fichas.map((f) => [f.id, f]));
const caesarea = porId.get('amanita_caesarea')!;
const paresDe = (f: Ficha, r: Respuestas = {}) =>
  construirPares(f, evaluar([{ nombre: f.nombre_cientifico, idGuia: f.id }], fichas, r), fichas, r);

describe('comparación por pares', () => {
  it('oronja: un par por cada peligrosa, las citadas por la guía primero y las mortales antes que las tóxicas', () => {
    const pares = paresDe(caesarea);
    const ids = pares.map((p) => p.ficha.id);
    expect(ids.slice(0, 2).sort()).toEqual(['amanita_phalloides', 'amanita_verna']);
    expect(ids).toContain('amanita_muscaria');
    expect(ids).not.toContain('amanita_caesarea');
    expect(pares.every((p) => p.estado === 'no_descartada')).toBe(true);
    const muscaria = ids.indexOf('amanita_muscaria'), pantherina = ids.indexOf('amanita_pantherina');
    expect(muscaria).toBeLessThan(pantherina);              // tóxica citada antes que tóxica solo del grupo
    expect(pares[0].citada).toBe(true);
  });

  it('las filas que deciden van delante, numeradas 1…n, y sin respuesta quedan como evidencia que falta', () => {
    const [phal] = paresDe(caesarea).filter((p) => p.ficha.id === 'amanita_phalloides');
    expect(phal.filas.map((f) => f.marca)).toEqual(phal.filas.map((_, i) => i + 1));
    const primeraNoDecide = phal.filas.findIndex((f) => !f.decide);
    expect(primeraNoDecide).toBeGreaterThan(0);
    expect(phal.filas.slice(primeraNoDecide).every((f) => !f.decide)).toBe(true);
    const huevo = phal.filas.find((f) => f.clave === 'fase_huevo')!;
    expect(huevo.decide).toBe(true);
    expect(huevo.tu).toEqual({ texto: 'Sin responder', falta: true });
    expect(huevo.dibujos).toEqual({ candidata: 'huevo-caesarea', peligrosa: 'huevo-mortal' });
    expect(phal.filas.find((f) => f.clave === 'sombrero')!.tu).toEqual({ texto: 'Sin responder', falta: true });    // color del sombrero: decide
    expect(phal.filas.find((f) => f.clave === 'anillo')!.tu).toEqual({ texto: 'Sin responder', falta: false });     // no decide: sin trazo
    expect(phal.falsoPositivo.fiarte).toMatch(/^Todavía nada la separa: faltan \d+ de \d+ rasgos que deciden\.$/);
    expect(phal.falsoPositivo.fotos).toContain(FOTO_PREGUNTA.interior_huevo);
    expect(phal.falsoPositivo.separa[0]).toMatch(/En huevo, A\. phalloides/);
    expect(phal.falsoPositivo.parecido.some((t) => /confusión de Amanita caesarea/.test(t))).toBe(true);
  });

  it('«No sé» se muestra pero sigue faltando; una respuesta que descarta pasa el par a «descartada» y al final', () => {
    const nose = paresDe(caesarea, { interior_huevo: NO_SE }).find((p) => p.ficha.id === 'amanita_phalloides')!;
    expect(nose.filas.find((f) => f.clave === 'fase_huevo')!.tu).toEqual({ texto: 'No sé', falta: true });
    expect(nose.estado).toBe('no_descartada');
    const r = { interior_huevo: 'naranja_amarillo' };
    const pares = paresDe(caesarea, r);
    const phal = pares.find((p) => p.ficha.id === 'amanita_phalloides')!;
    expect(phal.estado).toBe('descartada');
    expect(phal.filas.find((f) => f.clave === 'fase_huevo')!.tu).toEqual({ texto: 'Naranja y amarillo', falta: false });
    expect(phal.falsoPositivo.fiarte).toMatch(/^Tu respuesta la descarta \(interior del huevo naranja y amarillo\)/);
    expect(pares.findIndex((p) => p.estado === 'descartada')).toBeGreaterThan(pares.findIndex((p) => p.estado === 'no_descartada'));
  });

  it('una respuesta que delata una mortal marca el par como alerta', () => {
    const phal = paresDe(caesarea, { interior_huevo: 'blanco' }).find((p) => p.ficha.id === 'amanita_phalloides')!;
    expect(phal.estado).toBe('alerta');
    expect(phal.falsoPositivo.fiarte).toMatch(/apuntan a esta especie/);
  });

  it('boletos: carne que azulea y retículo deciden frente a R. satanas; dibujos de poros', () => {
    const edulis = porId.get('boletus_edulis')!;
    const sat = paresDe(edulis).find((p) => p.ficha.id === 'rubroboletus_satanas')!;
    expect(sat.filas.filter((f) => f.decide).map((f) => f.clave)).toEqual(expect.arrayContaining(['himenio', 'pie', 'carne_y_corte']));
    expect(sat.filas.find((f) => f.clave === 'himenio')!.dibujos.peligrosa).toBe('himenio-poros');
    expect(sat.filas.find((f) => f.clave === 'carne_y_corte')!.dibujos).toEqual({ peligrosa: 'carne-azulea' });
  });

  it('una peligrosa sin preguntas que la separen lo dice', () => {
    const pares = paresDe(porId.get('pleurotus_eryngii')!);
    expect(pares.length).toBeGreaterThan(0);
    for (const p of pares) expect(p.falsoPositivo.fiarte.length).toBeGreaterThan(10);
  });

  it('cada pregunta tiene su foto y cada dibujo elegido existe', () => {
    for (const q of PREGUNTAS) expect(FOTO_PREGUNTA[q.id], q.id).toBeTruthy();
    for (const f of fichas) for (const d of RASGOS) {
      const k = dibujoDe(d.clave, String(f[d.clave] ?? ''));
      if (k) expect(CLAVES_ANATOMIA, `${f.id}.${d.clave}`).toContain(k);
    }
    expect(preguntasQueDeciden('amanita_phalloides')).toEqual(new Set(['interior_huevo', 'laminas_pie_color', 'color_sombrero', 'volva_saco', 'interior_gleba']));
  });

  it('heurística de dibujos: negaciones y verrugas', () => {
    expect(dibujoDe('pie', 'Liso, sin dibujo de piel de serpiente')).toBeUndefined();
    expect(dibujoDe('volva', 'No forma saco: queda como verrugas')).toBe('volva-verrugas');
    expect(dibujoDe('volva', 'No tiene.')).toBeUndefined();
    expect(dibujoDe('anillo', 'No tiene.')).toBe('anillo-ausente');
    expect(dibujoDe('anillo', 'Doble y deslizante')).toBe('anillo-doble');
    expect(dibujoDe('carne_y_corte', 'Blanca, no azulea')).toBeUndefined();
    expect(dibujoDe('himenio', 'No tiene láminas ni poros')).toBeUndefined();
    expect(dibujoDe('sombrero', 'Naranja')).toBeUndefined();
    expect(nombreConComun(porId.get('amanita_phalloides')!)).toBe('Amanita phalloides (oronja verde)');
  });

  it('ningún texto de la comparación dice «comestible»', () => {
    for (const f of fichas) for (const p of paresDe(f)) {
      const t = JSON.stringify([p.filas, p.falsoPositivo]);
      expect(t, `${f.id} frente a ${p.ficha.id}`).not.toMatch(/comestible|se puede comer/i);
    }
  });
});

describe('aviso de la ficha (spec §2)', () => {
  it('buscada sin contexto: aviso neutro de su grupo, sin «comestible»', () => {
    expect(bannerFicha(caesarea, [], AVISO_EXPERTO)).toEqual({ clase: 'banner-comestible', texto: AVISO_BUSCADA.apreciada, rol: 'alert' });
    expect(bannerFicha(porId.get('agaricus_campestris')!, [], AVISO_EXPERTO).texto).toBe(AVISO_BUSCADA.comestible_menor);
    for (const t of Object.values(AVISO_BUSCADA)) { expect(t).not.toMatch(/comestib/i); expect(t).toMatch(/experto/); }
  });
  it('desde el reconocedor con mortales sin descartar: aviso rojo que las nombra y nunca «comestible»', () => {
    const b = bannerFicha(caesarea, ['Amanita phalloides (oronja verde)', 'Amanita verna (cicuta blanca)'], AVISO_EXPERTO);
    expect(b.clase).toBe('banner-peligro');
    expect(b.texto).toBe('Tus respuestas aún no descartan Amanita phalloides (oronja verde) y Amanita verna (cicuta blanca), mortales. No la consumas sin la confirmación de un experto.');
    expect(b.titulo).toBe('Mortales sin descartar en tu foto');
    expect(b.texto).not.toMatch(/comestible/i);
    const una = bannerFicha(caesarea, ['Amanita phalloides (oronja verde)'], AVISO_EXPERTO);
    expect(una.titulo).toBe('Mortal sin descartar en tu foto');
    expect(una.texto).toMatch(/Amanita phalloides \(oronja verde\), mortal\./);
  });
  it('ficha de una peligrosa: siempre el aviso del experto', () => {
    expect(bannerFicha(porId.get('amanita_phalloides')!, ['x'], AVISO_EXPERTO).clase).toBe('banner-experto');
  });
});
