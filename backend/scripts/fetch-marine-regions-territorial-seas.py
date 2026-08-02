#!/usr/bin/env python3
"""Retrieve and pin reviewed or provisional Marine Regions territorial-sea subsets."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "https://geo.vliz.be/geoserver/MarineRegions/ows"
VERIFIED_SHA256 = "00b007a2a76df5b7a59fc8349c0184d1f561da12c3cec5f5acf65d5f10ad4a6f"
VERIFIED_FEATURES = (
    (49096, "SYR", "Syrian 12 NM"),
    (49031, "RUS", "Russian 12 NM"),
)
PROVISIONAL_SHA256 = "055c17d26b7aa7814708d3d73b7110571349303a93a5bc12d9475da31fdcdbdd"
PROVISIONAL_FEATURES = (
    (49081, "BHR", "Bahraini 12 NM"),
    (49183, "IRN", "Iranian 12 NM"),
    (49184, "IRQ", "Iraqi 12 NM"),
    (49098, "ISR", "Israeli 12 NM"),
    (49080, "KWT", "Kuwaiti 12 NM"),
    (49097, "LBN", "Lebanese 12 NM"),
    (49077, "OMN", "Omani 12 NM"),
    (49182, "QAT", "Qatari 12 NM"),
    (49079, "SAU", "Saudi Arabian 12 NM"),
    (49083, "ARE", "Emirati 12 NM"),
    (49076, "YEM", "Yemeni 12 NM"),
    (49075, "DJI", "Djiboutian 12 NM"),
    (49074, "ERI", "Eritrean 12 NM"),
    (49095, "LBY", "Libyan 12 NM"),
    (49073, "SOM", "Somali 12 NM"),
    (49078, "SDN", "Sudanese 12 NM"),
    (49113, "BEN", "Beninese 12 NM"),
    (49188, "NGA", "Nigerian 12 NM"),
    (49112, "TGO", "Togolese 12 NM"),
    (49150, "VEN", "Venezuelan 12 NM"),
)
REFERENCE_DATA = Path(__file__).resolve().parents[1] / "reference-data"
VERIFIED_OUTPUT = REFERENCE_DATA / "marine-regions-territorial-seas-v4-syr-rus.geojson"
PROVISIONAL_OUTPUT = REFERENCE_DATA / "marine-regions-territorial-seas-v4-jwla034-remaining.geojson"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fsync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_replace(output: Path, artifact: bytes) -> None:
    """Durably replace output through a unique same-directory temporary file."""
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{output.name}.",
            suffix=".tmp",
            dir=output.parent,
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            stream.write(artifact)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, output)
        temporary = None
        fsync_directory(output.parent)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def fetch_feature(mrgid: int) -> dict:
    params = urllib.parse.urlencode({
        "service": "WFS",
        "version": "1.0.0",
        "request": "GetFeature",
        "typeName": "MarineRegions:eez_12nm",
        "outputFormat": "application/json",
        "CQL_FILTER": f"mrgid={mrgid}",
    })
    error: Exception | None = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(f"{ENDPOINT}?{params}", timeout=120) as response:
                collection = json.load(response)
            features = collection.get("features", [])
            if len(features) != 1:
                raise ValueError(f"MRGID {mrgid}: expected one feature, got {len(features)}")
            return features[0]
        except Exception as exc:  # network/HTTP/JSON failures are retried together
            error = exc
            print(f"MRGID {mrgid} retrieval attempt {attempt}/3 failed: {exc}", file=sys.stderr)
            if attempt < 3:
                time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"MRGID {mrgid} retrieval failed after 3 attempts") from error


def build_artifact(feature_specs: tuple[tuple[int, str, str], ...]) -> bytes:
    features = [fetch_feature(mrgid) for mrgid, _, _ in feature_specs]
    observed = [
        (feature.get("properties", {}).get("mrgid"), feature.get("properties", {}).get("iso_ter1"), feature.get("properties", {}).get("geoname"))
        for feature in features
    ]
    if observed != list(feature_specs):
        raise RuntimeError(f"Unexpected Marine Regions feature metadata: {observed!r}")
    return (json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False,
        separators=(",", ":"),
    ) + "\n").encode("utf-8")


def main() -> int:
    if sys.argv[1:] == []:
        output, expected_sha256, feature_specs, label = VERIFIED_OUTPUT, VERIFIED_SHA256, VERIFIED_FEATURES, "verified"
    elif sys.argv[1:] == ["--provisional"]:
        output, expected_sha256, feature_specs, label = PROVISIONAL_OUTPUT, PROVISIONAL_SHA256, PROVISIONAL_FEATURES, "provisional"
    else:
        raise SystemExit("usage: fetch-marine-regions-territorial-seas.py [--provisional]")

    if output.exists() and digest(output.read_bytes()) == expected_sha256:
        print(f"Pinned {label} artifact already verified; no network request: {output}")
        return 0

    artifact = build_artifact(feature_specs)
    actual_sha256 = digest(artifact)
    if actual_sha256 != expected_sha256:
        raise RuntimeError(
            f"Retrieved artifact digest {actual_sha256} does not match reviewed pin {expected_sha256}; existing artifact preserved"
        )

    atomic_replace(output, artifact)
    print(f"Pinned {label} artifact: {output} ({len(artifact)} bytes, {actual_sha256})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
