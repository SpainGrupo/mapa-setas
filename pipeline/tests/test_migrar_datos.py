import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "migrar_datos.sh"


def _plano(d: Path):
    (d / "raw" / "gbif").mkdir(parents=True)
    (d / "raw" / "gbif" / "x.json").write_text("[]")
    (d / "raw" / "andalucia.osm.pbf").write_bytes(b"pbf")
    (d / "raw" / "enp").mkdir()
    (d / "out" / "app").mkdir(parents=True)
    (d / "out" / "app" / "manifest.json").write_text("{}")


def test_migra_el_esquema_plano(tmp_path):
    _plano(tmp_path)
    r = subprocess.run(["bash", str(SCRIPT), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert (tmp_path / "marbella/raw/osm/andalucia.osm.pbf").read_bytes() == b"pbf"
    assert (tmp_path / "marbella/raw/enp").is_dir()
    assert (tmp_path / "_comun/gbif/x.json").exists()
    assert (tmp_path / "marbella/out/app/manifest.json").exists()
    assert not (tmp_path / "raw").exists() and not (tmp_path / "out").exists()


def test_es_idempotente(tmp_path):
    _plano(tmp_path)
    subprocess.run(["bash", str(SCRIPT), str(tmp_path)], check=True)
    r = subprocess.run(["bash", str(SCRIPT), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 0 and "Ya migrado" in r.stdout + r.stderr


def test_falla_sin_datos(tmp_path):
    r = subprocess.run(["bash", str(SCRIPT), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 1
