import json,sys
E=json.load(open(sys.argv[1])); out=sys.argv[2]
L=["# Créditos de la guía de especies","","Fotos de Wikimedia Commons e iNaturalist con licencia libre (CC0, CC BY, CC BY-SA o dominio público). Redimensionadas a 1200 px como máximo en el lado largo (JPEG, calidad 82); sin otros cambios.","","## Fotos","","| Archivo | Especie | Autor | Licencia | Fuente |","|---|---|---|---|---|"]
for e in E:
    for f in e["fotos"]:
        a=f["autor"].replace("|","/")
        L.append(f"| {f['archivo']} | {e['nombre_cientifico'].split(' (')[0]} | {a} | {f['licencia']} | {f['url_fuente']} |")
L+=["","## Fuentes","","| Fuente | URL | Especies |","|---|---|---|"]
src={}
for e in E:
    for s in e["fuentes"]:
        src.setdefault((s["titulo"],s["url"]),[]).append(e["id"])
for (t,u),ids in sorted(src.items(),key=lambda x:(-len(x[1]),x[0][0])):
    L.append(f"| {t} | {u} | {', '.join(ids)} |")
open(out,"w").write("\n".join(L)+"\n"); print(len(src),"fuentes")
