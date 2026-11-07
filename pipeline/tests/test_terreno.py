"""Comodidad del terreno por sitio (terreno.py, sitios.json v5, 2026-11-07)."""
import math
import numpy as np
import pytest
from setas_pipeline import terreno as T


def test_desnivel_serie_histeresis_como_la_grabacion():
    # Ruido de 1–3 m por debajo del umbral (4 m) no suma; una loma de 10 m sí, de subida y de bajada.
    assert T.desnivel_serie(np.array([100, 101, 100, 102, 100, 103, 100.0])) == (0.0, 0.0)
    assert T.desnivel_serie(np.array([100, 105, 110, 105, 100.0])) == (10.0, 10.0)
    assert T.desnivel_serie(np.array([100, np.nan, 108.0])) == (8.0, 0.0)          # NaN se salta
    assert T.desnivel_serie(np.array([np.nan, np.nan])) == (0.0, 0.0)


def test_metricas_llano_y_rampa():
    llano = [(np.full(25, 300.0), 25.0)]
    m = T.metricas(llano)
    assert m["desnivel_km"] == 0 and m["pendiente_media"] == 0 and m["esfuerzo"] == pytest.approx(1.0)
    # Rampa uniforme del 10 %: 2,5 m cada 25 m → 100 m/km, pendiente 10 %, máx. sostenida 10 %.
    rampa = [(np.arange(25) * 2.5 + 300.0, 25.0)]
    m = T.metricas(rampa)
    assert m["desnivel_km"] == pytest.approx(100, abs=1)
    assert m["pendiente_media"] == pytest.approx(10, abs=0.5)
    assert m["pendiente_max"] == pytest.approx(10, abs=0.5)
    # Tobler a ±10 % frente al llano (en los dos sentidos): ≈ 3,5 y ≈ 5,9 km/h → esfuerzo > 1.
    v0 = float(T.tobler_kmh(0.0))
    esperado = (1 / float(T.tobler_kmh(0.1)) + 1 / float(T.tobler_kmh(-0.1))) / 2 * v0
    assert m["esfuerzo"] == pytest.approx(esperado, abs=0.01) and m["esfuerzo"] > 1


def test_metricas_sube_y_baja_cuenta_las_dos():
    # Dientes de sierra de 10 m cada 100 m: sube 10 y baja 10 por cada 200 m → 100 m/km aunque el saldo sea 0.
    z = np.array([0, 2.5, 5, 7.5, 10, 7.5, 5, 2.5] * 6 + [0.0]) + 500
    m = T.metricas([(z, 25.0)])
    assert m["desnivel_km"] == pytest.approx(100, abs=2)


def test_metricas_sin_datos():
    assert T.metricas([(np.full(10, np.nan), 25.0)]) is None
    assert T.metricas([]) is None


def test_lineas_entorno_circulo_y_cuatro_direcciones():
    z = np.zeros((40, 40)) + 100.0
    lineas = T.lineas_entorno(z, 20, 20, radio_celdas=12)
    pasos = {p for _, p in lineas}
    assert sorted(pasos) == pytest.approx([25.0, 25.0 * math.sqrt(2)])
    # Filas y columnas del círculo: la más larga es el diámetro (24 celdas).
    assert max(len(l) for l, p in lineas if p == 25.0) == 24
    assert all(np.isfinite(l).all() for l, _ in lineas)
    # Pegado al borde: se recorta, no falla.
    assert T.lineas_entorno(z, 1, 1, radio_celdas=12)


def test_entorno_ladera_frente_a_llano():
    yy, xx = np.mgrid[0:60, 0:60]
    llano = np.full((60, 60), 200.0)
    ladera = 200.0 + yy * 5.0                               # 20 % de norte a sur
    a = T.metricas(T.lineas_entorno(llano, 30, 30))
    b = T.metricas(T.lineas_entorno(ladera, 30, 30))
    assert a["desnivel_km"] == 0
    # Filas: llanas; columnas: 200 m/km; diagonales: 200 m/km por km de diagonal / √2… media entre 0 y 200.
    assert 80 < b["desnivel_km"] < 200 and b["pendiente_max"] == pytest.approx(20, abs=1)


def test_perfil_acceso_muestrea_cada_25_m():
    # Camino recto de 4 celdas de 100 m hacia el este por una rampa de 5 m cada 25 m (20 %).
    z = np.tile(np.arange(40) * 5.0 + 100, (40, 1))
    celdas = [(5, 2), (5, 3), (5, 4), (5, 5)]
    lineas = T.lineas_acceso(z, celdas, factor=4)
    m = T.metricas(lineas)
    assert sum((len(l) - 1) * p for l, p in lineas) == pytest.approx(300, abs=1)
    assert m["desnivel_km"] == pytest.approx(200, abs=5)


def test_terreno_sitio_redondea_y_acceso_solo_si_largo():
    z = np.full((80, 80), 300.0)
    direccion = np.full((20, 20), 255, "uint8")
    direccion[5, 5] = 0                                      # el sitio es la fuente: sin camino
    r = T.terreno_sitio(z, direccion, 5, 5, factor=4)
    assert r == {"desnivel_km": 0, "pendiente_media": 0, "pendiente_max": 0, "esfuerzo": 1.0}
    direccion[5, 6:10] = 7                                   # 7 = W en VECINOS: hacia (5, 5)
    r = T.terreno_sitio(z, direccion, 5, 9, factor=4)
    assert r["acceso_desnivel_km"] == 0                      # 400 m de camino ≥ ACCESO_MIN_M
    r = T.terreno_sitio(z, direccion, 5, 7, factor=4)        # 200 m: muy corto para dar m/km
    assert "acceso_desnivel_km" not in r


def test_terreno_sitio_sin_mdt():
    z = np.full((80, 80), np.nan)
    direccion = np.zeros((20, 20), "uint8")
    assert T.terreno_sitio(z, direccion, 5, 5, factor=4) is None
