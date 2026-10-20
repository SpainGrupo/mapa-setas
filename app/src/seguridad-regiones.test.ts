// Spec multi-región §7.5: cada comestible activa en alguna región tiene al menos una confusión tóxica o mortal con
// ficha en «No confundir con…», salvo las excepciones que aprobó Alexander. Lee las regiones de pipeline/regiones/*.yaml.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';
import { COMESTIBLES, fichaDeEspecieMapa, type Ficha } from './guia';

const fichas = datos as Ficha[];
const porId = new Map(fichas.map((f) => [f.id, f]));
const DIR = fileURLToPath(new URL('../../pipeline/regiones/', import.meta.url));

/**
 * Excepciones aprobadas por Alexander: las cuatro primeras el 2026-10-15 (decisión 2 del plan D1; fuentes en
 * docs/investigacion/2026-10-15-fichas-alicante.md §3) y las dos últimas el 2026-10-20 (en el chat de la integración de
 * Marbella; fuentes en knowledge/reference/especies-y-grupos.md): id de ficha → motivo. Cada una lleva en su ficha el texto
 * fijo SIN_CONF de guia/_build/build.py. Nunca se rellena para que el test pase.
 */
const EXCEPCIONES_APROBADAS: Record<string, string> = {
  hydnum_repandum: 'AmanitaCesarea.com solo cita Hydnum rufescens; la guía andaluza no le da confusión con setas venenosas',
  suillus_bellinii: 'First Nature (S. collinitus) cita S. granulatus y S. luteus, ninguna tóxica',
  lepista_nuda: 'las fuentes citan Cortinarius violetas, sin ficha ni toxicidad concreta',
  hygrophorus_latitabundus: 'First Nature cita H. hypothejus, sin toxicidad',
  // Aprobadas el 2026-10-20:
  craterellus_cornucopioides: 'AmanitaCesarea.com (C. lutescens) dice que las confusiones peligrosas son difíciles y solo cita C. tubaeformis; First Nature (C. cornucopioides) cita Cantharellus, sin toxicidad',
  pleurotus_ostreatus: 'AmanitaCesarea.com solo cita otros Pleurotus (P. pulmonarius, P. cornucopiae), sin toxicidad',
};
const SIN_CONF = /Las fuentes consultadas no citan una seta tóxica concreta con la que se confunda/;

/** `especies.activas` de una YAML de región, en flujo ([a, b], también en varias líneas) o en bloque (- a). Sin dependencias. */
function activasDeYaml(texto: string): string[] {
  const m = /^especies:[^\n]*\n(?:[ \t]+[^\n]*\n)*?[ \t]+activas:[ \t]*(\[[^\]]*\]|(?:\n[ \t]+-[^\n]*)+)/m.exec(texto);
  if (!m) return [];
  const limpio = m[1].split('\n').map((l) => l.replace(/#.*/, '')).join('\n').trim();
  const items = limpio.startsWith('[') ? limpio.slice(1, limpio.lastIndexOf(']')).split(',') : limpio.split('\n').map((l) => l.replace(/^\s*-\s*/, ''));
  return items.map((s) => s.trim()).filter(Boolean);
}

function regiones(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.yaml'))) out[f.replace(/\.yaml$/, '')] = activasDeYaml(readFileSync(DIR + f, 'utf8'));
  return out;
}
const peligrosasDe = (f: Ficha) => f.no_confundir_con.filter((c) => ['toxica', 'mortal'].includes(porId.get(c.id)?.grupo ?? ''));

describe('lector de especies.activas', () => {
  it('lista en flujo de varias líneas, con comentarios', () => {
    const y = 'id: x\nespecies:          # orden\n  # nota\n  activas: [a, b,   # c\n            d]\n  sin_habitat: []\nlegal: {}\n';
    expect(activasDeYaml(y)).toEqual(['a', 'b', 'd']);
  });
  it('lista en bloque', () => {
    expect(activasDeYaml('especies:\n  activas:\n    - a\n    - b\n  sin_habitat: []\n')).toEqual(['a', 'b']);
  });
  it('sin clave → vacío', () => expect(activasDeYaml('id: x\n')).toEqual([]));
});

describe('spec §7.5: comestibles activas con su confusión peligrosa', () => {
  const R = regiones();
  it('están Marbella y Alicante, y cada región tiene especies activas (el lector no falla en silencio)', () => {
    expect(Object.keys(R)).toEqual(expect.arrayContaining(['marbella', 'alicante']));
    for (const [id, lista] of Object.entries(R)) expect(lista.length, id).toBeGreaterThan(0);
  });
  it('cada especie activa tiene ficha en la guía', () => {
    for (const [reg, lista] of Object.entries(R)) for (const e of lista)
      expect(porId.has(fichaDeEspecieMapa(e)), `${reg}: ${e} → ${fichaDeEspecieMapa(e)}`).toBe(true);
  });
  it('cada comestible activa enlaza al menos una tóxica o mortal con ficha', () => {
    const sin: string[] = [];
    for (const [reg, lista] of Object.entries(R)) for (const e of lista) {
      const f = porId.get(fichaDeEspecieMapa(e));
      if (!f || !COMESTIBLES.has(f.grupo) || EXCEPCIONES_APROBADAS[f.id]) continue;
      if (!peligrosasDe(f).length) sin.push(`${reg}: ${e} (ficha ${f.id})`);
    }
    expect(sin).toEqual([]);
  });
  it('las excepciones aprobadas siguen haciendo falta (si no, se borran) y su ficha lleva el aviso fijo', () => {
    for (const id of Object.keys(EXCEPCIONES_APROBADAS)) {
      const f = porId.get(id)!;
      expect(peligrosasDe(f), id).toEqual([]);
      expect(f.toxicidad_nota, id).toMatch(SIN_CONF);
    }
  });
  it('ninguna especie del mapa es tóxica o mortal (T. terreum no tiene capa)', () => {
    for (const [reg, lista] of Object.entries(R)) for (const e of lista)
      expect(COMESTIBLES.has(porId.get(fichaDeEspecieMapa(e))!.grupo), `${reg}: ${e}`).toBe(true);
  });
});
