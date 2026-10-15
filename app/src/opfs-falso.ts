// OPFS en memoria para vitest (entorno node): lo justo de FileSystemDirectoryHandle/FileSystemFileHandle.
const noEsta = (n: string) => Object.assign(new Error(`NotFoundError: ${n}`), { name: 'NotFoundError' });

export class ArchivoFalso {
  readonly kind = 'file';
  constructor(public name: string, public padre: DirFalso, public datos: Uint8Array = new Uint8Array()) {}
  async getFile() { return new File([this.datos as BlobPart], this.name); }
  async move(destino: DirFalso, nombre: string) {
    this.padre.entradas.delete(this.name);
    this.name = nombre; this.padre = destino;
    destino.entradas.set(nombre, this);
  }
}

export class DirFalso {
  readonly kind = 'directory';
  entradas = new Map<string, ArchivoFalso | DirFalso>();
  constructor(public name = '') {}
  async getDirectoryHandle(n: string, o: { create?: boolean } = {}) {
    const e = this.entradas.get(n);
    if (e instanceof DirFalso) return e;
    if (e) throw Object.assign(new Error('TypeMismatchError'), { name: 'TypeMismatchError' });
    if (!o.create) throw noEsta(n);
    const d = new DirFalso(n); this.entradas.set(n, d); return d;
  }
  async getFileHandle(n: string, o: { create?: boolean } = {}) {
    const e = this.entradas.get(n);
    if (e instanceof ArchivoFalso) return e;
    if (e) throw Object.assign(new Error('TypeMismatchError'), { name: 'TypeMismatchError' });
    if (!o.create) throw noEsta(n);
    const f = new ArchivoFalso(n, this); this.entradas.set(n, f); return f;
  }
  async removeEntry(n: string, o: { recursive?: boolean } = {}) {
    const e = this.entradas.get(n);
    if (!e) throw noEsta(n);
    if (e instanceof DirFalso && e.entradas.size && !o.recursive) throw Object.assign(new Error('InvalidModificationError'), { name: 'InvalidModificationError' });
    this.entradas.delete(n);
  }
  async *entries(): AsyncIterable<[string, ArchivoFalso | DirFalso]> { for (const x of [...this.entradas]) yield x; }
  async *keys(): AsyncIterable<string> { for (const k of [...this.entradas.keys()]) yield k; }
  /** Ayuda de test: escribe un archivo en una ruta 'a/b/c.txt'. */
  async escribir(ruta: string, texto: string) {
    const p = ruta.split('/'); let d: DirFalso = this;
    for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
    (await d.getFileHandle(p.at(-1)!, { create: true })).datos = new TextEncoder().encode(texto);
  }
  /** Ayuda de test: lista de rutas de archivos bajo este directorio. */
  arbol(prefijo = ''): string[] {
    return [...this.entradas].flatMap(([k, v]) => (v instanceof DirFalso ? v.arbol(`${prefijo}${k}/`) : [`${prefijo}${k}`])).sort();
  }
}
export const raizFalsa = () => new DirFalso();
