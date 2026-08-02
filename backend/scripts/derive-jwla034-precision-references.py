#!/usr/bin/env python3
"""Reproduce the pinned JWLA-034 precision-reference source and provenance manifest.

Normal operation is offline and derives from the compact checked-in Natural Earth subset.
Use --refresh-sources to retrieve exact full upstream bytes, verify every trust anchor,
recreate the compact subset, and then derive the same pins. No candidate is published
until all source, geometry, and digest checks have succeeded.

Requires Shapely >=2.1,<3 and pyproj >=3.7,<4.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import tempfile
import urllib.request
import uuid
from pathlib import Path
from typing import Any

import pyproj
import shapely
from pyproj import CRS, Geod, Transformer
from shapely.geometry import Point, Polygon, box, mapping, shape
from shapely.ops import transform

NATURAL_EARTH_VERSION = "v5.1.2"
NATURAL_EARTH_TAG_COMMIT = "f1890d9f152c896d250a77557a5751a93d494776"
OFFICIAL_CIRCULAR_URL = "https://lmalloyds.com/wp-content/uploads/2025/06/JWLA-034-Saudi-Arabia.pdf"
OFFICIAL_CIRCULAR_SHA256 = "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9"
OCEAN_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_ocean.geojson"
OCEAN_SHA256 = "f9696a1337c746a0f6c8c13bc60d0f230d2ef8d105198d5657726c8f8e763fc2"
ADMIN0_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson"
ADMIN0_SHA256 = "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255"
SOURCE_SUBSET_SHA256 = "cb1cd8304062373c48610be14bcd6b8f63389bb66cff10a8f9e3b74727b7bef9"
ARTIFACT_SHA256 = "1b18b7248d47e3c4db53cb2cb80be635dcca781149ec6aabfeea4bf9ce164f22"
MANIFEST_SHA256 = "3bbb5fca57b73d43ed2ab7a583ee2b7ede10d9769030854cf36eb19e332aa800"

SUBSET_NAME = "natural-earth-v5.1.2-jwla034-precision-subsets.geojson"
ARTIFACT_NAME = "jwla-034-precision-references.source.geojson"
MANIFEST_NAME = "jwla-034-precision-references.manifest.json"
PIN_NAMES = (SUBSET_NAME, ARTIFACT_NAME, MANIFEST_NAME)
JOURNAL_NAME = ".jwla-034-precision-pin-transaction.json"
IRAN_BUFFER_METERS = 22_224
BUFFER_QUAD_SEGS = 32
IRAN_BUFFER_CRS = "+proj=aeqd +lat_0=38 +lon_0=51 +datum=WGS84 +units=m +no_defs"
WGS84 = "EPSG:4326"

BLACK_AZOV_ANCHORS = [
    [29.765483333333332, 45.18096666666667],
    [29.852333333333334, 45.18725],
    [29.992716666666666, 45.19123333333334],
    [30.040133333333333, 45.08923333333333],
    [30.9787, 44.77708333333333],
    [31.17495, 44.7374],
    [31.410033333333335, 44.04795],
    [31.332566666666665, 43.45151666666667],
    [40.00998333333333, 43.38543333333333],
]
GULF_OF_GUINEA_ANCHORS = [[1.2, 6.1125], [3.0, -0.6666666666666666], [8.7, -0.6666666666666666]]

FEATURE_SPECS = [
    {
        "id": "jwla-034:precision:black-sea-azov-marine",
        "geometryStatus": "derived-marine-reference-inland-waters-excluded",
        "limitations": [
            "Marine-water reference only; all JWLA-034 inland waters of Ukraine, Crimea/other Ukrainian territories under Russian control, the Don/Donets reaches, and Belarus south of 52°30′N are unresolved and explicitly excluded.",
            "Natural Earth is a cartographic ocean mask, not a navigational or legal boundary source.",
        ],
    },
    {
        "id": "jwla-034:precision:gulf-of-guinea-water",
        "geometryStatus": "derived-water-only-reference",
        "limitations": [
            "Official coordinate boundary clipped to a Natural Earth ocean mask; Natural Earth coastline generalization limits precision.",
            "Reference-only and not for navigation or automatic contract determination.",
        ],
    },
    {
        "id": "jwla-034:precision:iran-caspian-12nm",
        "geometryStatus": "provisional-derived-12nm-reference",
        "limitations": [
            "Provisional cartographic derivation from a 22,224m buffer of Natural Earth Iran geometry; it is not an authoritative Iranian territorial-sea boundary.",
            "Caspian delimitation, baselines, islands, and legal claims are not represented; manual review is required.",
        ],
    },
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def require_dependencies() -> None:
    def version_tuple(value: str) -> tuple[int, ...]:
        return tuple(int(part) for part in value.split(".")[:2])

    if not ((2, 1) <= version_tuple(shapely.__version__) < (3, 0)):
        raise RuntimeError(f"Shapely >=2.1,<3 required; found {shapely.__version__}")
    if not ((3, 7) <= version_tuple(pyproj.__version__) < (4, 0)):
        raise RuntimeError(f"pyproj >=3.7,<4 required; found {pyproj.__version__}")


def download_exact(url: str, expected_sha256: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "jwla034-precision-pin/1"})
    with urllib.request.urlopen(request, timeout=180) as response:
        data = response.read()
    observed = sha256(data)
    if observed != expected_sha256:
        raise RuntimeError(f"Raw source hash mismatch for {url}: expected {expected_sha256}, got {observed}")
    return data


def compact_feature(identifier: str, geometry: Any, source_name: str) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": identifier,
        "properties": {"source": source_name},
        "geometry": mapping(geometry),
    }


def build_source_subset(ocean_document: dict[str, Any], admin_document: dict[str, Any]) -> bytes:
    if ocean_document.get("type") != "FeatureCollection" or len(ocean_document.get("features", [])) != 1:
        raise RuntimeError("Unexpected Natural Earth ocean source schema")
    ocean = shape(ocean_document["features"][0]["geometry"])
    iran_candidates = [
        feature for feature in admin_document.get("features", [])
        if feature.get("properties", {}).get("ADM0_A3") == "IRN"
        and feature.get("properties", {}).get("ADMIN") == "Iran"
    ]
    if len(iran_candidates) != 1:
        raise RuntimeError(f"Expected one pinned Natural Earth Iran feature, got {len(iran_candidates)}")
    caspian_candidates = [component for component in ocean.geoms if component.covers(Point(51, 40))]
    if len(caspian_candidates) != 1:
        raise RuntimeError(f"Expected one Caspian ocean component at [51,40], got {len(caspian_candidates)}")

    collection = {
        "type": "FeatureCollection",
        "features": [
            compact_feature("ne:ocean:black-sea-azov", ocean.intersection(box(28, 42, 42, 48)), "ne_10m_ocean"),
            compact_feature("ne:ocean:gulf-of-guinea", ocean.intersection(box(0, -2, 11, 8)), "ne_10m_ocean"),
            compact_feature("ne:ocean:caspian", caspian_candidates[0], "ne_10m_ocean"),
            compact_feature("ne:admin0:iran", shape(iran_candidates[0]["geometry"]), "ne_10m_admin_0_countries"),
        ],
    }
    result = canonical(collection)
    observed = sha256(result)
    if observed != SOURCE_SUBSET_SHA256:
        raise RuntimeError(f"Reproduced compact Natural Earth subset hash mismatch: expected {SOURCE_SUBSET_SHA256}, got {observed}")
    return result


def load_subset(subset_bytes: bytes) -> dict[str, Any]:
    observed = sha256(subset_bytes)
    if observed != SOURCE_SUBSET_SHA256:
        raise RuntimeError(f"Pinned compact source subset hash mismatch: expected {SOURCE_SUBSET_SHA256}, got {observed}")
    subset = json.loads(subset_bytes)
    expected_ids = ["ne:ocean:black-sea-azov", "ne:ocean:gulf-of-guinea", "ne:ocean:caspian", "ne:admin0:iran"]
    observed_ids = [feature.get("id") for feature in subset.get("features", [])]
    if subset.get("type") != "FeatureCollection" or observed_ids != expected_ids:
        raise RuntimeError(f"Pinned compact source subset feature identity/order mismatch: {observed_ids}")
    return subset


def derive_geometries(subset: dict[str, Any]) -> list[Any]:
    geometries = {feature["id"]: shape(feature["geometry"]) for feature in subset["features"]}

    # The positive envelope closes north/east/west of the complete regional mask. The
    # nine official JWLA anchors remain the only marine-facing precision boundary.
    black_envelope = Polygon(BLACK_AZOV_ANCHORS + [
        [42, BLACK_AZOV_ANCHORS[-1][1]], [42, 48], [28, 48], [28, BLACK_AZOV_ANCHORS[0][1]],
    ])
    black_azov = black_envelope.intersection(geometries["ne:ocean:black-sea-azov"])

    # Close landward beyond the pinned regional mask so the visible closure follows the
    # Natural Earth coastline, while the three official points define the seaward limits.
    gulf_envelope = Polygon(GULF_OF_GUINEA_ANCHORS + [
        [11, GULF_OF_GUINEA_ANCHORS[-1][1]], [11, 8], [1.2, 8],
    ])
    gulf = gulf_envelope.intersection(geometries["ne:ocean:gulf-of-guinea"])

    projection = CRS.from_proj4(IRAN_BUFFER_CRS)
    forward = Transformer.from_crs(WGS84, projection, always_xy=True).transform
    inverse = Transformer.from_crs(projection, WGS84, always_xy=True).transform
    iran_projected = transform(forward, geometries["ne:admin0:iran"])
    caspian_projected = transform(forward, geometries["ne:ocean:caspian"])
    iran_caspian = transform(
        inverse,
        iran_projected.buffer(IRAN_BUFFER_METERS, quad_segs=BUFFER_QUAD_SEGS)
        .difference(iran_projected)
        .intersection(caspian_projected),
    )

    derived = [black_azov, gulf, iran_caspian]
    for spec, geometry in zip(FEATURE_SPECS, derived, strict=True):
        if geometry.is_empty or geometry.geom_type not in {"Polygon", "MultiPolygon"} or not geometry.is_valid:
            raise RuntimeError(f"Invalid derived geometry for {spec['id']}: {geometry.geom_type}")
    return derived


def build_artifact(geometries: list[Any]) -> tuple[bytes, list[dict[str, Any]]]:
    features = []
    for spec, geometry in zip(FEATURE_SPECS, geometries, strict=True):
        features.append({
            "type": "Feature",
            "id": spec["id"],
            "properties": {
                "geometryStatus": spec["geometryStatus"],
                "monitoringMode": "reference-only",
                "contractAlertEligible": False,
                "manualReviewRequired": True,
            },
            "geometry": mapping(geometry),
        })
    return canonical({"type": "FeatureCollection", "features": features}), features


def build_manifest(subset_bytes: bytes, artifact_bytes: bytes, features: list[dict[str, Any]]) -> bytes:
    geod = Geod(ellps="WGS84")
    feature_manifest = []
    for spec, feature in zip(FEATURE_SPECS, features, strict=True):
        geometry = shape(feature["geometry"])
        area_square_km = abs(geod.geometry_area_perimeter(geometry)[0]) / 1_000_000
        feature_manifest.append({
            "id": spec["id"],
            "geometryStatus": spec["geometryStatus"],
            "monitoringMode": "reference-only",
            "contractAlertEligible": False,
            "manualReviewRequired": True,
            "geometrySha256": sha256(canonical(feature["geometry"])),
            "bbox": list(geometry.bounds),
            "geodesicAreaSquareKm": area_square_km,
            "limitations": spec["limitations"],
        })

    manifest = {
        "schemaVersion": 1,
        "dataset": "JWLA-034 precision references",
        "reviewStatus": "manual-review-display-only",
        "manualReviewRequired": True,
        "hashAlgorithm": "SHA-256",
        "hashScope": "All SHA-256 values hash exact raw bytes; per-feature geometrySha256 hashes canonical compact geometry JSON plus newline.",
        "artifact": f"backend/reference-data/{ARTIFACT_NAME}",
        "artifactSha256": sha256(artifact_bytes),
        "sourceSubset": f"backend/reference-data/{SUBSET_NAME}",
        "sourceSubsetSha256": sha256(subset_bytes),
        "sourceSha256": {
            "officialCircular": OFFICIAL_CIRCULAR_SHA256,
            "naturalEarthOcean": OCEAN_SHA256,
            "naturalEarthAdmin0Countries": ADMIN0_SHA256,
        },
        "officialCircular": {
            "reference": "JWLA-034",
            "publishedAt": "2026-07-29",
            "url": OFFICIAL_CIRCULAR_URL,
            "license": "Copyright source document; facts/coordinates used for independent reference derivation.",
        },
        "naturalEarth": {
            "version": NATURAL_EARTH_VERSION,
            "tagCommit": NATURAL_EARTH_TAG_COMMIT,
            "oceanUrl": OCEAN_URL,
            "admin0CountriesUrl": ADMIN0_URL,
            "license": "Public domain",
            "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/",
        },
        "runtimeRequirements": {"shapely": ">=2.1,<3", "pyproj": ">=3.7,<4"},
        "retrievalRecipe": "python3 backend/scripts/derive-jwla034-precision-references.py --refresh-sources",
        "offlineRecipe": "python3 backend/scripts/derive-jwla034-precision-references.py",
        "crs": {"source": "EPSG:4326", "output": "EPSG:4326", "iranBuffer": IRAN_BUFFER_CRS},
        "algorithm": {
            "blackSeaAzov": "intersect official nine-anchor positive inclusion envelope with pinned Natural Earth Black Sea/Sea of Azov ocean subset; no inland-water geometry",
            "gulfOfGuinea": "intersect official Togo/high-seas/Cape Lopez positive inclusion envelope with pinned Natural Earth Gulf of Guinea ocean subset",
            "iranCaspian": "project Iran and Caspian mask to local azimuthal equidistant CRS; buffer Iran; subtract Iran; intersect Caspian mask; transform to EPSG:4326",
            "iranCaspianBufferMeters": IRAN_BUFFER_METERS,
            "bufferQuadSegs": BUFFER_QUAD_SEGS,
            "blackSeaAzovOfficialAnchors": BLACK_AZOV_ANCHORS,
            "gulfOfGuineaOfficialAnchors": GULF_OF_GUINEA_ANCHORS,
        },
        "features": feature_manifest,
    }
    return canonical(manifest)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("wb", prefix=f".{path.name}.", suffix=".tmp", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        temporary = None
        directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def fsync_directory(directory: Path) -> None:
    directory_fd = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def transaction_path(directory: Path, name: str, token: str, suffix: str) -> Path:
    if name not in PIN_NAMES or Path(name).name != name:
        raise RuntimeError(f"Unexpected precision pin name: {name}")
    return directory / f".{name}.{token}.{suffix}"


def write_journal(directory: Path, value: dict[str, Any]) -> None:
    atomic_write(directory / JOURNAL_NAME, canonical(value))


def validate_journal(directory: Path, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("version") != 1 or value.get("phase") not in {"prepared", "rolled-back", "committed"}:
        raise RuntimeError("Malformed JWLA-034 precision pin transaction journal")
    token = value.get("token")
    entries = value.get("entries")
    try:
        valid_token = isinstance(token, str) and str(uuid.UUID(token)) == token
    except (ValueError, AttributeError):
        valid_token = False
    if not valid_token or not isinstance(entries, list) or len(entries) != len(PIN_NAMES):
        raise RuntimeError("Malformed JWLA-034 precision pin transaction journal")
    assert isinstance(token, str)
    if [entry.get("name") for entry in entries if isinstance(entry, dict)] != list(PIN_NAMES):
        raise RuntimeError("Malformed JWLA-034 precision pin transaction journal")
    for entry in entries:
        name = entry["name"]
        expected_stage = transaction_path(directory, name, token, "stage").name
        expected_backup = transaction_path(directory, name, token, "backup").name
        if entry.get("stage") != expected_stage or entry.get("backup") != expected_backup or not isinstance(entry.get("hadPrior"), bool):
            raise RuntimeError("Malformed JWLA-034 precision pin transaction journal")
    return value


def cleanup_transaction(directory: Path, journal: dict[str, Any]) -> None:
    for entry in journal["entries"]:
        (directory / entry["stage"]).unlink(missing_ok=True)
        (directory / entry["backup"]).unlink(missing_ok=True)
    fsync_directory(directory)
    (directory / JOURNAL_NAME).unlink(missing_ok=True)
    fsync_directory(directory)


def recover_transaction(directory: Path) -> None:
    journal_path = directory / JOURNAL_NAME
    if not journal_path.exists():
        return
    journal = validate_journal(directory, json.loads(journal_path.read_bytes()))
    if journal["phase"] == "prepared":
        for entry in journal["entries"]:
            final = directory / entry["name"]
            backup = directory / entry["backup"]
            if entry["hadPrior"]:
                if not backup.exists():
                    raise RuntimeError(f"Missing precision pin rollback backup: {backup.name}")
                # Preserve backups until the durable rolled-back phase is written so
                # recovery remains idempotent if the process dies during restoration.
                atomic_write(final, backup.read_bytes())
            else:
                final.unlink(missing_ok=True)
        fsync_directory(directory)
        journal = {**journal, "phase": "rolled-back"}
        write_journal(directory, journal)
    cleanup_transaction(directory, journal)


def publish_all(candidates: dict[Path, bytes]) -> None:
    normalized = {path.resolve(): data for path, data in candidates.items()}
    directories = {path.parent for path in normalized}
    if len(directories) != 1 or set(path.name for path in normalized) != set(PIN_NAMES):
        raise RuntimeError("Precision pins must publish as one exact three-file generation")
    directory = next(iter(directories))
    directory.mkdir(parents=True, exist_ok=True)
    recover_transaction(directory)
    token = str(uuid.uuid4())
    entries: list[dict[str, Any]] = []
    for name in PIN_NAMES:
        final = directory / name
        stage = transaction_path(directory, name, token, "stage")
        backup = transaction_path(directory, name, token, "backup")
        atomic_write(stage, normalized[final])
        had_prior = final.exists()
        if had_prior:
            atomic_write(backup, final.read_bytes())
        entries.append({"name": name, "stage": stage.name, "backup": backup.name, "hadPrior": had_prior})
    journal = {"version": 1, "phase": "prepared", "token": token, "entries": entries}
    write_journal(directory, journal)
    try:
        for index, entry in enumerate(entries, start=1):
            os.replace(directory / entry["stage"], directory / entry["name"])
            if (os.environ.get("JWLA034_PRECISION_TEST_MODE") == "1"
                    and os.environ.get("JWLA034_PRECISION_TEST_KILL_AFTER_REPLACE") == str(index)):
                os.kill(os.getpid(), signal.SIGKILL)
        fsync_directory(directory)
        journal = {**journal, "phase": "committed"}
        write_journal(directory, journal)
        cleanup_transaction(directory, journal)
    except BaseException:
        recover_transaction(directory)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-dir", type=Path, default=Path(__file__).resolve().parents[1] / "reference-data")
    parser.add_argument("--source-subset", type=Path, help="read the reviewed compact subset from a separate path")
    parser.add_argument("--refresh-sources", action="store_true")
    parser.add_argument("--recover-only", action="store_true", help="recover an interrupted pin transaction without deriving")
    args = parser.parse_args()
    require_dependencies()

    subset_path = args.reference_dir / SUBSET_NAME
    args.reference_dir.mkdir(parents=True, exist_ok=True)
    recover_transaction(args.reference_dir.resolve())
    if args.recover_only:
        print(json.dumps({"recovered": True}, sort_keys=True))
        return 0
    if args.refresh_sources:
        # The circular is intentionally verified even though coordinate parsing remains a
        # reviewed explicit recipe. This catches silent replacement at the official URL.
        download_exact(OFFICIAL_CIRCULAR_URL, OFFICIAL_CIRCULAR_SHA256)
        ocean_bytes = download_exact(OCEAN_URL, OCEAN_SHA256)
        admin_bytes = download_exact(ADMIN0_URL, ADMIN0_SHA256)
        subset_bytes = build_source_subset(json.loads(ocean_bytes), json.loads(admin_bytes))
    else:
        source_subset_path = args.source_subset or subset_path
        if not source_subset_path.exists():
            raise RuntimeError(f"Pinned compact source subset is missing: {source_subset_path}")
        subset_bytes = source_subset_path.read_bytes()

    subset = load_subset(subset_bytes)
    geometries = derive_geometries(subset)
    artifact_bytes, features = build_artifact(geometries)
    manifest_bytes = build_manifest(subset_bytes, artifact_bytes, features)
    observed = {
        "source subset": sha256(subset_bytes),
        "artifact": sha256(artifact_bytes),
        "manifest": sha256(manifest_bytes),
    }
    expected = {
        "source subset": SOURCE_SUBSET_SHA256,
        "artifact": ARTIFACT_SHA256,
        "manifest": MANIFEST_SHA256,
    }
    if observed != expected:
        raise RuntimeError(f"Reviewed precision pin digest mismatch before publish: expected {expected}, got {observed}")
    candidates = {
        subset_path: subset_bytes,
        args.reference_dir / ARTIFACT_NAME: artifact_bytes,
        args.reference_dir / MANIFEST_NAME: manifest_bytes,
    }
    publish_all(candidates)
    print(json.dumps({
        "sourceSubsetSha256": sha256(subset_bytes),
        "artifactSha256": sha256(artifact_bytes),
        "manifestSha256": sha256(manifest_bytes),
        "featureCount": len(features),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
