#!/usr/bin/env python3
"""Enrich Bourgogne wine dataset with map-ready geo and derived fields.

Inputs:
- data/bourgogne-wines.json (from scrape_bourgogne.py)

Outputs:
- data/bourgogne-wines.enriched.json
- data/bourgogne-producers.enriched.json
- data/bourgogne-producers.geojson
- data/bourgogne-producer-grape-points.geojson
- data/bourgogne-subregions.enriched.json
- data/bourgogne-subregions.geojson
- data/bourgogne-grapes.enriched.json
- data/geocode-cache.json
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
WIKIDATA_SEARCH_URL = "https://www.wikidata.org/w/api.php"
WIKIDATA_ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData"
DEFAULT_INPUT = Path("data/bourgogne-wines.json")
DEFAULT_OUTPUT_DIR = Path("data")
DEFAULT_CACHE = Path("data/geocode-cache.json")

STYLE_PATTERNS = {
    "elegant": [r"\belegan"],
    "complex": [r"\bcomplex"],
    "mineral": [r"\bminer"],
    "fruity": [r"\bfrut"],
    "floral": [r"\bflor"],
    "woody_oak": [r"\bmadeira", r"\bcarvalho"],
    "fresh": [r"\bfresc"],
    "acidic": [r"\bacidez"],
    "structured": [r"\btanino", r"\bencorp"],
    "balanced": [r"\bequilibr"],
    "persistent": [r"\bpersist"],
}

COMMON_NOISE_TOKENS = {
    "domaine",
    "domain",
    "maison",
    "les",
    "du",
    "de",
    "la",
    "le",
    "des",
    "and",
    "et",
    "vinhos",
    "wine",
}


@dataclass
class GeocodeResult:
    lat: float
    lng: float
    display_name: str
    query: str
    source: str
    confidence: float


class NominatimClient:
    def __init__(self, cache_path: Path, min_delay: float = 1.1, timeout: float = 30.0) -> None:
        self.cache_path = cache_path
        self.min_delay = min_delay
        self.timeout = timeout
        self.last_request = 0.0
        self.cache = self._load_cache()

    def _load_cache(self) -> dict[str, Any]:
        if not self.cache_path.exists():
            return {}
        try:
            return json.loads(self.cache_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def save_cache(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(self.cache, ensure_ascii=False, indent=2), encoding="utf-8")

    def _request(self, query: str) -> list[dict[str, Any]]:
        now = time.time()
        elapsed = now - self.last_request
        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)

        params = {
            "q": query,
            "format": "jsonv2",
            "limit": "8",
            "addressdetails": "1",
            "namedetails": "1",
            "countrycodes": "fr",
        }
        url = f"{NOMINATIM_URL}?{urlencode(params)}"
        req = Request(
            url,
            headers={
                "User-Agent": "wine-bourgogne-map/1.0 (research project)",
                "Accept": "application/json",
            },
        )
        with urlopen(req, timeout=self.timeout) as res:
            raw = res.read().decode("utf-8", errors="replace")
        self.last_request = time.time()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = []
        if not isinstance(payload, list):
            return []
        return payload

    def search(self, query: str) -> list[dict[str, Any]]:
        key = query.strip().lower()
        if key in self.cache:
            cached = self.cache[key]
            return cached if isinstance(cached, list) else []

        results = self._request(query)
        self.cache[key] = results
        return results


class WikidataClient:
    def __init__(self, cache: dict[str, Any], min_delay: float = 0.25, timeout: float = 30.0) -> None:
        self.cache = cache
        self.min_delay = min_delay
        self.timeout = timeout
        self.last_request = 0.0

    def _request_json(self, url: str) -> dict[str, Any] | list[Any]:
        now = time.time()
        elapsed = now - self.last_request
        if elapsed < self.min_delay:
            time.sleep(self.min_delay - elapsed)

        req = Request(
            url,
            headers={
                "User-Agent": "wine-bourgogne-map/1.0 (research project)",
                "Accept": "application/json",
            },
        )
        with urlopen(req, timeout=self.timeout) as res:
            raw = res.read().decode("utf-8", errors="replace")
        self.last_request = time.time()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def search_entities(self, query: str) -> list[dict[str, Any]]:
        key = f"wd_search::{query.strip().lower()}"
        if key in self.cache:
            cached = self.cache[key]
            return cached if isinstance(cached, list) else []

        params = {
            "action": "wbsearchentities",
            "search": query,
            "language": "en",
            "format": "json",
            "limit": "10",
        }
        url = f"{WIKIDATA_SEARCH_URL}?{urlencode(params)}"
        payload = self._request_json(url)
        results = payload.get("search", []) if isinstance(payload, dict) else []
        if not isinstance(results, list):
            results = []
        self.cache[key] = results
        return results

    def entity_coordinates(self, entity_id: str) -> tuple[float, float] | None:
        key = f"wd_entity::{entity_id}"
        if key in self.cache:
            cached = self.cache[key]
            if (
                isinstance(cached, dict)
                and isinstance(cached.get("lat"), (int, float))
                and isinstance(cached.get("lng"), (int, float))
            ):
                return float(cached["lat"]), float(cached["lng"])
            return None

        url = f"{WIKIDATA_ENTITY_URL}/{entity_id}.json"
        payload = self._request_json(url)
        coords = None
        if isinstance(payload, dict):
            entities = payload.get("entities", {})
            entity = entities.get(entity_id, {}) if isinstance(entities, dict) else {}
            claims = entity.get("claims", {}) if isinstance(entity, dict) else {}
            p625 = claims.get("P625", []) if isinstance(claims, dict) else []
            if isinstance(p625, list) and p625:
                first = p625[0]
                mainsnak = first.get("mainsnak", {}) if isinstance(first, dict) else {}
                datavalue = mainsnak.get("datavalue", {}) if isinstance(mainsnak, dict) else {}
                value = datavalue.get("value", {}) if isinstance(datavalue, dict) else {}
                lat = value.get("latitude")
                lng = value.get("longitude")
                if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                    coords = (float(lat), float(lng))

        if coords:
            self.cache[key] = {"lat": coords[0], "lng": coords[1]}
        else:
            self.cache[key] = {"lat": None, "lng": None}
        return coords


def norm_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def producer_tokens(name: str) -> set[str]:
    cleaned = re.sub(r"[^A-Za-zÀ-ÿ0-9 ]+", " ", name).lower()
    parts = {p for p in cleaned.split() if len(p) >= 4 and p not in COMMON_NOISE_TOKENS}
    return parts


def pick_best_geocode(
    results: list[dict[str, Any]],
    producer_name: str | None = None,
    expected_region: str | None = None,
) -> GeocodeResult | None:
    if not results:
        return None

    p_tokens = producer_tokens(producer_name or "")
    exp_region = (expected_region or "").lower()

    best_score = -1.0
    best_item: dict[str, Any] | None = None

    for item in results:
        try:
            lat = float(item.get("lat"))
            lon = float(item.get("lon"))
        except (TypeError, ValueError):
            continue

        display = norm_text(item.get("display_name"))
        display_l = display.lower()
        address = item.get("address") if isinstance(item.get("address"), dict) else {}
        item_class = norm_text(item.get("class", "")).lower()
        item_type = norm_text(item.get("type", "")).lower()

        score = 0.0

        if item_class in {"shop", "office", "tourism", "amenity"}:
            score += 0.6
        if "win" in item_type or "vine" in item_type or "wine" in display_l:
            score += 0.6

        if p_tokens:
            matched = sum(1 for t in p_tokens if t in display_l)
            score += min(1.2, matched * 0.4)

        country = norm_text(address.get("country_code", item.get("country_code", ""))).lower()
        if country == "fr":
            score += 0.3

        state = norm_text(address.get("state", "")).lower()
        county = norm_text(address.get("county", "")).lower()
        region_blob = f"{state} {county} {display_l}"
        if "bourgogne" in region_blob:
            score += 0.6

        if exp_region and exp_region in display_l:
            score += 0.4

        if score > best_score:
            best_score = score
            best_item = item

    if not best_item:
        return None

    confidence = min(0.98, max(0.2, best_score / 2.8))
    return GeocodeResult(
        lat=float(best_item["lat"]),
        lng=float(best_item["lon"]),
        display_name=norm_text(best_item.get("display_name")),
        query="",
        source="nominatim",
        confidence=round(confidence, 3),
    )


def try_geocode_subregion(client: NominatimClient, sub_region: str) -> GeocodeResult | None:
    queries = [
        f"{sub_region}, Bourgogne, France",
        f"{sub_region}, Burgundy, France",
    ]
    for q in queries:
        picked = pick_best_geocode(client.search(q), expected_region=sub_region)
        if picked:
            picked.query = q
            picked.source = "sub_region_geocode"
            picked.confidence = max(picked.confidence, 0.7)
            return picked
    return None


def try_geocode_producer(
    client: NominatimClient,
    producer: str,
    primary_sub_region: str | None,
) -> GeocodeResult | None:
    queries = []
    if primary_sub_region:
        queries.append(f"{producer}, {primary_sub_region}, Bourgogne, France")
    queries.extend(
        [
            f"{producer}, Bourgogne, France",
            f"{producer} winery, Bourgogne, France",
            f"{producer} domaine, Bourgogne, France",
            f"{producer}, Burgundy, France",
        ]
    )

    for q in queries:
        picked = pick_best_geocode(client.search(q), producer_name=producer, expected_region=primary_sub_region)
        if picked:
            picked.query = q
            picked.source = "producer_geocode"
            return picked
    return None


def pick_best_wikidata_entity(results: list[dict[str, Any]], producer: str) -> dict[str, Any] | None:
    if not results:
        return None

    tokens = producer_tokens(producer)
    best_score = -1.0
    best: dict[str, Any] | None = None

    for entity in results:
        if not isinstance(entity, dict):
            continue
        label = norm_text(entity.get("label"))
        description = norm_text(entity.get("description"))
        blob = f"{label} {description}".lower()

        score = 0.0
        if any(k in blob for k in ("winery", "wine producer", "wine house", "vineyard", "viticulture")):
            score += 1.0
        if "domaine" in blob or "chateau" in blob or "maison" in blob:
            score += 0.4
        if tokens:
            matched = sum(1 for t in tokens if t in blob)
            score += min(1.2, matched * 0.4)
        if "france" in blob or "burgundy" in blob or "bourgogne" in blob:
            score += 0.2

        if score > best_score:
            best_score = score
            best = entity

    return best


def try_wikidata_producer(client: WikidataClient, producer: str) -> GeocodeResult | None:
    queries = [producer]
    producer_l = producer.lower()
    if "domaine" not in producer_l:
        queries.append(f"Domaine {producer}")
    if "maison" not in producer_l:
        queries.append(f"Maison {producer}")
    if "chateau" not in producer_l and "château" not in producer_l:
        queries.append(f"Chateau {producer}")
    queries.append(f"{producer} winery")

    for query in queries:
        entities = client.search_entities(query)
        best = pick_best_wikidata_entity(entities, producer)
        if not best:
            continue
        entity_id = norm_text(best.get("id"))
        if not entity_id:
            continue
        coords = client.entity_coordinates(entity_id)
        if not coords:
            continue

        label = norm_text(best.get("label")) or producer
        description = norm_text(best.get("description"))
        display_name = f"{label} ({description})" if description else label
        return GeocodeResult(
            lat=coords[0],
            lng=coords[1],
            display_name=display_name,
            query=query,
            source="producer_wikidata",
            confidence=0.74,
        )

    return None


def price_bucket(price: float | None) -> str:
    if price is None:
        return "unknown"
    if price < 250:
        return "entry"
    if price < 600:
        return "mid"
    if price < 1200:
        return "premium"
    return "iconic"


def extract_style_keywords(text: str | None) -> list[str]:
    base = norm_text(text).lower()
    if not base:
        return []
    found: list[str] = []
    for tag, patterns in STYLE_PATTERNS.items():
        if any(re.search(p, base) for p in patterns):
            found.append(tag)
    return found


def load_items(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(items, list):
        raise ValueError("Input JSON does not contain .items[]")
    return [x for x in items if isinstance(x, dict)]


def summarize_numeric(values: list[float]) -> dict[str, float | None]:
    clean = [float(v) for v in values if isinstance(v, (int, float)) and float(v) > 0]
    if not clean:
        return {"min": None, "max": None, "avg": None}
    return {
        "min": round(min(clean), 2),
        "max": round(max(clean), 2),
        "avg": round(statistics.mean(clean), 2),
    }


def build_geojson_point(lat: float, lng: float, props: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": props,
    }


def run(args: argparse.Namespace) -> int:
    items = load_items(args.input)
    if not items:
        print("No items to enrich", file=sys.stderr)
        return 1

    client = NominatimClient(cache_path=args.cache, min_delay=args.min_delay, timeout=args.timeout)
    wd_client = WikidataClient(cache=client.cache, min_delay=args.wikidata_min_delay, timeout=args.timeout)

    # Global fallback (Bourgogne centroid-ish from geocoder)
    region_geo = try_geocode_subregion(client, "Bourgogne")
    if not region_geo:
        region_geo = GeocodeResult(
            lat=47.052,
            lng=4.383,
            display_name="Bourgogne, France",
            query="hardcoded",
            source="hardcoded_region_fallback",
            confidence=0.3,
        )

    # Sub-region geocoding
    sub_regions = sorted({norm_text(i.get("sub_region")) for i in items if norm_text(i.get("sub_region"))})
    sub_region_geo: dict[str, GeocodeResult] = {}
    for idx, sr in enumerate(sub_regions, start=1):
        geo = try_geocode_subregion(client, sr)
        if geo:
            sub_region_geo[sr] = geo
        print(f"[geocode-subregion] {idx}/{len(sub_regions)} {sr} -> {'ok' if geo else 'miss'}")

    # Producer summary + geocoding
    wines_by_producer: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        p = norm_text(item.get("producer"))
        if p:
            wines_by_producer[p].append(item)

    producer_rows: list[dict[str, Any]] = []
    producer_geo: dict[str, GeocodeResult] = {}

    producers_sorted = sorted(wines_by_producer)
    for idx, producer in enumerate(producers_sorted, start=1):
        wines = wines_by_producer[producer]
        sub_counter = Counter(norm_text(w.get("sub_region")) for w in wines if norm_text(w.get("sub_region")))
        grape_counter = Counter(norm_text(w.get("grape")) for w in wines if norm_text(w.get("grape")))
        primary_sub_region = sub_counter.most_common(1)[0][0] if sub_counter else ""

        geo = try_geocode_producer(client, producer, primary_sub_region)
        if not geo:
            geo = try_wikidata_producer(wd_client, producer)
        if geo:
            producer_geo[producer] = geo
            geo_source = geo.source
            geo_confidence = geo.confidence
        elif primary_sub_region in sub_region_geo:
            srg = sub_region_geo[primary_sub_region]
            geo = GeocodeResult(
                lat=srg.lat,
                lng=srg.lng,
                display_name=srg.display_name,
                query=srg.query,
                source="producer_sub_region_fallback",
                confidence=0.55,
            )
            producer_geo[producer] = geo
            geo_source = geo.source
            geo_confidence = geo.confidence
        else:
            geo = GeocodeResult(
                lat=region_geo.lat,
                lng=region_geo.lng,
                display_name=region_geo.display_name,
                query=region_geo.query,
                source="producer_region_fallback",
                confidence=0.35,
            )
            producer_geo[producer] = geo
            geo_source = geo.source
            geo_confidence = geo.confidence

        prices = [
            (w.get("price_brl") or {}).get("listing_sale_price")
            for w in wines
            if isinstance(w.get("price_brl"), dict)
        ]
        clean_prices = [float(v) for v in prices if isinstance(v, (int, float))]

        producer_rows.append(
            {
                "producer": producer,
                "wine_count": len(wines),
                "primary_sub_region": primary_sub_region,
                "sub_regions": dict(sub_counter),
                "grapes": dict(grape_counter),
                "price_brl": summarize_numeric(clean_prices),
                "location": {
                    "lat": geo.lat,
                    "lng": geo.lng,
                    "display_name": geo.display_name,
                    "source": geo_source,
                    "confidence": geo_confidence,
                },
            }
        )

        print(f"[geocode-producer] {idx}/{len(producers_sorted)} {producer} -> {geo_source}")

    # Wine-level enrichment
    enriched_items: list[dict[str, Any]] = []
    for wine in items:
        producer = norm_text(wine.get("producer"))
        sub_region = norm_text(wine.get("sub_region"))
        grape = norm_text(wine.get("grape"))

        coord_source = ""
        coord_conf = 0.0
        lat: float
        lng: float

        if sub_region and sub_region in sub_region_geo:
            g = sub_region_geo[sub_region]
            lat, lng = g.lat, g.lng
            coord_source = "sub_region"
            coord_conf = max(0.68, g.confidence)
        elif producer and producer in producer_geo:
            g = producer_geo[producer]
            lat, lng = g.lat, g.lng
            coord_source = "producer"
            coord_conf = max(0.5, g.confidence)
        else:
            lat, lng = region_geo.lat, region_geo.lng
            coord_source = "region"
            coord_conf = 0.3

        list_price = None
        price_obj = wine.get("price_brl")
        if isinstance(price_obj, dict):
            v = price_obj.get("listing_sale_price")
            if isinstance(v, (int, float)) and float(v) > 0:
                list_price = float(v)

        desc = norm_text(wine.get("description"))
        style = extract_style_keywords(desc)

        enriched = dict(wine)
        enriched["map"] = {
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "source": coord_source,
            "confidence": round(coord_conf, 3),
        }
        enriched["derived"] = {
            "price_bucket": price_bucket(list_price),
            "style_keywords": style,
            "producer_key": producer,
            "sub_region_key": sub_region,
            "grape_key": grape,
        }
        enriched_items.append(enriched)

    # Producer GeoJSON
    producer_geojson_features: list[dict[str, Any]] = []
    producer_rows_sorted = sorted(producer_rows, key=lambda r: (-r["wine_count"], r["producer"]))
    for row in producer_rows_sorted:
        loc = row["location"]
        producer_geojson_features.append(
            build_geojson_point(
                lat=loc["lat"],
                lng=loc["lng"],
                props={
                    "producer": row["producer"],
                    "wine_count": row["wine_count"],
                    "primary_sub_region": row["primary_sub_region"],
                    "location_source": loc["source"],
                    "location_confidence": loc["confidence"],
                    "price_min": row["price_brl"]["min"],
                    "price_avg": row["price_brl"]["avg"],
                    "price_max": row["price_brl"]["max"],
                },
            )
        )

    # Producer + grape points (requested map layer)
    # Group by producer/grape and use average of enriched wine points.
    pg_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for wine in enriched_items:
        producer = norm_text(wine.get("producer"))
        grape = norm_text(wine.get("grape")) or "Unknown"
        pg_groups[(producer, grape)].append(wine)

    pg_features: list[dict[str, Any]] = []
    for (producer, grape), rows in sorted(pg_groups.items(), key=lambda x: (-len(x[1]), x[0][0], x[0][1])):
        lats = [r["map"]["lat"] for r in rows]
        lngs = [r["map"]["lng"] for r in rows]
        prices = [
            (r.get("price_brl") or {}).get("listing_sale_price")
            for r in rows
            if isinstance(r.get("price_brl"), dict)
        ]
        clean_prices = [float(v) for v in prices if isinstance(v, (int, float))]

        lat = round(statistics.mean(lats), 6)
        lng = round(statistics.mean(lngs), 6)
        style_counter = Counter(k for r in rows for k in (r.get("derived") or {}).get("style_keywords", []))

        pg_features.append(
            build_geojson_point(
                lat=lat,
                lng=lng,
                props={
                    "producer": producer,
                    "grape": grape,
                    "wine_count": len(rows),
                    "avg_price_brl": round(statistics.mean(clean_prices), 2) if clean_prices else None,
                    "dominant_style_keywords": [k for k, _ in style_counter.most_common(5)],
                    "point_kind": "producer_grape",
                },
            )
        )

    # Write outputs
    args.output_dir.mkdir(parents=True, exist_ok=True)

    enriched_payload = {
        "generated_at_unix": int(time.time()),
        "source": "https://www.mistral.com.br/regiao/bourgogne",
        "count": len(enriched_items),
        "geo_coverage": {
            "sub_regions_total": len(sub_regions),
            "sub_regions_geocoded": len(sub_region_geo),
            "producers_total": len(producer_rows_sorted),
            "producer_geo_direct": sum(1 for r in producer_rows_sorted if r["location"]["source"] == "producer_geocode"),
        },
        "items": sorted(enriched_items, key=lambda x: (x.get("id") is None, x.get("id"))),
    }

    producers_payload = {
        "generated_at_unix": int(time.time()),
        "count": len(producer_rows_sorted),
        "items": producer_rows_sorted,
    }

    producers_geojson = {
        "type": "FeatureCollection",
        "features": producer_geojson_features,
    }

    producer_grape_geojson = {
        "type": "FeatureCollection",
        "features": pg_features,
    }

    # Sub-region summaries/layer
    sr_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for wine in enriched_items:
        sr = norm_text(wine.get("sub_region")) or "Unknown"
        sr_groups[sr].append(wine)

    sr_rows: list[dict[str, Any]] = []
    sr_features: list[dict[str, Any]] = []
    for sub_region, rows in sorted(sr_groups.items(), key=lambda x: (-len(x[1]), x[0])):
        producers = sorted({norm_text(r.get("producer")) for r in rows if norm_text(r.get("producer"))})
        grapes = Counter(norm_text(r.get("grape")) for r in rows if norm_text(r.get("grape")))
        prices = [
            (r.get("price_brl") or {}).get("listing_sale_price")
            for r in rows
            if isinstance(r.get("price_brl"), dict)
        ]
        clean_prices = [float(v) for v in prices if isinstance(v, (int, float))]

        geo = sub_region_geo.get(sub_region)
        if geo:
            lat, lng, source, conf = geo.lat, geo.lng, "sub_region_geocode", max(0.68, geo.confidence)
        else:
            lats = [r["map"]["lat"] for r in rows]
            lngs = [r["map"]["lng"] for r in rows]
            lat, lng, source, conf = statistics.mean(lats), statistics.mean(lngs), "derived_from_wines", 0.5

        row = {
            "sub_region": sub_region,
            "wine_count": len(rows),
            "producer_count": len(producers),
            "producers": producers,
            "grapes": dict(grapes),
            "price_brl": summarize_numeric(clean_prices),
            "location": {
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "source": source,
                "confidence": round(conf, 3),
            },
        }
        sr_rows.append(row)
        sr_features.append(
            build_geojson_point(
                lat=row["location"]["lat"],
                lng=row["location"]["lng"],
                props={
                    "sub_region": sub_region,
                    "wine_count": row["wine_count"],
                    "producer_count": row["producer_count"],
                    "location_source": row["location"]["source"],
                    "location_confidence": row["location"]["confidence"],
                    "price_avg": row["price_brl"]["avg"],
                },
            )
        )

    subregions_payload = {
        "generated_at_unix": int(time.time()),
        "count": len(sr_rows),
        "items": sr_rows,
    }

    subregions_geojson = {
        "type": "FeatureCollection",
        "features": sr_features,
    }

    # Grape summaries
    grape_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for wine in enriched_items:
        grape = norm_text(wine.get("grape")) or "Unknown"
        grape_groups[grape].append(wine)

    grape_rows: list[dict[str, Any]] = []
    for grape, rows in sorted(grape_groups.items(), key=lambda x: (-len(x[1]), x[0])):
        lats = [r["map"]["lat"] for r in rows]
        lngs = [r["map"]["lng"] for r in rows]
        prices = [
            (r.get("price_brl") or {}).get("listing_sale_price")
            for r in rows
            if isinstance(r.get("price_brl"), dict)
        ]
        clean_prices = [float(v) for v in prices if isinstance(v, (int, float))]
        producers = sorted({norm_text(r.get("producer")) for r in rows if norm_text(r.get("producer"))})
        style_counter = Counter(k for r in rows for k in (r.get("derived") or {}).get("style_keywords", []))

        grape_rows.append(
            {
                "grape": grape,
                "wine_count": len(rows),
                "producer_count": len(producers),
                "producers": producers,
                "price_brl": summarize_numeric(clean_prices),
                "centroid": {"lat": round(statistics.mean(lats), 6), "lng": round(statistics.mean(lngs), 6)},
                "dominant_style_keywords": [k for k, _ in style_counter.most_common(8)],
            }
        )

    grapes_payload = {
        "generated_at_unix": int(time.time()),
        "count": len(grape_rows),
        "items": grape_rows,
    }

    (args.output_dir / "bourgogne-wines.enriched.json").write_text(
        json.dumps(enriched_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "bourgogne-producers.enriched.json").write_text(
        json.dumps(producers_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "bourgogne-producers.geojson").write_text(
        json.dumps(producers_geojson, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "bourgogne-producer-grape-points.geojson").write_text(
        json.dumps(producer_grape_geojson, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "bourgogne-subregions.enriched.json").write_text(
        json.dumps(subregions_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "bourgogne-subregions.geojson").write_text(
        json.dumps(subregions_geojson, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (args.output_dir / "bourgogne-grapes.enriched.json").write_text(
        json.dumps(grapes_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    client.save_cache()

    print(f"[write] {(args.output_dir / 'bourgogne-wines.enriched.json')}")
    print(f"[write] {(args.output_dir / 'bourgogne-producers.enriched.json')}")
    print(f"[write] {(args.output_dir / 'bourgogne-producers.geojson')}")
    print(f"[write] {(args.output_dir / 'bourgogne-producer-grape-points.geojson')}")
    print(f"[write] {(args.output_dir / 'bourgogne-subregions.enriched.json')}")
    print(f"[write] {(args.output_dir / 'bourgogne-subregions.geojson')}")
    print(f"[write] {(args.output_dir / 'bourgogne-grapes.enriched.json')}")
    print(f"[write] {args.cache}")

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich Bourgogne wines with map-ready geo data")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--min-delay", type=float, default=1.1, help="Min delay between Nominatim requests")
    parser.add_argument("--wikidata-min-delay", type=float, default=0.25, help="Min delay between Wikidata requests")
    parser.add_argument("--timeout", type=float, default=30.0)
    return parser.parse_args()


if __name__ == "__main__":
    try:
        raise SystemExit(run(parse_args()))
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(130)
