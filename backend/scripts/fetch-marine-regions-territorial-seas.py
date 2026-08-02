#!/usr/bin/env python3
"""Retrieve and pin the reviewed Syria/Russia Marine Regions territorial-sea subset."""

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
EXPECTED_SHA256 = "00b007a2a76df5b7a59fc8349c0184d1f561da12c3cec5f5acf65d5f10ad4a6f"
FEATURES = (
    (49096, "SYR", "Syrian 12 NM"),
    (49031, "RUS", "Russian 12 NM"),
)
OUTPUT = Path(__file__).resolve().parents[1] / "reference-data" / "marine-regions-territorial-seas-v4-syr-rus.geojson"


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


def main() -> int:
    if OUTPUT.exists() and digest(OUTPUT.read_bytes()) == EXPECTED_SHA256:
        print(f"Pinned artifact already verified; no network request: {OUTPUT}")
        return 0

    features = [fetch_feature(mrgid) for mrgid, _, _ in FEATURES]
    observed = [
        (feature.get("properties", {}).get("mrgid"), feature.get("properties", {}).get("iso_ter1"), feature.get("properties", {}).get("geoname"))
        for feature in features
    ]
    if observed != list(FEATURES):
        raise RuntimeError(f"Unexpected Marine Regions feature metadata: {observed!r}")

    artifact = (json.dumps(
        {"type": "FeatureCollection", "features": features},
        ensure_ascii=False,
        separators=(",", ":"),
    ) + "\n").encode("utf-8")
    actual_sha256 = digest(artifact)
    if actual_sha256 != EXPECTED_SHA256:
        raise RuntimeError(
            f"Retrieved artifact digest {actual_sha256} does not match reviewed pin {EXPECTED_SHA256}; existing artifact preserved"
        )

    atomic_replace(OUTPUT, artifact)
    print(f"Pinned verified artifact: {OUTPUT} ({actual_sha256})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
