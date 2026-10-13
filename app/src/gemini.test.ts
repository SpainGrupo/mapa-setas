import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';
import { fechaHoy, fusionarPeligrosas, limpiarRespuesta, mensajeError, pedirSegundaOpinion, urlWorker, type PeticionGemini } from './gemini';
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
    const loc = evaluar(c, fichas, { laminas_pie_color: 'amarillos' }).peligrosas;   // todas descartadas
    const f = fusionarPeligrosas(loc, [
      { nombre_cientifico: 'Amanita phalloides (Vaill. ex Fr.) Link', motivo: 'huevo blanco' },
      { nombre_cientifico: 'Amanita virosa', motivo: 'blanca' },
    ], fichas);
    expect(f.map((p) => p.id ?? p.nombre)).toEqual(['amanita_phalloides', 'Amanita virosa']);
    expect(f[0]).toMatchObject({ nivel: 'mortal', motivos: ['segunda opinión: huevo blanco'] });
    expect(f[1].nivel).toBe('desconocido');
  });
  it('una peligrosa ya local acumula el motivo de Gemini', () => {
    const loc = evaluar(c, fichas, {}).peligrosas;
    const f = fusionarPeligrosas(loc, [{ nombre_cientifico: 'Amanita verna', motivo: '' }], fichas);
    const verna = f.find((p) => p.id === 'amanita_verna')!;
    expect(verna.motivos.at(-1)).toBe('segunda opinión: posible confusión');
    expect(f.length).toBe(4);
    expect(f.slice(0, 2).every((p) => p.nivel === 'mortal')).toBe(true);
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
});

it('fechaHoy en Madrid', () => expect(fechaHoy(new Date('2026-10-13T23:30:00Z'))).toBe('2026-10-14'));
