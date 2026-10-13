import { FetchSource, type RangeResponse, type Source } from 'pmtiles';

/** Source de PMTiles que lee del archivo descargado en OPFS si existe y, si no, por HTTP (Range). */
export class FuenteOpfsHttp implements Source {
  private blob?: Promise<Blob | null>;
  private http: Source;
  origen: 'opfs' | 'http' | null = null;
  lecturas = { opfs: 0, http: 0 };

  constructor(private url: string, private obtenerBlob: () => Promise<Blob | null>, http?: Source) {
    this.http = http ?? new FetchSource(url);
  }

  getKey() { return this.url; }

  /** Vuelve a consultar OPFS en la próxima lectura (tras descargar o borrar). */
  olvidar() { this.blob = undefined; }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    this.blob ??= this.obtenerBlob().catch(() => null);
    const b = await this.blob;
    if (b) {
      this.origen = 'opfs';
      this.lecturas.opfs++;
      return { data: await b.slice(offset, offset + length).arrayBuffer() };
    }
    this.origen = 'http';
    this.lecturas.http++;
    return this.http.getBytes(offset, length, signal, etag);
  }
}
