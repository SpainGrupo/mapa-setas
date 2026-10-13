# Descarga fotos de Wikimedia Commons para especies nuevas, comprueba la licencia,
# las redimensiona (lado largo <= 1200 px, JPEG q82) y añade sus metadatos a _build/fotos.json.
# Uso: python3 guia/_build/fotos_nuevas.py   (idempotente: no re-descarga archivos existentes)
import html, io, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

GUIA = Path(__file__).resolve().parent.parent
META = GUIA / "_build" / "fotos.json"
UA = {"User-Agent": "setas-guia/1.0 (guía de especies, uso no comercial)"}
LIC_OK = re.compile(r"^(CC0( 1\.0)?|CC BY(-SA)? \d\.\d|Public domain)$", re.I)

# id de especie -> archivos de Commons, en orden (_1, _2, _3)
NUEVAS = {
    "amanita_ponderosa": ["File:Amanita ponderosa1.jpg", "File:Gurumelo.jpg", "File:Gurumelo en el campo.jpg"],
    "pleurotus_eryngii": ["File:Pleurotus-eryngii-seta-de-cardo-sandoval-de-la-reina-2020.jpg",
                          "File:Seta de cardo (Pleurotus eryngii) silvestre en Gran Canaria, Islas Canarias, España.jpg",
                          "File:Pleurotus eryngii 3.jpg"],
    "terfezia_arenaria": ["File:Terfezia (10.3897-mycokeys.84.71372) Figure 3.jpg",
                          "File:2008-05-02 Terfezia arenaria (Moris) Trappe 220243.jpg",
                          "File:Tirmania nivea et Trefezia claveryi (Souk de Rissani, Maroc).jpg"],
    "scleroderma_citrinum": ["File:Dickschaliger Kartoffelbovist (Scleroderma citrinum)-Reife Sporenmasse im Querschnitt.jpg",
                             "File:Gemeiner Kartoffelbovist Scleroderma citrinum.jpg",
                             "File:Braunwarzige-Hartbovist-Scleroderma-verrucosum.jpg"],
}


def get(u):
    for intento in range(6):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers=UA)).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or intento == 5:
                raise
            time.sleep(10 * (intento + 1))


def api(**p):
    p["format"] = "json"
    return json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(p)))


def info(title):
    r = api(action="query", titles=title, prop="imageinfo", iiprop="url|extmetadata", iiurlwidth="1200",
            iiextmetadatafilter="LicenseShortName|Artist")
    p = next(iter(r["query"]["pages"].values()))
    ii = p["imageinfo"][0]
    m = ii["extmetadata"]
    autor = re.sub(r"<[^>]+>", "", m.get("Artist", {}).get("value", "")).strip()
    autor = re.sub(r"\s+", " ", html.unescape(autor))
    return {"licencia": m["LicenseShortName"]["value"].strip(), "autor": autor,
            "url_fuente": ii["descriptionurl"], "thumb": ii.get("thumburl") or ii["url"]}


def main():
    meta = json.loads(META.read_text(encoding="utf-8"))
    for sid, titles in NUEVAS.items():
        out = []
        for i, t in enumerate(titles, 1):
            d = info(t)
            if not LIC_OK.match(d["licencia"]) or re.search(r"\b(NC|ND)\b", d["licencia"]):
                sys.exit(f"licencia no permitida {d['licencia']!r} en {t}")
            arch = f"fotos/{sid}_{i}.jpg"
            dest = GUIA / arch
            if not dest.exists():
                raw = get(d["thumb"])
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                im.thumbnail((1200, 1200), Image.LANCZOS)
                im.save(dest, "JPEG", quality=82, optimize=True)
                time.sleep(3)
            out.append({"archivo": arch, "autor": d["autor"], "licencia": d["licencia"], "url_fuente": d["url_fuente"]})
            print(arch, "|", d["licencia"], "|", d["autor"])
        meta[sid] = out
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
