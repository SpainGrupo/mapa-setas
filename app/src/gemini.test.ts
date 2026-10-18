import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';
import {
  candidatosDeGemini, discrepancia, elegirCcaaGemini, ErrorGemini, fechaHoy, fusionarPeligrosas, limpiarRespuesta, MAX_LADO, mensajeError,
  pedirSegundaOpinion, urlWorker, type PeticionGemini,
} from './gemini';
import { evaluar, type FichaMin } from './seguridad';

const fichas: (FichaMin & { grupo: string })[] = datos as never;
const ls = (v: string | null) => ({ getItem: () => v });

describe('urlWorker', () => {
  it('usa VITE_WORKER_URL; en e2e admite la de localStorage; nada si no es http(s)', () => {
    expect(urlWorker('https://w.example/identificar', false, null)).toBe('https://w.example/identificar');
    expect(urlWorker('', false, ls('https://x/identificar'))).toBe('');
    expect(urlWorker(undefined, true, ls('https://x/identificar'))).toBe('https://x/identificar');
    expect(urlWorker('', true, ls(null))).toBe('');
    expect(urlWorker('javascript:alert(1)', false, null)).toBe('');
  });
});

describe('mensajes de error', () => {
  it.each([[403, /no está autorizada/], [413, /pesan demasiado/], [429, /límite diario/], [503, /saturado/], [504, /tardado/],
    [422, /rechazado/], [400, /no es válida/], [0, /conectar/], [500, /error 500/]])('%i', (s, re) => expect(mensajeError(s)).toMatch(re));
  it('429 global', () => expect(mensajeError(429, 'limite_global_superado')).toMatch(/cupo total/));
});

describe('limpiarRespuesta', () => {
  it('neutraliza «comestible», normaliza la confianza y fuerza el aviso', () => {
    const r = limpiarRespuesta({
      candidatos: [{ nombre_cientifico: 'Amanita caesarea', confianza: 'segura', rasgos_observados: ['Excelente comestible', 'volva blanca'] }, { nombre_cientifico: '' }],
      peligrosas_posibles: [{ nombre_cientifico: 'Amanita phalloides', motivo: 'huevo parecido' }, {}],
      fotos_recomendadas: ['corte del huevo'], aviso: 'Se puede comer',
    });
    expect(r.candidatos).toHaveLength(1);
    expect(r.candidatos[0].confianza).toBe('baja');
    expect(JSON.stringify(r)).not.toMatch(/comestible|se puede comer/i);
    expect(r.peligrosas_posibles).toEqual([{ nombre_cientifico: 'Amanita phalloides', motivo: 'huevo parecido' }]);
    expect(r.aviso).toBe('No consumas ninguna seta sin la confirmación de un experto.');
  });
  it('tolera una respuesta vacía', () => {
    expect(limpiarRespuesta(null)).toMatchObject({ candidatos: [], peligrosas_posibles: [], fotos_recomendadas: [] });
  });
});

describe('fusionarPeligrosas (unión)', () => {
  const c = [{ nombre: 'Amanita caesarea Pers.', idGuia: 'amanita_caesarea' }];
  it('suma las de Gemini a las locales no descartadas; las desconocidas van por nombre', () => {
    const loc = evaluar(c, fichas, { laminas_pie_color: 'amarillos', color_sombrero: 'naranja_rojo' }).peligrosas;   // amanitas descartadas; las mortales de otros grupos siguen
    const noDesc = loc.filter((p) => !p.descartada).map((p) => p.id);
    expect(noDesc).toContain('lepiota_brunneoincarnata');   // láminas amarillas no descartan a la lepiota
    expect(loc.find((p) => p.id === 'amanita_phalloides')?.descartada).toBe(true);   // aquí sí; Gemini la reactiva
    const f = fusionarPeligrosas(loc, [
      { nombre_cientifico: 'Amanita phalloides (Vaill. ex Fr.) Link', motivo: 'huevo blanco' },
      { nombre_cientifico: 'Amanita virosa', motivo: 'blanca' },
    ], fichas);
    const ph = f.find((p) => p.id === 'amanita_phalloides')!;
    expect(ph).toMatchObject({ nivel: 'mortal', motivos: expect.arrayContaining(['según Gemini: huevo blanco']) });
    expect(ph.motivos.at(-1)).toBe('según Gemini: huevo blanco');
    expect(f.map((p) => p.id ?? p.nombre)).toEqual(expect.arrayContaining(['amanita_phalloides', 'lepiota_brunneoincarnata', 'Amanita virosa']));
    expect(f.map((p) => p.id)).not.toContain('amanita_verna');   // descartada en local y Gemini no la propone
    expect(f.find((p) => p.nombre === 'Amanita virosa')!.nivel).toBe('desconocido');
  });
  it('los taxones que una ficha incluye (G. gigas, C. rivulosa, T. auratum) se reconocen como esa ficha', () => {
    const f = fusionarPeligrosas([], [
      { nombre_cientifico: 'Gyromitra gigas', motivo: 'x' }, { nombre_cientifico: 'Clitocybe rivulosa', motivo: 'y' },
      { nombre_cientifico: 'Tricholoma auratum', motivo: 'z' }, { nombre_cientifico: 'Collybia nuda', motivo: 'w' },
    ], fichas);
    expect(f.map((p) => [p.id, p.nivel])).toEqual(expect.arrayContaining([
      ['gyromitra_esculenta', 'mortal'], ['clitocybe_dealbata', 'mortal'], ['tricholoma_equestre', 'mortal']]));
    expect(f.find((p) => p.id === 'lepista_nuda')).toBeDefined();
  });
  it('una peligrosa ya local acumula el motivo de Gemini', () => {
    const loc = evaluar(c, fichas, {}).peligrosas;
    const f = fusionarPeligrosas(loc, [{ nombre_cientifico: 'Amanita verna', motivo: '' }], fichas);
    const verna = f.find((p) => p.id === 'amanita_verna')!;
    expect(verna.motivos.at(-1)).toBe('según Gemini: posible confusión');
    expect(f.length).toBe(loc.length);   // verna ya estaba: no se duplica
    const mortales = fichas.filter((x) => x.grupo === 'mortal').map((x) => x.id).sort();
    expect(f.slice(0, mortales.length).every((p) => p.nivel === 'mortal')).toBe(true);
    expect(f.slice(0, mortales.length).map((p) => p.id).sort()).toEqual(mortales);
    expect(f.at(-1)!.nivel).toBe('toxica');
  });
});

describe('pedirSegundaOpinion', () => {
  const pet: PeticionGemini = { fotos: ['/9j/AA=='], respuestas_guiadas: { volva_saco: 'Sí' }, contexto: { fecha: '2026-10-13' }, candidatos_offline: [] };
  it('envía JSON y limpia la respuesta', async () => {
    let cuerpo = '';
    const r = await pedirSegundaOpinion('https://w/identificar', pet, (async (_u: string, i: RequestInit) => {
      cuerpo = String(i.body);
      return new Response(JSON.stringify({ candidatos: [{ nombre_cientifico: 'Amanita caesarea', confianza: 'media', rasgos_observados: [], rasgos_que_faltan_ver: [] }], peligrosas_posibles: [], fotos_recomendadas: [] }));
    }) as typeof fetch);
    expect(JSON.parse(cuerpo)).toEqual(pet);
    expect(r.candidatos[0].confianza).toBe('media');
  });
  it('errores HTTP y de red → mensaje en castellano', async () => {
    const con = (s: number, b = '') => (async () => new Response(b, { status: s })) as unknown as typeof fetch;
    await expect(pedirSegundaOpinion('u', pet, con(429, '{"error":{"codigo":"limite_diario_superado"}}'))).rejects.toThrow(/límite diario/);
    await expect(pedirSegundaOpinion('u', pet, con(503))).rejects.toThrow(/saturado/);
    await expect(pedirSegundaOpinion('u', pet, (async () => { throw new TypeError('x'); }) as typeof fetch)).rejects.toThrow(/conectar/);
  });
  it('Worker anterior (400 con contexto.ccaa): repite una vez sin ccaa', async () => {
    const cuerpos: { contexto: Record<string, unknown> }[] = [];
    const f = (async (_u: string, i: RequestInit) => {
      const c = JSON.parse(String(i.body)); cuerpos.push(c);
      if (c.contexto.ccaa) return new Response('{"error":{"codigo":"solicitud_invalida"}}', { status: 400 });
      return new Response(JSON.stringify({ candidatos: [], peligrosas_posibles: [], fotos_recomendadas: [] }));
    }) as typeof fetch;
    await pedirSegundaOpinion('u', { ...pet, contexto: { ...pet.contexto, ccaa: 'comunitat_valenciana' } }, f);
    expect(cuerpos.map((c) => c.contexto.ccaa)).toEqual(['comunitat_valenciana', undefined]);
    // Sin ccaa, un 400 no se repite.
    let n = 0;
    await expect(pedirSegundaOpinion('u', pet, (async () => { n++; return new Response('', { status: 400 }); }) as unknown as typeof fetch)).rejects.toThrow();
    expect(n).toBe(1);
  });
});

describe('consulta a Gemini: tiempo, motivo real y candidatos (2026-10-18)', () => {
  const pet: PeticionGemini = { fotos: ['/9j/AA=='], respuestas_guiadas: {}, contexto: {}, candidatos_offline: [] };
  it('corta a los N ms con un mensaje de tiempo agotado y envía la señal de aborto', async () => {
    let senal: AbortSignal | undefined;
    const lento = ((_u: string, i: RequestInit) => new Promise<Response>((_ok, mal) => {
      senal = i.signal ?? undefined;
      i.signal?.addEventListener('abort', () => mal(new DOMException('abortado', 'AbortError')));
    })) as typeof fetch;
    const e = await pedirSegundaOpinion('u', pet, lento, 20).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorGemini);
    expect(e.estado).toBe(-1);
    expect(e.message).toMatch(/no ha respondido/);
    expect(senal?.aborted).toBe(true);
  });
  it('un 400 enseña el motivo que da el Worker y un error raro, su código', async () => {
    const r400 = (async () => new Response('{"error":{"codigo":"solicitud_invalida","mensaje":"fotos[0] no es un JPEG."}}', { status: 400 })) as unknown as typeof fetch;
    await expect(pedirSegundaOpinion('u', pet, r400)).rejects.toThrow(/no es un JPEG/);
    expect(mensajeError(500, 'gemini_error')).toMatch(/error 500, gemini_error/);
  });
  it('una respuesta 200 que no es JSON da un error claro', async () => {
    const malo = (async () => new Response('<html>')) as unknown as typeof fetch;
    await expect(pedirSegundaOpinion('u', pet, malo)).rejects.toBeInstanceOf(ErrorGemini);
  });
  it('fotos de 1024 px como máximo', () => expect(MAX_LADO).toBe(1024));
  it('candidatosDeGemini enlaza con la ficha por binomio; sin ficha, solo el nombre', () => {
    const r = limpiarRespuesta({ candidatos: [
      { nombre_cientifico: 'Rubroboletus satanas', confianza: 'media' }, { nombre_cientifico: 'Suillellus luridus', confianza: 'baja' }] });
    const c = candidatosDeGemini(r, fichas);
    expect(c[0]).toMatchObject({ nombre: 'Rubroboletus satanas', idGuia: 'rubroboletus_satanas', confianza: 'media' });
    expect(c[1].idGuia).toBeUndefined();
  });
  it('discrepancia: género distinto en el modelo local → sus nombres; mismo género o sin datos → null', () => {
    expect(discrepancia([{ nombre: 'Suillellus luridus' }], [{ nombre: 'Amanita muscaria' }, { nombre: 'Russula aurea' }])).toEqual(['Amanita muscaria', 'Russula aurea']);
    expect(discrepancia([{ nombre: 'Suillellus luridus' }], [{ nombre: 'Boletus edulis' }, { nombre: 'Suillellus queletii' }])).toBeNull();
    expect(discrepancia([], [{ nombre: 'Amanita muscaria' }])).toBeNull();
  });
});

it('fechaHoy en Madrid', () => expect(fechaHoy(new Date('2026-10-13T23:30:00Z'))).toBe('2026-10-14'));

describe('elegirCcaaGemini', () => {
  it('la del punto si es conocida; si no, la primera conocida de la región; Andalucía y nada → null', () => {
    expect(elegirCcaaGemini(['region_murcia'], ['comunitat_valenciana', 'region_murcia'])).toBe('region_murcia');
    expect(elegirCcaaGemini(['galicia'], ['comunitat_valenciana'])).toBe('comunitat_valenciana');
    expect(elegirCcaaGemini(null, ['andalucia'])).toBeNull();
    expect(elegirCcaaGemini(['andalucia'], ['comunitat_valenciana'])).toBeNull();
    expect(elegirCcaaGemini(null, [])).toBeNull();
  });
});
