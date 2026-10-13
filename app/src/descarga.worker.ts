/// <reference lib="webworker" />
// Descarga un archivo a OPFS con SyncAccessHandle (Chrome, Safari 15.2+, Firefox 111+).
const ambito = self as unknown as DedicatedWorkerGlobalScope;

ambito.onmessage = async (e: MessageEvent<{ url: string; nombre: string }>) => {
  const { url, nombre } = e.data;
  try {
    const raiz = await navigator.storage.getDirectory();
    const dir = await raiz.getDirectoryHandle('mapas', { create: true });
    const fh = await dir.getFileHandle(nombre, { create: true });
    const h = await (fh as any).createSyncAccessHandle();
    try {
      h.truncate(0);
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} al descargar ${nombre}`);
      const lector = r.body.getReader();
      let pos = 0, pendiente = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        h.write(value, { at: pos });
        pos += value.byteLength;
        pendiente += value.byteLength;
        if (pendiente > 1 << 20) { ambito.postMessage({ tipo: 'progreso', bytes: pendiente }); pendiente = 0; }
      }
      h.flush();
      ambito.postMessage({ tipo: 'progreso', bytes: pendiente });
      ambito.postMessage({ tipo: 'hecho', bytes: pos });
    } finally {
      h.close();
    }
  } catch (err) {
    ambito.postMessage({ tipo: 'error', mensaje: String((err as Error)?.message ?? err) });
  }
};
