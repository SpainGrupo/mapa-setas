import dataclasses, shutil
from pathlib import Path
import pytest
import yaml
from setas_pipeline import region as R

AVISO = ("Málaga (Res. 23-09-2026, BOJA 196, vigente hasta 31-05-2027): autoconsumo ≤3 kg por persona y día "
         "sin autorización en montes públicos, salvo Zonas de Reserva; de día, sin rastrillos ni remover el "
         "mantillo. Fincas privadas: permiso del propietario. Cádiz: la última resolución encontrada es de 2019, "
         "sin confirmar su vigencia.")
TEXTOS = {
    "zona_reserva": "Zona de Reserva del espacio protegido: recolectar setas exige autorización previa.",
    "reserva_natural": "Reserva Natural: recolectar setas exige autorización previa.",
    "parque_nacional": "Parque Nacional Sierra de las Nieves: trátalo como recolección con autorización "
                       "(Ley 9/2021); no recolectes sin permiso.",
}


def test_marbella_recoge_exactamente_los_valores_que_estaban_en_el_codigo():
    r = R.cargar_region("marbella")
    assert r.origen == (-4.8825, 36.5101) and r.nombre == "Marbella" and r.etiqueta_origen == "de Marbella"
    assert r.zona == {"radio_m": 220000, "paso_m": 5000, "max_s": 7200, "max_snap_m": 5000, "cierre_m": 5000,
                      "osrm": "https://router.project-osrm.org/table/v1/driving/"}
    assert r.osm_extractos == ("https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf",)
    assert r.legal["aviso"] == AVISO and r.legal["tipos_restriccion"] == TEXTOS
    assert [c["id"] for c in r.legal["ccaa"]] == ["AND"] and r.legal["ccaa"][0]["texto"] == AVISO
    assert r.atribuciones["idoneidad"] == "IGN CC BY 4.0 · © MITECO MFE · IGME · REDIAM CC BY 4.0 · © OpenStreetMap ODbL"
    assert r.atribuciones["rutas"] == "© OpenStreetMap (ODbL); REDIAM, Junta de Andalucía (CC BY 4.0)"
    assert [f["adaptador"] for f in r.capas["incendios"]] == ["rediam_por_anio", "effis"]
    assert r.capas["restricciones"][0]["tipos_zona_reserva"] == ["A", "ARE", "R"]


def test_rutas_por_region():
    r = R.cargar_region("marbella", datos=Path("/x/data"))
    assert (r.raw, r.out, r.app, r.comun, r.respaldo) == (
        Path("/x/data/marbella/raw"), Path("/x/data/marbella/out"), Path("/x/data/marbella/out/app"),
        Path("/x/data/_comun"), Path("/x/data/marbella/out/respaldo"))


def test_marbella_activa_las_12_especies_en_el_orden_del_catalogo():
    from setas_pipeline.idoneidad import cargar_perfiles
    cat = cargar_perfiles(R.ESPECIES)
    r = R.cargar_region("marbella")
    assert list(r.perfiles(cat)) == list(cat) and r.especies_sin_habitat == ()


def test_fusionar_es_profunda_y_no_muta():
    base = {"tiempo": {"ventana_dias": [7, 18], "meses": [9, 10]}, "nombre": "X"}
    f = R.fusionar(base, {"tiempo": {"ventana_dias": [10, 25]}})
    assert f == {"tiempo": {"ventana_dias": [10, 25], "meses": [9, 10]}, "nombre": "X"}
    assert base["tiempo"]["ventana_dias"] == [7, 18]


def test_perfiles_con_overrides_y_sin_habitat():
    cat = {"a": {"nombre": "A", "tiempo": {"episodio_mm": 20, "meses": [10]}}, "b": {"nombre": "B"}, "c": {"nombre": "C"}}
    r = dataclasses.replace(R.cargar_region("marbella"), especies_activas=("c", "a"), especies_sin_habitat=("b",),
                            overrides_especies={"a": {"tiempo": {"episodio_mm": 30}}})
    assert list(r.perfiles(cat)) == ["a", "c"]                                   # orden del catálogo
    assert r.perfiles(cat)["a"]["tiempo"] == {"episodio_mm": 30, "meses": [10]}
    assert list(r.perfiles(cat, incluir_sin_habitat=True)) == ["a", "b", "c"]


def _copia(tmp_path, cambio):
    d = yaml.safe_load((R.REGIONES / "marbella.yaml").read_text())
    cambio(d)
    (tmp_path / "marbella.yaml").write_text(yaml.safe_dump(d, allow_unicode=True))
    return tmp_path


@pytest.mark.parametrize("cambio, mensaje", [
    (lambda d: d.pop("origen"), "origen"),
    (lambda d: d["zona"].pop("radio_m"), "zona.radio_m"),
    (lambda d: d.__setitem__("osm_extractos", []), "osm_extractos"),
    (lambda d: d["capas"]["incendios"].append({"adaptador": "inventado"}), "inventado"),
    (lambda d: d["capas"].__setitem__("montes", [{"adaptador": "x"}]), "montes"),
    (lambda d: d["especies"]["activas"].append("seta_inventada"), "seta_inventada"),
    (lambda d: d["especies"]["sin_habitat"].append("boletus_edulis"), "boletus_edulis"),
    (lambda d: d["overrides_especies"].__setitem__("otra", {}), "otra"),
    (lambda d: d["legal"]["ccaa"][0].pop("verificado"), "verificado"),
    (lambda d: d["atribuciones"].pop("rutas"), "rutas"),
    (lambda d: d.__setitem__("id", "otra_cosa"), "id"),
])
def test_validacion_rechaza_configs_rotas(tmp_path, cambio, mensaje):
    regiones = _copia(tmp_path, cambio)
    with pytest.raises(R.RegionInvalida, match=mensaje):
        R.cargar_region("marbella", regiones=regiones)


def test_listar_y_cli(tmp_path):
    assert "marbella" in R.listar_regiones()
    assert R.region_cli([]).id == "marbella"
    with pytest.raises(SystemExit):
        R.region_cli(["--region", "no_existe"])


@pytest.mark.parametrize("cambio, mensaje", [
    (lambda d: d["especies"].__setitem__("sin_habitat", None), None),                 # vacío en YAML: vale
    (lambda d: d["capas"].__setitem__("senderos", None), "capas.senderos"),
    (lambda d: d["origen"].__setitem__("lon", "-4.88"), "origen"),
    (lambda d: d["especies"].__setitem__("activas", "boletus_edulis"), "especies.activas"),
    (lambda d: d.__setitem__("zona", None), "zona"),
    (lambda d: d["legal"].__setitem__("ccaa", None), "legal.ccaa"),
    (lambda d: d["capas"]["restricciones"][1].__setitem__("tipo", "parque_natural"), "parque_natural"),
])
def test_validacion_no_revienta_con_nulos_y_tipos_raros(tmp_path, cambio, mensaje):
    regiones = _copia(tmp_path, cambio)
    if mensaje is None:
        assert R.cargar_region("marbella", regiones=regiones).especies_sin_habitat == ()
    else:
        with pytest.raises(R.RegionInvalida, match=mensaje):
            R.cargar_region("marbella", regiones=regiones)
