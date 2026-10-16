// SPEC §2 y decisión 3 de Alexander (2026-10-15): la app nunca dice «comestible». Se quitó «Considerada comestible por
// la bibliografía» y este test falla si la palabra vuelve a aparecer en un texto que ve el usuario: las fichas de la
// guía (salvo los títulos de las fuentes, que son citas bibliográficas), los literales de texto del código de la app y
// el texto visible de index.html. Solo se permiten la clave de datos `comestible_menor` y la clase CSS `banner-comestible`.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';

const PALABRA = /comestib/i;
const PERMITIDOS = new Set(['comestible_menor', 'banner-comestible']);
const SRC = fileURLToPath(new URL('./', import.meta.url));
const HTML = fileURLToPath(new URL('../index.html', import.meta.url));

/**
 * Literales de texto (comillas y plantillas) de un archivo TS; los comentarios y las regex no cuentan. Tokenizador
 * mínimo (TypeScript 7 no trae API de JS): una «/» abre regex si lo anterior no es un valor (identificador, número,
 * «)» o «]»).
 */
function literales(codigo: string): string[] {
  const out: string[] = [];
  const llaves: number[] = [];          // profundidad de llaves al abrir cada ${ de plantilla
  let i = 0, prof = 0, previo = '';
  const plantilla = () => {             // i está tras «`» o tras el «}» que cierra un ${
    let s = '';
    while (i < codigo.length) {
      const c = codigo[i];
      if (c === '\\') { s += codigo[i + 1]; i += 2; continue; }
      if (c === '`') { i++; out.push(s); previo = 'v'; return; }
      if (c === '$' && codigo[i + 1] === '{') { i += 2; out.push(s); llaves.push(prof); prof++; previo = '('; return; }
      s += c; i++;
    }
  };
  while (i < codigo.length) {
    const c = codigo[i], d = codigo[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && d === '/') { i = codigo.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && d === '*') { i = codigo.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"') {
      let s = ''; i++;
      while (i < codigo.length && codigo[i] !== c) { if (codigo[i] === '\\') i++; s += codigo[i]; i++; }
      i++; out.push(s); previo = 'v'; continue;
    }
    if (c === '`') { i++; plantilla(); continue; }
    if (c === '/' && !/[\w$)\]v]/.test(previo)) {
      i++; let clase = false;
      while (i < codigo.length && (codigo[i] !== '/' || clase)) {
        if (codigo[i] === '\\') i++; else if (codigo[i] === '[') clase = true; else if (codigo[i] === ']') clase = false;
        i++;
      }
      i++; while (/[a-z]/.test(codigo[i] ?? '')) i++; previo = 'v'; continue;
    }
    if (c === '{') prof++;
    if (c === '}') { prof--; if (llaves.length && llaves.at(-1) === prof) { llaves.pop(); i++; plantilla(); continue; } }
    previo = /[\w$]/.test(c) ? 'v' : c; i++;
    if (previo === 'v') while (/[\w$]/.test(codigo[i] ?? '')) i++;
  }
  return out;
}
/** Partes de un literal que podría ver el usuario: separa por espacios y quita los identificadores permitidos. */
const conPalabra = (t: string) => PALABRA.test(t) && !t.split(/[\s.]+/).every((p) => !PALABRA.test(p) || PERMITIDOS.has(p.replace(/^g-/, '')));

function textosFicha(o: unknown, ruta: string, out: [string, string][]) {
  if (typeof o === 'string') out.push([ruta, o]);
  else if (Array.isArray(o)) o.forEach((x, i) => textosFicha(x, `${ruta}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k !== 'fuentes') textosFicha(v, `${ruta}.${k}`, out);
}

describe('«comestible» no aparece como afirmación en los textos de la app', () => {
  it('fichas de la guía (todos los campos menos las fuentes)', () => {
    const malos: [string, string][] = [];
    for (const f of datos as { id: string }[]) {
      const t: [string, string][] = [];
      textosFicha({ ...f, grupo: undefined }, f.id, t);
      malos.push(...t.filter(([, s]) => PALABRA.test(s)));
    }
    expect(malos).toEqual([]);
  });
  it('literales de texto del código de la app', () => {
    const malos: string[] = [];
    for (const a of readdirSync(SRC).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts')))
      for (const l of literales(readFileSync(SRC + a, 'utf8'))) if (conPalabra(l)) malos.push(`${a}: ${l}`);
    expect(malos).toEqual([]);
  });
  it('texto visible y atributos de index.html', () => {
    const html = readFileSync(HTML, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
    const visible = html.replace(/<[^>]*>/g, ' ');
    const atributos = [...html.matchAll(/\b(?:aria-label|title|alt|placeholder|content)="([^"]*)"/g)].map((m) => m[1]);
    expect([visible, ...atributos].filter(conPalabra)).toEqual([]);
  });
  it('el detector encuentra la frase antigua y respeta los identificadores permitidos', () => {
    expect(conPalabra('Considerada comestible por la bibliografía.')).toBe(true);
    expect(conPalabra('chip g-comestible_menor')).toBe(false);
    expect(conPalabra('banner-comestible')).toBe(false);
    expect(literales("const a = 'x'; // 'comestible'\nconst r = /comestible'/; const b = `y ${f({ k: 'z' })} comestible`; /* \"no\" */ const c = a / 2 / 1;"))
      .toEqual(['x', 'y ', 'z', ' comestible']);
    expect(literales("x = 'a\\'b'; y = \"c\"; z = `d\\`e`; w = [1] / 2; v = (/[/]'/i);")).toEqual(["a'b", 'c', 'd`e']);
  });
});
