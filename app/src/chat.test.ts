// Bucle del cliente del chat (chat.ts): contexto, rondas de herramientas, varios tool_use en paralelo → un solo mensaje
// de resultados, tope de 6 rondas, errores HTTP, rechazo y historial intacto (append-only).
import { describe, expect, it, vi } from 'vitest';
import { MAX_RONDAS, MENSAJE_RECHAZO, construirContexto, conversacionNueva, enviar, mensajeUsuario, redondear01, urlChat, validarConversacion,
  type Bloque, type Conversacion, type DatosContexto, type EntornoChat, type MensajeApi } from './chat';
import type { ResultadoHerramienta, Tarjeta } from './chat-herramientas';

const DATOS: DatosContexto = { fecha: '2026-10-14', hora: '09:50', region: 'marbella', posicion: { lat: 36.51234, lon: -4.88876 }, pestana: 'hoy', diaElegido: 1,
  filtro: 'grupo:boletus', soloPublicos: true, maxDificultad: 'moderada', topVisible: [{ id: 'boletus_aereus:48211', puntuacion: 82, estado: 'verde' }], enLinea: true };

const tarjeta = (id: string): Tarjeta => ({ id, especie: id.split(':')[0], seta: 'Boleto', otras_setas: [], lat: 36.5, lon: -4.9, puntuacion: 80, semaforo: 'verde', dificultad: 'facil',
  a_pie_min: 20, subida_m: 100, distancia_km: 5, titularidad: { clase: 'privado', texto: 'Probablemente privado', publico: false }, restriccion: null, citas: null, razon: 'x' });
const resultado = (o: Partial<ResultadoHerramienta> = {}): ResultadoHerramienta => ({ contenido: '{"ok":true}', error: false, tarjetas: [], acciones: [], ...o });

const respuesta = (cuerpo: object, estado = 200, cab: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json', ...cab } });
const fin = (texto: string, content?: Bloque[], extra: object = {}) =>
  ({ content: content ?? [{ type: 'text', text: texto }], stop_reason: 'end_turn', texto, aviso: 'x', ...extra });
const usar = (...usos: [string, string, object][]) => ({
  content: [{ type: 'thinking', thinking: 'pienso', signature: 'firma' }, ...usos.map(([id, name, input]) => ({ type: 'tool_use', id, name, input }))],
  stop_reason: 'tool_use', texto: '', aviso: 'x' });

/** Entorno con un fetch falso que va sirviendo respuestas y guarda lo que recibe. */
function entorno(respuestas: (() => Response | Promise<Response>)[], o: Partial<EntornoChat> = {}) {
  const cuerpos: { messages: MensajeApi[] }[] = [];
  let i = 0;
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body)));
    const f = respuestas[Math.min(i++, respuestas.length - 1)];
    return f();
  }) as unknown as typeof fetch;
  const ejecutar = vi.fn(async (_n: string, _e: unknown) => resultado());
  const env: EntornoChat = { url: 'https://w.test/chat', fetcher, enLinea: () => true, contexto: () => construirContexto(DATOS), ejecutar, ...o };
  return { env, cuerpos, fetcher, ejecutar };
}

describe('contexto compacto (§3)', () => {
  it('la posición va redondeada a 0,01° hacia Claude (la exacta no sale de la app)', () => {
    const c = construirContexto(DATOS);
    expect(c.posicion).toEqual({ lat: 36.51, lon: -4.89, precision_m: 1000 });
    expect(JSON.stringify(c)).not.toContain('36.51234');
    expect(JSON.stringify(c)).not.toContain('4.88876');
    expect(redondear01(36.5051)).toBe(36.51);
  });
  it('sin GPS la posición es null; el día es relativo; el top visible se acota a 10', () => {
    expect(construirContexto({ ...DATOS, posicion: null }).posicion).toBeNull();
    expect(construirContexto({ ...DATOS, diaElegido: 1 }).dia_elegido).toBe('+1');
    expect(construirContexto({ ...DATOS, diaElegido: 0 }).dia_elegido).toBe('hoy');
    expect(construirContexto({ ...DATOS, diaElegido: null }).dia_elegido).toBeNull();
    const largo = Array.from({ length: 25 }, (_, i) => ({ id: `x:${i}`, puntuacion: 1, estado: 'verde' as const }));
    expect(construirContexto({ ...DATOS, topVisible: largo }).top_visible).toHaveLength(10);
  });
  it('lleva fecha, hora, región, pestaña, filtros y conexión', () => {
    expect(construirContexto(DATOS)).toMatchObject({ fecha: '2026-10-14', hora: '09:50', region: 'marbella', pestana: 'hoy', filtro: 'grupo:boletus',
      solo_publicos: true, max_dificultad: 'moderada', en_linea: true, top_visible: [{ id: 'boletus_aereus:48211', puntuacion: 82, estado: 'verde' }] });
  });
  it('el mensaje del usuario antepone <contexto_app>{json}</contexto_app> como bloque de texto', () => {
    const m = mensajeUsuario(construirContexto(DATOS), '¿Adónde voy?');
    expect(m.role).toBe('user');
    const [a, b] = m.content as Bloque[];
    expect(a.type).toBe('text');
    expect(String(a.text)).toMatch(/^<contexto_app>\{.*\}<\/contexto_app>$/);
    expect(JSON.parse(String(a.text).replace(/<\/?contexto_app>/g, ''))).toMatchObject({ region: 'marbella' });
    expect(b).toEqual({ type: 'text', text: '¿Adónde voy?' });
  });
});

describe('urlChat', () => {
  it('cuelga de la URL del Worker, con o sin la ruta de Gemini', () => {
    expect(urlChat('https://w.dev/identificar')).toBe('https://w.dev/chat');
    expect(urlChat('https://w.dev/')).toBe('https://w.dev/chat');
    expect(urlChat('https://w.dev/identificar/')).toBe('https://w.dev/chat');
    expect(urlChat('https://w.dev')).toBe('https://w.dev/chat');
  });
});

describe('enviar: respuesta directa', () => {
  it('manda { messages } terminado en user, guarda el content tal cual y lee el contador de hoy', async () => {
    const { env, cuerpos, fetcher } = entorno([() => respuesta(fin('Ve a Sierra Blanca.'), 200, { 'X-Restantes-Hoy': '27' })]);
    const conv = conversacionNueva();
    const s = await enviar(conv, '  ¿Adónde voy hoy?  ', env);
    expect(s.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetcher).mock.calls[0][0]).toBe('https://w.test/chat');
    expect(vi.mocked(fetcher).mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(cuerpos[0].messages).toHaveLength(1);
    expect(cuerpos[0].messages[0].role).toBe('user');
    expect(((cuerpos[0].messages[0].content as Bloque[])[1] as Bloque).text).toBe('¿Adónde voy hoy?');
    expect(conv.mensajes.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conv.mensajes[1].content).toEqual([{ type: 'text', text: 'Ve a Sierra Blanca.' }]);
    expect(conv.turnos).toEqual([{ rol: 'usuario', texto: '¿Adónde voy hoy?' }, { rol: 'asistente', texto: 'Ve a Sierra Blanca.', tarjetas: [], acciones: [] }]);
    expect(conv.restantes).toBe(27);
  });
  it('se enseña `texto` (ya filtrado), pero el historial guarda el content original intacto', async () => {
    const original: Bloque[] = [{ type: 'thinking', thinking: 'hmm', signature: 's' }, { type: 'text', text: 'texto SIN filtrar' }];
    const { env } = entorno([() => respuesta(fin('texto filtrado', original))]);
    const conv = conversacionNueva();
    await enviar(conv, 'hola', env);
    expect(conv.turnos[1]).toMatchObject({ texto: 'texto filtrado' });
    expect(conv.mensajes[1].content).toEqual(original);
  });
  it('la segunda pregunta reenvía el historial anterior idéntico (con thinking) y termina en user', async () => {
    const original: Bloque[] = [{ type: 'thinking', thinking: 'hmm', signature: 's' }, { type: 'text', text: 'uno' }];
    const { env, cuerpos } = entorno([() => respuesta(fin('uno', original)), () => respuesta(fin('dos'))]);
    const conv = conversacionNueva();
    await enviar(conv, 'primera', env);
    const antes = JSON.stringify(conv.mensajes);
    await enviar(conv, 'segunda', env);
    expect(cuerpos[1].messages).toHaveLength(3);
    expect(JSON.stringify(cuerpos[1].messages.slice(0, 2))).toBe(antes);
    expect(cuerpos[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(conv.mensajes).toHaveLength(4);
    expect(conv.turnos).toHaveLength(4);
  });
  it('una respuesta cortada por longitud se marca; una vacía lo dice', async () => {
    const conv = conversacionNueva();
    await enviar(conv, 'a', entorno([() => respuesta(fin('largo…', undefined, { stop_reason: 'max_tokens' }))]).env);
    expect(conv.turnos[1]).toMatchObject({ cortado: true });
    const c2 = conversacionNueva();
    await enviar(c2, 'a', entorno([() => respuesta(fin(''))]).env);
    expect((c2.turnos[1] as { texto: string }).texto).toMatch(/no ha escrito respuesta/);
  });
  it('pregunta vacía o sin conexión: no se envía nada', async () => {
    const { env, fetcher } = entorno([() => respuesta(fin('x'))], { enLinea: () => false });
    const conv = conversacionNueva();
    expect(await enviar(conv, 'hola', env)).toMatchObject({ ok: false, codigo: 'sin_conexion', error: 'Necesita conexión.' });
    expect(await enviar(conv, '   ', { ...env, enLinea: () => true })).toMatchObject({ ok: false, codigo: 'vacio' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(conv).toEqual(conversacionNueva());
  });
});

describe('enviar: rondas de herramientas', () => {
  it('ejecuta el tool_use, reenvía el assistant TAL CUAL + el tool_result, y devuelve la respuesta final con las tarjetas', async () => {
    const primera = usar(['tu_1', 'buscar_sitios', { especie: 'boletus_aereus', n: 3 }]);
    const { env, cuerpos, ejecutar } = entorno([() => respuesta(primera, 200, { 'X-Restantes-Hoy': '29' }), () => respuesta(fin('Mira el primero.'), 200, { 'X-Restantes-Hoy': '28' })]);
    ejecutar.mockResolvedValueOnce(resultado({ contenido: '{"resultados":[1]}', tarjetas: [tarjeta('boletus_aereus:1')] }));
    const conv = conversacionNueva();
    const s = await enviar(conv, 'dame sitios', env);
    expect(ejecutar).toHaveBeenCalledWith('buscar_sitios', { especie: 'boletus_aereus', n: 3 });
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(cuerpos[1].messages[1].content).toEqual(primera.content);                       // con su thinking, sin tocar
    expect(cuerpos[1].messages[2].content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"resultados":[1]}' }]);
    expect(conv.mensajes.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(s.ok && s.turno.tarjetas.map((t) => t.id)).toEqual(['boletus_aereus:1']);
    expect(conv.turnos).toHaveLength(2);                                                    // los pasos intermedios no son turnos
    expect(conv.restantes).toBe(29);                                                        // solo cuenta la cabecera de la consulta nueva
  });
  it('varios tool_use en el mismo mensaje → UN solo mensaje user con todos los tool_result, en orden y con sus ids', async () => {
    const dos = usar(['a', 'semaforo', { n: 1 }], ['b', 'ruta_a', { n: 2 }], ['c', 'mostrar_en_mapa', { n: 3 }]);
    const { env, cuerpos, ejecutar } = entorno([() => respuesta(dos), () => respuesta(fin('hecho'))]);
    ejecutar.mockImplementation(async (n) => resultado({ contenido: `{"de":"${n}"}`, error: n === 'ruta_a' }));
    const conv = conversacionNueva();
    await enviar(conv, 'x', env);
    expect(ejecutar).toHaveBeenCalledTimes(3);
    const mensajeResultados = cuerpos[1].messages[2];
    expect(mensajeResultados.role).toBe('user');
    expect(mensajeResultados.content).toEqual([
      { type: 'tool_result', tool_use_id: 'a', content: '{"de":"semaforo"}' },
      { type: 'tool_result', tool_use_id: 'b', content: '{"de":"ruta_a"}', is_error: true },
      { type: 'tool_result', tool_use_id: 'c', content: '{"de":"mostrar_en_mapa"}' },
    ]);
    expect(cuerpos[1].messages).toHaveLength(3);
    expect(conv.mensajes.filter((m) => m.role === 'user' && Array.isArray(m.content) && (m.content as Bloque[]).some((b) => b.type === 'tool_result'))).toHaveLength(1);
  });
  it('si una herramienta lanza, el bucle sigue con un tool_result de error', async () => {
    const { env, cuerpos, ejecutar } = entorno([() => respuesta(usar(['a', 'semaforo', {}])), () => respuesta(fin('ok'))]);
    ejecutar.mockRejectedValueOnce(new Error('boom'));
    const conv = conversacionNueva();
    expect((await enviar(conv, 'x', env)).ok).toBe(true);
    expect((cuerpos[1].messages[2].content as Bloque[])[0]).toMatchObject({ tool_use_id: 'a', is_error: true });
  });
  it('varias rondas seguidas (buscar → semáforo → respuesta)', async () => {
    const { env, ejecutar, cuerpos } = entorno([() => respuesta(usar(['1', 'buscar_sitios', {}])), () => respuesta(usar(['2', 'semaforo', {}])), () => respuesta(fin('listo'))]);
    const conv = conversacionNueva();
    expect((await enviar(conv, 'x', env)).ok).toBe(true);
    expect(ejecutar).toHaveBeenCalledTimes(2);
    expect(cuerpos[2].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(conv.mensajes).toHaveLength(6);
  });
  it('las tarjetas se deduplican por id y se acotan a 10', async () => {
    const lote = (desde: number) => Array.from({ length: 8 }, (_, i) => tarjeta(`x:${desde + i}`));
    const { env, ejecutar } = entorno([() => respuesta(usar(['1', 'buscar_sitios', {}])), () => respuesta(usar(['2', 'proponer_sitios_nuevos', {}])), () => respuesta(fin('ok'))]);
    ejecutar.mockResolvedValueOnce(resultado({ tarjetas: lote(0) })).mockResolvedValueOnce(resultado({ tarjetas: lote(4) }));
    const conv = conversacionNueva();
    const s = await enviar(conv, 'x', env);
    expect(s.ok && s.turno.tarjetas.map((t) => t.id)).toEqual(Array.from({ length: 10 }, (_, i) => `x:${i}`));
  });
  it(`tope de ${MAX_RONDAS} rondas: a la 7.ª petición de herramientas se corta y la conversación queda como estaba`, async () => {
    const { env, fetcher, ejecutar } = entorno([() => respuesta(usar(['t', 'buscar_sitios', {}]))]);
    const conv = conversacionNueva();
    conv.mensajes = [{ role: 'user', content: 'antes' }, { role: 'assistant', content: [{ type: 'text', text: 'previo' }] }];
    conv.turnos = [{ rol: 'usuario', texto: 'antes' }, { rol: 'asistente', texto: 'previo', tarjetas: [], acciones: [] }];
    const antes = JSON.stringify(conv);
    const s = await enviar(conv, 'bucle', env);
    expect(s).toMatchObject({ ok: false, codigo: 'demasiadas_rondas' });
    expect(ejecutar).toHaveBeenCalledTimes(MAX_RONDAS);
    expect(fetcher).toHaveBeenCalledTimes(MAX_RONDAS + 1);
    expect(JSON.stringify(conv)).toBe(antes);
  });
  it('seis rondas justas sí llegan a la respuesta final', async () => {
    const r = Array.from({ length: MAX_RONDAS }, (_, i) => () => respuesta(usar([`t${i}`, 'buscar_sitios', {}])));
    const { env, ejecutar } = entorno([...r, () => respuesta(fin('por fin'))]);
    const conv = conversacionNueva();
    expect((await enviar(conv, 'x', env)).ok).toBe(true);
    expect(ejecutar).toHaveBeenCalledTimes(MAX_RONDAS);
  });
});

describe('enviar: errores', () => {
  const err = (estado: number, codigo: string, mensaje: string) => () => respuesta({ error: { codigo, mensaje } }, estado);
  it.each([
    [429, 'tope_gasto', 'Hoy se ha agotado el presupuesto del chat.'],
    [429, 'demasiadas_rondas', 'Demasiadas consultas seguidas.'],
    [400, 'conversacion_larga', 'Empieza una conversación nueva.'],
    [403, 'origen_no_permitido', 'Origen no permitido.'],
    [502, 'claude_error', 'Claude ha fallado.'],
    [503, 'claude_saturado', 'Claude está saturado.'],
    [504, 'claude_tiempo_agotado', 'Claude tardó demasiado.'],
    [500, 'configuracion_incompleta', 'Falta configuración.'],
  ])('HTTP %i %s: enseña error.mensaje y la conversación no cambia', async (estado, codigo, mensaje) => {
    const { env } = entorno([err(estado, codigo, mensaje)]);
    const conv = conversacionNueva();
    expect(await enviar(conv, 'hola', env)).toEqual({ ok: false, error: mensaje, codigo, status: estado });
    expect(conv).toEqual(conversacionNueva());
  });
  it('límite diario: avisa y deja el contador a 0', async () => {
    const conv = conversacionNueva();
    await enviar(conv, 'x', entorno([err(429, 'limite_diario_superado', 'Has llegado al límite de hoy.')]).env);
    expect(conv.restantes).toBe(0);
  });
  it('sin cuerpo JSON usa un mensaje por defecto según el estado', async () => {
    const s = await enviar(conversacionNueva(), 'x', entorno([() => new Response('<html>', { status: 503 })]).env);
    expect(s).toMatchObject({ ok: false, status: 503 });
    expect(!s.ok && s.error).toMatch(/no está disponible/);
  });
  it('fallo de red o respuesta ilegible', async () => {
    const red = await enviar(conversacionNueva(), 'x', entorno([() => { throw new TypeError('Failed to fetch'); }]).env);
    expect(red).toMatchObject({ ok: false, codigo: 'sin_red' });
    const mala = await enviar(conversacionNueva(), 'x', entorno([() => respuesta({ hola: 1 })]).env);
    expect(mala).toMatchObject({ ok: false, codigo: 'respuesta_invalida' });
  });
  it('un error a mitad de una consulta con herramientas descarta la consulta entera (no queda un tool_use sin resultado)', async () => {
    const { env } = entorno([() => respuesta(usar(['a', 'semaforo', {}])), err(503, 'claude_saturado', 'Saturado.')]);
    const conv = conversacionNueva();
    const s = await enviar(conv, 'x', env);
    expect(s.ok).toBe(false);
    expect(conv).toEqual(conversacionNueva());
  });
  it('tiempo agotado', async () => {
    const lento = () => new Promise<Response>(() => { /* nunca responde */ });
    const fetcher = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => { init?.signal?.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError'))); void lento; })) as unknown as typeof fetch;
    const s = await enviar(conversacionNueva(), 'x', { ...entorno([]).env, fetcher, tiempoMs: 20 });
    expect(s).toMatchObject({ ok: false, codigo: 'tiempo_agotado' });
  });
  it('rechazo (refusal): mensaje fijo y la conversación no cambia', async () => {
    const { env } = entorno([() => respuesta({ content: [], stop_reason: 'refusal', texto: '', aviso: '' })]);
    const conv = conversacionNueva();
    expect(await enviar(conv, 'x', env)).toMatchObject({ ok: false, codigo: 'rechazo', error: MENSAJE_RECHAZO });
    expect(conv).toEqual(conversacionNueva());
  });
  it('un tool_use con stop_reason distinto de tool_use (cortado) no se guarda a medias', async () => {
    const cortada = { ...usar(['a', 'semaforo', {}]), stop_reason: 'max_tokens' };
    const conv = conversacionNueva();
    expect((await enviar(conv, 'x', entorno([() => respuesta(cortada)]).env)).ok).toBe(false);
    expect(conv).toEqual(conversacionNueva());
  });
});

describe('validarConversacion', () => {
  const buena: Conversacion = { mensajes: [{ role: 'user', content: [{ type: 'text', text: 'a' }] }, { role: 'assistant', content: [{ type: 'text', text: 'b' }] }],
    turnos: [{ rol: 'usuario', texto: 'a' }, { rol: 'asistente', texto: 'b', tarjetas: [], acciones: [] }], restantes: 3 };
  it('acepta una conversación completa y vacía', () => {
    expect(validarConversacion(buena)).toEqual(buena);
    expect(validarConversacion(conversacionNueva())).toEqual(conversacionNueva());
  });
  it.each([
    ['null', null], ['sin mensajes', { turnos: [] }], ['empieza en assistant', { ...buena, mensajes: [buena.mensajes[1]] }],
    ['acaba en user (consulta a medias)', { ...buena, mensajes: [buena.mensajes[0]] }], ['rol raro', { ...buena, mensajes: [{ role: 'system', content: 'x' }] }],
    ['turno raro', { ...buena, turnos: [{ rol: 'otro' }] }],
  ])('rechaza %s', (_n, x) => { expect(validarConversacion(x)).toBeNull(); });
});
