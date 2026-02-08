#!/usr/bin/env python3
"""Fetch sub-region polygons for Bourgogne map from Nominatim.

Input:
- data/bourgogne-subregions.enriched.json

Outputs:
- data/bourgogne-subregions.polygons.geojson
- data/bourgogne-subregions.polygons.report.json
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

INPUT = Path("data/bourgogne-subregions.enriched.json")
OUT_GEOJSON = Path("data/bourgogne-subregions.polygons.geojson")
OUT_REPORT = Path("data/bourgogne-subregions.polygons.report.json")
CACHE_PATH = Path("data/subregion-polygons-cache.json")
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

ALLOWED_CLASSES = {"boundary", "place", "landuse", "natural"}
ALLOWED_TYPES = {
    "administrative",
    "village",
    "municipality",
    "hamlet",
    "quarter",
    "city",
    "town",
    "county",
    "region",
    "local_authority",
    "suburb",
}
DISALLOWED_TYPES = {
    "place_of_worship",
    "bicycle_parking",
    "alcohol",
    "restaurant",
    "hotel",
    "supermarket",
    "house",
    "yes",
}


def to_id(value: str) -> str:
    text = value or ""
    text = (
        text.encode("ascii", "ignore").decode("ascii")
        if any(ord(c) > 127 for c in text)
        else text
    )
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text


@dataclass
class PolygonCandidate:
    geojson: dict[str, Any]
    display_name: str
    item_type: str
    item_class: str
    lat: float
    lon: float
    score: float


class Nominatim:
    def __init__(self, min_delay: float = 1.1, timeout: float = 30.0) -> None:
        self.min_delay = min_delay
        self.timeout = timeout
        self.last_request = 0.0
        self.cache = self._load_cache()

    def _load_cache(self) -> dict[str, Any]:
        if not CACHE_PATH.exists():
            return {}
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def save_cache(self) -> None:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(self.cache, ensure_ascii=False, indent=2), encoding="utf-8")

    def search(self, query: str) -> list[dict[str, Any]]:
        key = query.strip().lower()
        if key in self.cache:
            cached = self.cache[key]
            return cached if isinstance(cached, list) else []

        now = time.time()
        elapsed = now - self.last_request
        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)

        params = {
            "q": query,
            "format": "jsonv2",
            "limit": "8",
            "countrycodes": "fr",
            "polygon_geojson": "1",
            "addressdetails": "1",
        }
        url = f"{NOMINATIM_URL}?{urlencode(params)}"
        req = Request(
            url,
            headers={
                "User-Agent": "wine-bourgogne-map/1.0 (research project)",
                "Accept": "application/json",
            },
        )
        with urlopen(req, timeout=self.timeout) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
        self.last_request = time.time()
        if not isinstance(payload, list):
            payload = []

        self.cache[key] = payload
        return payload


def score_candidate(item: dict[str, Any], sub_region: str) -> PolygonCandidate | None:
    geo = item.get("geojson")
    if not isinstance(geo, dict):
        return None
    geo_type = str(geo.get("type", ""))
    if geo_type not in {"Polygon", "MultiPolygon"}:
        return None

    display = str(item.get("display_name", ""))
    display_l = display.lower()
    sr_l = sub_region.lower()
    addr = item.get("address") if isinstance(item.get("address"), dict) else {}
    item_type = str(item.get("type", ""))
    item_class = str(item.get("class", ""))

    if item_type in DISALLOWED_TYPES:
        return None
    if item_class and item_class not in ALLOWED_CLASSES:
        return None
    if item_type and item_type not in ALLOWED_TYPES:
        return None

    score = 0.0
    if sr_l in display_l:
        score += 1.6
    if "bourgogne" in display_l:
        score += 0.8
    if item_type in {"administrative", "village", "municipality", "hamlet", "quarter", "city"}:
        score += 0.4
    if item_class in {"boundary", "place"}:
        score += 0.4

    state = str(addr.get("state", "")).lower()
    county = str(addr.get("county", "")).lower()
    if "bourgogne" in state or "cote-d'or" in county or "saone-et-loire" in county or "yonne" in county:
        score += 0.4

    try:
        lat = float(item.get("lat"))
        lon = float(item.get("lon"))
    except (TypeError, ValueError):
        return None

    return PolygonCandidate(
        geojson=geo,
        display_name=display,
        item_type=item_type,
        item_class=item_class,
        lat=lat,
        lon=lon,
        score=score,
    )


def choose_polygon(results: list[dict[str, Any]], sub_region: str) -> PolygonCandidate | None:
    candidates = [c for c in (score_candidate(item, sub_region) for item in results) if c]
    if not candidates:
        return None
    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates[0]


def query_options(sub_region: str) -> list[str]:
    return [
        f"{sub_region}, Bourgogne, France",
        f"{sub_region}, Burgundy, France",
        f"{sub_region}, France",
    ]


def main() -> int:
    payload = json.loads(INPUT.read_text(encoding="utf-8"))
    rows = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        raise SystemExit("Invalid input format")

    sub_regions = [str(item.get("sub_region", "")).strip() for item in rows if str(item.get("sub_region", "")).strip()]
    sub_regions = [sr for sr in sub_regions if sr.lower() != "unknown"]
    sub_regions = sorted(set(sub_regions))

    api = Nominatim()

    features: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "generated_at_unix": int(time.time()),
        "total": len(sub_regions),
        "matched": 0,
        "missing": [],
        "matches": [],
    }

    for idx, sub_region in enumerate(sub_regions, start=1):
        selected: PolygonCandidate | None = None
        selected_query = ""
        for query in query_options(sub_region):
            results = api.search(query)
            selected = choose_polygon(results, sub_region)
            if selected:
                selected_query = query
                break

        if not selected:
            report["missing"].append(sub_region)
            print(f"[{idx}/{len(sub_regions)}] {sub_region}: miss")
            continue

        feature = {
            "type": "Feature",
            "geometry": selected.geojson,
            "properties": {
                "id": to_id(sub_region),
                "sub_region": sub_region,
                "display_name": selected.display_name,
                "source": "nominatim_polygon",
                "query": selected_query,
                "score": round(selected.score, 3),
                "lat": selected.lat,
                "lng": selected.lon,
                "item_type": selected.item_type,
                "item_class": selected.item_class,
            },
        }
        features.append(feature)
        report["matches"].append(
            {
                "sub_region": sub_region,
                "query": selected_query,
                "score": round(selected.score, 3),
                "display_name": selected.display_name,
                "item_type": selected.item_type,
                "item_class": selected.item_class,
            }
        )
        print(f"[{idx}/{len(sub_regions)}] {sub_region}: ok ({selected.item_class}/{selected.item_type})")

    report["matched"] = len(features)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    OUT_GEOJSON.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    api.save_cache()

    print(f"\nWrote {OUT_GEOJSON}")
    print(f"Wrote {OUT_REPORT}")
    print(f"Matched {report['matched']}/{report['total']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
