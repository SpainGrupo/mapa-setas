// Herramientas del chat «Pregunta a Claude» (chat-herramientas.ts) sobre fixtures: ids válidos e inválidos, rangos,
// filtros, sin GPS, «proponer_sitios_nuevos» (excluye top, Mis sitios y notas), guardar + deshacer.
import { describe, expect, it, vi } from 'vitest';
import { MANEJADORES, NOMBRES_HERRAMIENTAS_APP, ejecutarHerramienta, type AccesoCalculado, type ContextoHerramientas, type ResultadoHerramienta } from './chat-herramientas';
import { NOMBRES_HERRAMIENTAS } from '../../worker/src/chat-herramientas';
import { topEspecie, type SitioCandidato, type SitiosJson } from './ranking';
import { sumarDias, type Reglas } from './semaforo';
import type { Dia, DatosMeteo } from './meteo';
import type { Sitio } from './tipos';
import type { Track } from './grabacion';
import { distanciaM } from './ranking';

const HOY = '2026-10-14';
const AHORA = new Date('2026-10-14T08:00:00Z');
const REGLAS: Reglas = { episodio_mm: 20, ventana_dias: [3, 10], tmin_media: [5, 18], tmax_media: [12, 28] };

/** Serie de 46 días (hoy−30 … hoy+15): lluvia fuerte hace 6 días → ventana abierta (verde) si `llueve`; sin lluvia → seco (rojo). */
const serie = (llueve: boolean, extra: (k: number) => Partial<Dia> = () => ({})): Dia[] =>
  Array.from({ length: 46 }, (_, i) => i - 30).map((k) => ({
    fecha: sumarDias(HOY, k), lluvia: llueve && k === -6 ? 30 : 0, tmin: 10, tmax: 20, ...extra(k),
  }));
const METEO: DatosMeteo = { fecha_consulta: AHORA.toISOString(), hoy: HOY, puntos: { '1': serie(true), '2': serie(false), '4': serie(true, (k) => (k === 2 ? { lluvia: 40 } : {})) } };

let nid = 100;
const sitio = (o: Partial<SitioCandidato>): SitioCandidato => ({ id: ++nid, lat: 36.5, lon: -4.9, area_ha: 50, punt_media: 80, punt_max: 95,
  t_pie_min: 20, subida_m: 100, dist_camino_m: 400, aparcamiento_id: 1, restringido: false, meteo_id: 1, bonus_pisado: 1, titularidad: { clase: 'privado' }, ...o });

// Sitios separados > 300 m entre sí (0,01° ≈ 1 km).
const A1 = sitio({ id: 1, lat: 36.50, lon: -4.90, punt_media: 90, titularidad: { clase: 'monte_junta', monte: 'Sierra Blanca' } });
const A2 = sitio({ id: 2, lat: 36.51, lon: -4.90, punt_media: 80, t_pie_min: 50, subida_m: 300 });
const A3 = sitio({ id: 3, lat: 36.52, lon: -4.90, punt_media: 70, titularidad: { clase: 'monte_municipal' } });
const A4 = sitio({ id: 4, lat: 36.53, lon: -4.90, punt_media: 60, t_pie_min: 100, subida_m: 600 });
const A5 = sitio({ id: 5, lat: 36.54, lon: -4.90, punt_media: 99, meteo_id: 2 });          // rojo (seco): no entra en «nuevos»
const A6 = sitio({ id: 6, lat: 36.60, lon: -4.90, punt_media: 50, restringido: true, citas: { n: 2, nivel: 'punto', origenes: ['inaturalist'], refs: [] } as never });
const E1 = sitio({ id: 1, lat: 36.50, lon: -4.9005, punt_media: 85 });                      // mismo sitio que A1 con otra seta (a ~40 m)
const L1 = sitio({ id: 1, lat: 36.55, lon: -4.95, punt_media: 75 });
const DATOS: SitiosJson = { version: 3, generado: HOY, especies: {
  boletus_aereus: [A1, A2, A3, A4, A5, A6], boletus_edulis: [E1], lactarius_deliciosus: [L1], amanita_caesarea: [] } };

const ESPECIES = ['boletus_aereus', 'boletus_edulis', 'lactarius_deliciosus', 'amanita_caesarea'];
const NOMBRES: Record<string, string> = { boletus_aereus: 'Boleto negro', boletus_edulis: 'Boleto edulis', lactarius_deliciosus: 'Níscalo', amanita_caesarea: 'Oronja' };
const REGION = { lat: 36.5101, lon: -4.8825 };

const ACCESO_OK: AccesoCalculado = { estado: 'ok', texto: '', acceso: { lat: 36.499, lon: -4.905, via: 'pista de la Fuensanta', tiempo_min: 22, subida_m: 90 },
  perfil: { distancia_m: 1400, subida_m: 92, bajada_m: 12, alt_min: 410.4, alt_max: 520.6 } };

interface Banco { ctx: ContextoHerramientas; sitios: Sitio[]; mapa: { lat: number; lon: number }[][]; rutas: Track[] }
function banco(over: Partial<ContextoHerramientas> = {}, ini: { sitios?: Sitio[]; rutas?: Track[] } = {}): Banco {
  const b: Banco = { ctx: null as never, sitios: ini.sitios ?? [], mapa: [], rutas: ini.rutas ?? [] };
  let ids = 0;
  b.ctx = {
    region: 'marbella', origenRegion: REGION, etiquetaOrigen: 'de Marbella', hoy: HOY, datos: DATOS, especies: ESPECIES,
    nombreEspecie: (id) => NOMBRES[id] ?? id, reglas: () => REGLAS, fiabilidad: () => 'buena',
    meteo: METEO, puntoMeteo: (id) => (id === 1 ? { id, lat: 36.5, lon: -4.9, alt_media: 450 } : null),
    posicion: { lat: 36.5, lon: -4.9 }, filtros: { soloPublicos: false, maxDificultad: null }, topVisible: [],
    misSitios: async () => b.sitios, rutas: async () => b.rutas, acceso: async () => ACCESO_OK,
    guardarSitio: async (s) => { b.sitios.unshift(s); }, mostrarEnMapa: (p) => { b.mapa.push(p); },
    nuevoId: () => `nuevo-${++ids}`, ahora: () => AHORA, textoRestringido: 'Recogida con autorización',
    ...over,
  };
  return b;
}
const lanzar = (nombre: string, entrada: unknown, ctx: ContextoHerramientas) => ejecutarHerramienta(nombre, entrada, ctx);
const json = (r: ResultadoHerramienta) => JSON.parse(r.contenido);
const buscar = (o: object = {}) => ({ especie: 'boletus_aereus', grupo: null, dia: 0, radio_km: null, solo_publicos: null, max_dificultad: null, orden: null, n: 10, ...o });
const nuevos = (o: object = {}) => ({ especie: 'boletus_aereus', grupo: null, dia: 0, radio_km: null, n: 5, ...o });
const ids = (r: ResultadoHerramienta) => (json(r).resultados as { id: string }[]).map((x) => x.id);

describe('contrato con el worker', () => {
  it('hay manejador para cada herramienta que el worker manda a Claude (y ninguno de más)', () => {
    expect([...NOMBRES_HERRAMIENTAS].sort()).toEqual([...NOMBRES_HERRAMIENTAS_APP].sort());
    for (const n of NOMBRES_HERRAMIENTAS) expect(typeof MANEJADORES[n as keyof typeof MANEJADORES], n).toBe('function');
    expect(Object.keys(MANEJADORES).sort()).toEqual([...NOMBRES_HERRAMIENTAS].sort());
  });
  it('herramienta desconocida y fallo interno son resultados de error, nunca excepciones', async () => {
    const b = banco();
    expect((await lanzar('borrar_todo', {}, b.ctx)).error).toBe(true);
    const roto = banco({ misSitios: async () => { throw new Error('idb caído'); } });
    const r = await lanzar('notas_de_ruta', { ruta: null, n: null }, roto.ctx);
    expect(r.error).toBe(true);
    expect(r.contenido).not.toContain('idb');
  });
});

describe('buscar_sitios', () => {
  it('devuelve el mismo orden, puntuación y estado que el ranking de Hoy, con ids especie:id y la razón', async () => {
    const b = banco();
    const r = await lanzar('buscar_sitios', buscar({ n: 4 }), b.ctx);
    expect(r.error).toBe(false);
    const j = json(r);
    const esperado = topEspecie(DATOS, 'boletus_aereus', { estadoEn: (_e, m) => (m === 2 ? 'rojo' : 'verde'), fiabilidad: () => 'buena', maxDificultad: null }, 10).slice(0, 4);
    expect(j.resultados.map((x: { id: string }) => x.id)).toEqual(esperado.map((e) => `boletus_aereus:${e.sitio.id}`));
    expect(j.resultados.map((x: { puntuacion: number }) => x.puntuacion)).toEqual(esperado.map((e) => e.puntuacion));
    const p = j.resultados[0];
    expect(p).toMatchObject({ id: 'boletus_aereus:1', seta: 'Boleto negro', semaforo: 'verde', dificultad: 'facil', a_pie_min: 20, subida_m: 100 });
    expect(p.razon).toMatch(/^Puntuación \d+\/100/);
    expect(p.titularidad).toEqual({ clase: 'monte_junta', texto: 'Monte público autonómico · Sierra Blanca', publico: true });
    expect(r.tarjetas.map((t) => t.id)).toEqual(ids(r));          // las tarjetas son exactamente los resultados
    expect(j.fecha).toBe(HOY);
  });
  it('el día cambia el semáforo (lluvia prevista) y la fecha', async () => {
    const b = banco();
    const hoy = json(await lanzar('buscar_sitios', buscar({ especie: 'boletus_aereus', n: 1 }), b.ctx)).resultados[0];
    const lejos = json(await lanzar('buscar_sitios', buscar({ dia: 15, n: 1 }), b.ctx));
    expect(lejos.fecha).toBe(sumarDias(HOY, 15));
    expect(hoy.semaforo).toBe('verde');
    expect(lejos.resultados[0].semaforo).not.toBe('verde');
  });
  it('un grupo combina las especies y fusiona a 300 m (una fila, varias setas)', async () => {
    const b = banco();
    const j = json(await lanzar('buscar_sitios', buscar({ especie: null, grupo: 'boletus', n: 10 }), b.ctx));
    const fila = j.resultados.find((x: { id: string }) => x.id === 'boletus_aereus:1');
    expect(fila.otras_setas).toEqual(['Boleto edulis']);
    expect(j.resultados.some((x: { id: string }) => x.id.startsWith('boletus_edulis'))).toBe(false);   // fusionado en la fila de arriba
  });
  it('solo_publicos: true quita lo privado; null usa el filtro actual de la app', async () => {
    const b = banco();
    expect(ids(await lanzar('buscar_sitios', buscar({ solo_publicos: true }), b.ctx))).toEqual(['boletus_aereus:1', 'boletus_aereus:3']);
    const conFiltro = banco({ filtros: { soloPublicos: true, maxDificultad: null } });
    expect(ids(await lanzar('buscar_sitios', buscar(), conFiltro.ctx))).toEqual(['boletus_aereus:1', 'boletus_aereus:3']);
    expect(ids(await lanzar('buscar_sitios', buscar({ solo_publicos: false }), conFiltro.ctx))).toContain('boletus_aereus:2');
  });
  it('max_dificultad quita (no rebaja) los que la superan', async () => {
    const b = banco();
    expect(ids(await lanzar('buscar_sitios', buscar({ max_dificultad: 'facil' }), b.ctx)).sort()).toEqual(['boletus_aereus:1', 'boletus_aereus:3', 'boletus_aereus:5', 'boletus_aereus:6']);
    const conFiltro = banco({ filtros: { soloPublicos: false, maxDificultad: 'moderada' } });
    expect(ids(await lanzar('buscar_sitios', buscar(), conFiltro.ctx))).not.toContain('boletus_aereus:4');
  });
  it('radio_km mide desde el GPS; sin GPS, desde el origen de la región y lo avisa', async () => {
    const b = banco();
    const cerca = json(await lanzar('buscar_sitios', buscar({ radio_km: 1.5 }), b.ctx));
    expect(cerca.resultados.map((x: { id: string }) => x.id).sort()).toEqual(['boletus_aereus:1', 'boletus_aereus:2']);   // A1 a 0 km, A2 a 1,1 km
    expect(cerca.aviso_posicion).toBeUndefined();
    expect(cerca.resultados.find((x: { id: string }) => x.id === 'boletus_aereus:1').distancia_km).toBe(0);
    const sinGps = banco({ posicion: null });
    const j = json(await lanzar('buscar_sitios', buscar({ n: 1 }), sinGps.ctx));
    expect(j.aviso_posicion).toMatch(/Sin GPS.*origen de la región \(Marbella\)/);
    expect(j.resultados[0].distancia_km).toBeCloseTo(distanciaM(REGION, A1) / 1000, 1);
  });
  it('sin GPS ni origen de región no inventa distancias', async () => {
    const b = banco({ posicion: null, origenRegion: null });
    const j = json(await lanzar('buscar_sitios', buscar({ radio_km: 5, n: 2 }), b.ctx));
    expect(j.aviso_radio).toBeTruthy();
    expect(j.resultados[0].distancia_km).toBeNull();
  });
  it('orden: distancia y dificultad reordenan los 10 mejores', async () => {
    const b = banco({ posicion: { lat: 36.53, lon: -4.9 } });
    expect(ids(await lanzar('buscar_sitios', buscar({ orden: 'distancia', n: 2 }), b.ctx))[0]).toBe('boletus_aereus:4');
    const dif = ids(await lanzar('buscar_sitios', buscar({ orden: 'dificultad', n: 10 }), b.ctx));
    expect(dif.indexOf('boletus_aereus:4')).toBeGreaterThan(dif.indexOf('boletus_aereus:1'));
  });
  it('sin resultados no es un error', async () => {
    const b = banco();
    const r = await lanzar('buscar_sitios', buscar({ especie: 'amanita_caesarea' }), b.ctx);
    expect(r.error).toBe(false);
    expect(json(r).sin_resultados).toBeTruthy();
    expect(r.tarjetas).toEqual([]);
  });
  it.each([
    ['dia 16', { dia: 16 }], ['dia -1', { dia: -1 }], ['dia 1,5', { dia: 1.5 }], ['dia texto', { dia: 'hoy' }],
    ['n 0', { n: 0 }], ['n 11', { n: 11 }], ['radio 0', { radio_km: 0 }], ['radio -3', { radio_km: -3 }], ['radio enorme', { radio_km: 5000 }],
    ['sin especie ni grupo', { especie: null }], ['especie y grupo', { grupo: 'boletus' }], ['especie desconocida', { especie: 'seta_inventada' }],
    ['grupo desconocido', { especie: null, grupo: 'marcianos' }], ['dificultad rara', { max_dificultad: 'imposible' }], ['orden raro', { orden: 'azar' }],
    ['solo_publicos texto', { solo_publicos: 'si' }],
  ])('rango/entrada inválida (%s) → error sin tarjetas', async (_n, o) => {
    const b = banco();
    const r = await lanzar('buscar_sitios', buscar(o), b.ctx);
    expect(r.error).toBe(true);
    expect(r.tarjetas).toEqual([]);
    expect(json(r).error).toBeTruthy();
  });
  it('sin sitios.json → error claro; entrada que no es objeto → error', async () => {
    expect((await lanzar('buscar_sitios', buscar(), banco({ datos: null }).ctx)).error).toBe(true);
    expect((await lanzar('buscar_sitios', 'hola', banco().ctx)).error).toBe(true);
  });
  it('un sitio restringido y uno con citas enseñan sus avisos', async () => {
    const b = banco();
    const t = json(await lanzar('buscar_sitios', buscar(), b.ctx)).resultados.find((x: { id: string }) => x.id === 'boletus_aereus:6');
    expect(t.restriccion).toBe('Recogida con autorización');
  });
});

describe('semaforo', () => {
  it('estado, motivo, humedad, banda de altitud y ventana de un sitio un día', async () => {
    const b = banco();
    const j = json(await lanzar('semaforo', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:1', dia: 0 }, b.ctx));
    expect(j).toMatchObject({ estado: 'verde', fecha: HOY, sitio_id: 'boletus_aereus:1' });
    expect(j.motivo).toMatch(/Ventana actual/);
    expect(j.humedad_30d.dias_lluvia).toBe(1);
    expect(j.banda_altitud).toMatch(/entre .* m|Esta altitud|Empieza|Ya baja|ninguna altitud/);
    expect(j.ventana_hasta).toBeTruthy();
  });
  it('avisa de aguacero y de la próxima ventana', async () => {
    const b = banco();
    const j = json(await lanzar('semaforo', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:6', dia: 2 }, banco({ puntoMeteo: () => null }).ctx));
    expect(j.fecha).toBe(sumarDias(HOY, 2));
    const aguacero = banco({ meteo: { ...METEO, puntos: { '1': serie(true, (k) => (k === 2 ? { lluvia: 40 } : {})) } } });
    const k = json(await lanzar('semaforo', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:1', dia: 2 }, aguacero.ctx));
    expect(k.avisos.join(' ')).toMatch(/Aguacero/);
    void b;
  });
  it('sin meteo en caché dice que no hay datos (no es un error ni inventa un color)', async () => {
    const b = banco({ meteo: null });
    const r = await lanzar('semaforo', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:1', dia: 0 }, b.ctx);
    expect(r.error).toBe(false);
    expect(json(r)).toMatchObject({ estado: 'gris' });
    expect(json(r).motivo).toMatch(/No hay datos del tiempo/);
  });
  it.each([
    ['id desconocido', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:999', dia: 0 }],
    ['id sin formato', { especie: 'boletus_aereus', sitio_id: '48211', dia: 0 }],
    ['id de especie que no existe', { especie: 'boletus_aereus', sitio_id: 'seta_x:1', dia: 0 }],
    ['id no texto', { especie: 'boletus_aereus', sitio_id: 7, dia: 0 }],
    ['especie desconocida', { especie: 'seta_x', sitio_id: 'boletus_aereus:1', dia: 0 }],
    ['dia 16', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:1', dia: 16 }],
  ])('%s → error', async (_n, o) => {
    expect((await lanzar('semaforo', o, banco().ctx)).error).toBe(true);
  });
});

describe('ruta_a', () => {
  it('aparcamiento, tiempo a pie, subida y perfil resumido de la ficha Acceso, con tarjeta que incluye el aparcamiento', async () => {
    const b = banco();
    const r = await lanzar('ruta_a', { sitio_id: 'boletus_aereus:1' }, b.ctx);
    const j = json(r);
    expect(j).toMatchObject({ aparcar_en: 'pista de la Fuensanta', a_pie_min: 22, subida_m: 90, dificultad: 'facil' });
    expect(j.perfil).toEqual({ camino_m: 1400, subida_m: 92, bajada_m: 12, altitud_min_m: 410, altitud_max_m: 521 });
    expect(r.tarjetas[0].aparcamiento).toEqual({ lat: 36.499, lon: -4.905, via: 'pista de la Fuensanta' });
  });
  it('sin acceso calculado cae a lo que dice sitios.json y lo señala', async () => {
    const b = banco({ acceso: async () => ({ estado: 'fuera', texto: 'Este punto queda fuera de la zona con datos de acceso.' }) });
    const j = json(await lanzar('ruta_a', { sitio_id: 'boletus_aereus:2' }, b.ctx));
    expect(j.sin_acceso_calculado).toMatch(/fuera de la zona/);
    expect(j.segun_sitios_json).toMatchObject({ a_pie_min: 50, subida_m: 300 });
  });
  it('id desconocido → error', async () => {
    expect((await lanzar('ruta_a', { sitio_id: 'boletus_aereus:77' }, banco().ctx)).error).toBe(true);
  });
});

describe('mostrar_en_mapa', () => {
  it('marca los sitios pedidos', async () => {
    const b = banco();
    const r = await lanzar('mostrar_en_mapa', { sitio_ids: ['boletus_aereus:1', 'lactarius_deliciosus:1'] }, b.ctx);
    expect(r.error).toBe(false);
    expect(b.mapa).toEqual([[{ lat: A1.lat, lon: A1.lon }, { lat: L1.lat, lon: L1.lon }]]);
  });
  it('un id desconocido entre varios válidos: error y NINGÚN efecto', async () => {
    const b = banco();
    const r = await lanzar('mostrar_en_mapa', { sitio_ids: ['boletus_aereus:1', 'boletus_aereus:999'] }, b.ctx);
    expect(r.error).toBe(true);
    expect(b.mapa).toEqual([]);
  });
  it.each([['vacía', []], ['11 ids', Array.from({ length: 11 }, () => 'boletus_aereus:1')], ['no es lista', 'boletus_aereus:1']])('%s → error sin efecto', async (_n, v) => {
    const b = banco();
    expect((await lanzar('mostrar_en_mapa', { sitio_ids: v }, b.ctx)).error).toBe(true);
    expect(b.mapa).toEqual([]);
  });
  it('10 ids es el máximo permitido', async () => {
    const b = banco();
    expect((await lanzar('mostrar_en_mapa', { sitio_ids: Array.from({ length: 10 }, () => 'boletus_aereus:2') }, b.ctx)).error).toBe(false);
  });
});

describe('guardar_en_mis_sitios', () => {
  it('guarda con acceso, estrellas por defecto 1 y devuelve una acción para «Deshacer»', async () => {
    const b = banco();
    const r = await lanzar('guardar_en_mis_sitios', { sitio_id: 'boletus_aereus:1', nota: 'Junto al arroyo', estrellas: null }, b.ctx);
    expect(r.error).toBe(false);
    expect(b.sitios).toHaveLength(1);
    expect(b.sitios[0]).toMatchObject({ id: 'nuevo-1', lat: A1.lat, lon: A1.lon, estrellas: 1, nota: 'Junto al arroyo', especie: 'boletus_aereus', acceso: ACCESO_OK.acceso });
    expect(b.sitios[0].fecha).toBe(AHORA.toISOString());
    expect(r.acciones).toEqual([{ tipo: 'guardado', texto: 'Guardado en Mis sitios: Boleto negro · Junto al arroyo', sitioId: 'nuevo-1' }]);
    expect(json(r)).toMatchObject({ guardado: true, con_acceso: true });
  });
  it('deshacer: borrar el sitio guardado por su id deja Mis sitios como estaba', async () => {
    const b = banco();
    const previo: Sitio = { id: 'previo', lat: 1, lon: 1, estrellas: 2, nota: '', especie: '', fecha: HOY };
    b.sitios.push(previo);
    const r = await lanzar('guardar_en_mis_sitios', { sitio_id: 'boletus_aereus:2', nota: null, estrellas: 3 }, b.ctx);
    expect(b.sitios.map((s) => s.id)).toEqual(['nuevo-1', 'previo']);
    expect(b.sitios[0].estrellas).toBe(3);
    b.sitios = b.sitios.filter((s) => s.id !== r.acciones[0].sitioId);   // lo que hace la UI al pulsar «Deshacer»
    expect(b.sitios).toEqual([previo]);
  });
  it('sin acceso calculado guarda igual, sin acceso', async () => {
    const b = banco({ acceso: async () => { throw new Error('sin datos'); } });
    expect((await lanzar('guardar_en_mis_sitios', { sitio_id: 'boletus_aereus:1', nota: null, estrellas: null }, b.ctx)).error).toBe(false);
    expect(b.sitios[0].acceso).toBeUndefined();
  });
  it('el mismo sitio con la misma nota no se duplica', async () => {
    const b = banco();
    await lanzar('guardar_en_mis_sitios', { sitio_id: 'boletus_aereus:1', nota: 'x', estrellas: null }, b.ctx);
    const r = await lanzar('guardar_en_mis_sitios', { sitio_id: 'boletus_aereus:1', nota: 'x', estrellas: 2 }, b.ctx);
    expect(json(r)).toMatchObject({ guardado: false, ya_estaba: true });
    expect(r.acciones).toEqual([]);
    expect(b.sitios).toHaveLength(1);
  });
  it.each([
    ['nota de 201 caracteres', { sitio_id: 'boletus_aereus:1', nota: 'a'.repeat(201), estrellas: 1 }],
    ['estrellas 0', { sitio_id: 'boletus_aereus:1', nota: null, estrellas: 0 }],
    ['estrellas 4', { sitio_id: 'boletus_aereus:1', nota: null, estrellas: 4 }],
    ['estrellas 1,5', { sitio_id: 'boletus_aereus:1', nota: null, estrellas: 1.5 }],
    ['nota que no es texto', { sitio_id: 'boletus_aereus:1', nota: 7, estrellas: 1 }],
    ['id desconocido', { sitio_id: 'boletus_aereus:999', nota: null, estrellas: 1 }],
  ])('%s → error y no guarda nada', async (_n, o) => {
    const b = banco();
    const r = await lanzar('guardar_en_mis_sitios', o, b.ctx);
    expect(r.error).toBe(true);
    expect(b.sitios).toEqual([]);
    expect(r.acciones).toEqual([]);
  });
  it('una nota de 200 caracteres es válida', async () => {
    const b = banco();
    expect((await lanzar('guardar_en_mis_sitios', { sitio_id: 'boletus_aereus:1', nota: 'a'.repeat(200), estrellas: 1 }, b.ctx)).error).toBe(false);
  });
});

const ruta = (id: string, inicio: number, notas: Track['notas'] = []): Track => ({
  id, inicio, fin: inicio + 3600_000, nombre: `Ruta ${id}`, seg: 0, notas,
  puntos: [{ t: inicio, lat: 36.5, lon: -4.9, alt: 100, prec: 5, seg: 0 }, { t: inicio + 60_000, lat: 36.51, lon: -4.9, alt: 150, prec: 5, seg: 0 }],
});
const nota = (texto: string, lat: number, lon: number, t = 1): Track['notas'][number] => ({ id: texto, t, lat, lon, alt: null, texto, estrellas: 2 });

describe('notas_de_ruta', () => {
  const R_NUEVA = ruta('r2', Date.parse('2026-10-12T08:00:00Z'), [nota('aquí boletus', 36.123456, -4.987654), nota('suelo seco', 36.2, -4.8)]);
  const R_VIEJA = ruta('r1', Date.parse('2026-10-01T08:00:00Z'), [nota('vieja', 36.3, -4.7)]);
  const MIS: Sitio[] = [{ id: 'm1', lat: 36.5, lon: -4.9, estrellas: 3, nota: 'Mi rincón', especie: 'boletus_aereus', fecha: '2026-09-30T10:00:00Z' }];

  it('sin ruta o «última»: la más reciente, con resumen, notas redondeadas y Mis sitios', async () => {
    const b = banco({}, { rutas: [R_NUEVA, R_VIEJA], sitios: MIS });
    for (const ruta of [null, 'ultima', 'Última']) {
      const j = json(await lanzar('notas_de_ruta', { ruta, n: null }, b.ctx));
      expect(j.ruta.id).toBe('r2');
      expect(j.ruta.resumen).toMatch(/km|m ·/);
      expect(j.notas).toEqual([
        { texto: 'aquí boletus', estrellas: 2, lat: 36.123, lon: -4.988, fecha: '1970-01-01T00:00:00.001Z' },
        { texto: 'suelo seco', estrellas: 2, lat: 36.2, lon: -4.8, fecha: '1970-01-01T00:00:00.001Z' },
      ]);
      expect(j.mis_sitios).toEqual([{ id: 'm1', seta: 'Boleto negro', estrellas: 3, nota: 'Mi rincón', lat: 36.5, lon: -4.9, fecha: '2026-09-30' }]);
      expect(j.otras_rutas).toEqual([{ id: 'r1', nombre: 'Ruta r1' }]);
    }
  });
  it('una ruta por id; n recorta las notas', async () => {
    const b = banco({}, { rutas: [R_NUEVA, R_VIEJA] });
    expect(json(await lanzar('notas_de_ruta', { ruta: 'r1', n: null }, b.ctx)).ruta.id).toBe('r1');
    const j = json(await lanzar('notas_de_ruta', { ruta: 'r2', n: 1 }, b.ctx));
    expect(j.notas).toHaveLength(1);
    expect(j.total_notas).toBe(2);
  });
  it('sin rutas dice que no hay (no es un error)', async () => {
    const b = banco({}, { sitios: MIS });
    const r = await lanzar('notas_de_ruta', { ruta: null, n: null }, b.ctx);
    expect(r.error).toBe(false);
    expect(json(r)).toMatchObject({ ruta: null, aviso: 'No hay rutas grabadas.' });
    expect(json(r).mis_sitios).toHaveLength(1);
  });
  it.each([['ruta desconocida', { ruta: 'r99', n: null }], ['n 0', { ruta: null, n: 0 }], ['n 31', { ruta: null, n: 31 }], ['ruta no texto', { ruta: 3, n: null }]])('%s → error', async (_n, o) => {
    expect((await lanzar('notas_de_ruta', o, banco({}, { rutas: [R_NUEVA] }).ctx)).error).toBe(true);
  });
});

describe('proponer_sitios_nuevos', () => {
  it('candidatos de sitios.json bien puntuados, sin rojos, con por_que_nuevo y tarjetas', async () => {
    const b = banco();
    const r = await lanzar('proponer_sitios_nuevos', nuevos({ n: 5 }), b.ctx);
    expect(r.error).toBe(false);
    const todos = new Set(DATOS.especies.boletus_aereus.map((s) => `boletus_aereus:${s.id}`));
    for (const id of ids(r)) expect(todos.has(id)).toBe(true);           // nunca coordenadas inventadas
    expect(ids(r)).not.toContain('boletus_aereus:5');                     // A5 está en rojo
    expect(ids(r)[0]).toBe('boletus_aereus:1');
    expect(json(r).resultados.every((x: { por_que_nuevo: string }) => /referencias/.test(x.por_que_nuevo))).toBe(true);
    expect(r.tarjetas.map((t) => t.id)).toEqual(ids(r));
  });
  it('excluye el top visible (por id y a ≤ 300 m)', async () => {
    const b = banco({ topVisible: ['boletus_aereus:1', 'boletus_aereus:2'] });
    const l = ids(await lanzar('proponer_sitios_nuevos', nuevos(), b.ctx));
    expect(l).not.toContain('boletus_aereus:1');
    expect(l).not.toContain('boletus_aereus:2');
    expect(l).toContain('boletus_aereus:3');
    // Con un grupo, otra seta en el mismo punto del top (E1 está a ~40 m de A1) tampoco sale.
    const g = ids(await lanzar('proponer_sitios_nuevos', nuevos({ especie: null, grupo: 'boletus' }), b.ctx));
    expect(g).not.toContain('boletus_edulis:1');
  });
  it('excluye lo que está a ≤ 300 m de un sitio guardado', async () => {
    const guardado: Sitio = { id: 'm', lat: A3.lat + 0.002, lon: A3.lon, estrellas: 1, nota: '', especie: '', fecha: HOY };       // ~220 m
    const lejano: Sitio = { id: 'n', lat: A4.lat + 0.004, lon: A4.lon, estrellas: 1, nota: '', especie: '', fecha: HOY };           // ~440 m
    const b = banco({}, { sitios: [guardado, lejano] });
    const l = ids(await lanzar('proponer_sitios_nuevos', nuevos(), b.ctx));
    expect(l).not.toContain('boletus_aereus:3');
    expect(l).toContain('boletus_aereus:4');
    const porQue = json(await lanzar('proponer_sitios_nuevos', nuevos(), b.ctx)).resultados.find((x: { id: string }) => x.id === 'boletus_aereus:4').por_que_nuevo;
    expect(porQue).toMatch(/sitios guardados.*uno de sus sitios guardados.*queda a 4\d0 m/);
  });
  it('excluye lo que está a ≤ 300 m de una nota de ruta', async () => {
    const r = ruta('r', 1, [nota('cerca de A2', A2.lat - 0.0015, A2.lon)]);
    const b = banco({}, { rutas: [r] });
    const l = ids(await lanzar('proponer_sitios_nuevos', nuevos(), b.ctx));
    expect(l).not.toContain('boletus_aereus:2');
    expect(l).toContain('boletus_aereus:1');
    expect(json(await lanzar('proponer_sitios_nuevos', nuevos(), b.ctx)).resultados[0].por_que_nuevo).toMatch(/una nota de sus rutas/);
  });
  it('respeta el filtro actual de monte público y dificultad, y el radio', async () => {
    const pub = banco({ filtros: { soloPublicos: true, maxDificultad: null } });
    expect(ids(await lanzar('proponer_sitios_nuevos', nuevos(), pub.ctx)).sort()).toEqual(['boletus_aereus:1', 'boletus_aereus:3']);
    const cerca = banco();
    expect(ids(await lanzar('proponer_sitios_nuevos', nuevos({ radio_km: 1.5 }), cerca.ctx)).sort()).toEqual(['boletus_aereus:1', 'boletus_aereus:2']);
  });
  it('si todo está excluido lo dice sin error', async () => {
    const b = banco({ topVisible: ['boletus_aereus:1', 'boletus_aereus:2', 'boletus_aereus:3', 'boletus_aereus:4', 'boletus_aereus:6'] });
    const r = await lanzar('proponer_sitios_nuevos', nuevos(), b.ctx);
    expect(r.error).toBe(false);
    expect(json(r).sin_resultados).toBeTruthy();
    expect(r.tarjetas).toEqual([]);
  });
  it('sin GPS lo avisa', async () => {
    expect(json(await lanzar('proponer_sitios_nuevos', nuevos(), banco({ posicion: null }).ctx)).aviso_posicion).toMatch(/Sin GPS/);
  });
  it.each([['n 6', { n: 6 }], ['n 0', { n: 0 }], ['dia 16', { dia: 16 }], ['sin especie ni grupo', { especie: null }], ['radio negativo', { radio_km: -1 }]])('%s → error', async (_n, o) => {
    expect((await lanzar('proponer_sitios_nuevos', nuevos(o), banco().ctx)).error).toBe(true);
  });
});

describe('tarjetas solo desde resultados', () => {
  it('las herramientas que no devuelven sitios no producen tarjetas', async () => {
    const b = banco();
    for (const [n, e] of [['semaforo', { especie: 'boletus_aereus', sitio_id: 'boletus_aereus:1', dia: 0 }], ['mostrar_en_mapa', { sitio_ids: ['boletus_aereus:1'] }],
      ['notas_de_ruta', { ruta: null, n: null }]] as const) expect((await lanzar(n, e, b.ctx)).tarjetas, n).toEqual([]);
  });
  it('un error nunca produce tarjetas ni efectos', async () => {
    const b = banco();
    const espia = vi.spyOn(b.ctx, 'guardarSitio');
    const r = await lanzar('guardar_en_mis_sitios', { sitio_id: 'x:1', nota: null, estrellas: 1 }, b.ctx);
    expect(r.tarjetas).toEqual([]);
    expect(espia).not.toHaveBeenCalled();
  });
});
