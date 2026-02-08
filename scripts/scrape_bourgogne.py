#!/usr/bin/env python3
"""Scrape Bourgogne wines from mistral.com.br into JSON files.

This script:
1) Paginates the Bourgogne listing endpoint via `live_sync[page]`.
2) Collects listing data for each wine.
3) Visits each product page and extracts Product JSON-LD.
4) Writes a normalized array plus an optional raw payload file.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LISTING_BASE_URL = "https://www.mistral.com.br/regiao/bourgogne"
DEFAULT_OUTPUT = Path("data/bourgogne-wines.json")
DEFAULT_RAW_OUTPUT = Path("data/bourgogne-wines.raw.json")

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
}

PRODUCT_JSON_LD_RE = re.compile(
    r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    flags=re.IGNORECASE | re.DOTALL,
)


@dataclass
class ScrapeConfig:
    timeout: float
    retries: int
    sleep: float
    workers: int
    max_pages: int | None
    max_wines: int | None


def fetch_text(url: str, timeout: float, retries: int) -> str:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = Request(url, headers=DEFAULT_HEADERS)
            with urlopen(req, timeout=timeout) as response:
                data = response.read()
            return data.decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt == retries:
                break
            time.sleep(min(2 ** attempt, 5))
    raise RuntimeError(f"Failed to fetch URL after retries: {url}\n{last_error}")


def listing_url(page: int) -> str:
    params = {
        "live_sync[range][sale_price]": "0:1000000",
        "live_sync[page]": str(page),
    }
    return f"{LISTING_BASE_URL}?{urlencode(params)}"


def extract_listing_payload(html: str) -> dict[str, Any]:
    marker = 'window[Symbol.for("InstantSearchInitialResults")] = '
    idx = html.find(marker)
    if idx == -1:
        raise ValueError("Could not find InstantSearchInitialResults marker")

    start = idx + len(marker)
    end = html.find("</script>", start)
    if end == -1:
        raise ValueError("Could not find script end for listing payload")

    payload_text = html[start:end].strip()
    if payload_text.endswith(";"):
        payload_text = payload_text[:-1]

    return json.loads(payload_text)


def parse_json(text: str) -> Any | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def iter_nodes(obj: Any):
    if isinstance(obj, list):
        for item in obj:
            yield from iter_nodes(item)
        return
    if isinstance(obj, dict):
        yield obj


def is_product_node(node: dict[str, Any]) -> bool:
    node_type = node.get("@type")
    if isinstance(node_type, str):
        return node_type.lower() == "product"
    if isinstance(node_type, list):
        return any(isinstance(x, str) and x.lower() == "product" for x in node_type)
    return False


def extract_product_json_ld(html: str) -> dict[str, Any] | None:
    for match in PRODUCT_JSON_LD_RE.finditer(html):
        raw = match.group(1).strip()
        candidate = parse_json(raw)
        if candidate is None:
            continue
        for node in iter_nodes(candidate):
            if is_product_node(node):
                return node
    return None


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def normalize_listing_hit(hit: dict[str, Any], listing_page_url: str) -> dict[str, Any]:
    return {
        "id": hit.get("id"),
        "slug": hit.get("slug"),
        "url": hit.get("link"),
        "title_listing": hit.get("title"),
        "producer": hit.get("title_producers"),
        "country": hit.get("title_country"),
        "region": hit.get("region"),
        "sub_region": hit.get("sub_region"),
        "grape": hit.get("grape"),
        "bottle_size": hit.get("bottle_size"),
        "description_card": hit.get("description_card"),
        "description_listing": hit.get("description"),
        "stock": hit.get("stock"),
        "sale_price_listing": to_float(hit.get("sale_price")),
        "listing_page": listing_page_url,
    }


def normalize_product_data(node: dict[str, Any]) -> dict[str, Any]:
    brand = node.get("brand")
    if isinstance(brand, dict):
        brand_name = brand.get("name")
    else:
        brand_name = brand

    offers = node.get("offers")
    if isinstance(offers, list) and offers:
        offers = offers[0]
    if not isinstance(offers, dict):
        offers = {}

    return {
        "name_product": node.get("name"),
        "description": node.get("description"),
        "image": node.get("image"),
        "brand": brand_name,
        "country_of_origin": node.get("countryOfOrigin"),
        "price_product": to_float(offers.get("price")),
        "currency": offers.get("priceCurrency"),
        "availability": offers.get("availability"),
    }


def merge_wine_data(listing: dict[str, Any], product: dict[str, Any] | None) -> dict[str, Any]:
    product = product or {}
    merged = {
        "id": listing.get("id"),
        "slug": listing.get("slug"),
        "url": listing.get("url"),
        "title_listing": listing.get("title_listing"),
        "name_product": product.get("name_product"),
        "producer": listing.get("producer") or product.get("brand"),
        "country": listing.get("country"),
        "country_of_origin": product.get("country_of_origin"),
        "region": listing.get("region"),
        "sub_region": listing.get("sub_region"),
        "grape": listing.get("grape"),
        "bottle_size": listing.get("bottle_size"),
        "description_card": listing.get("description_card"),
        "description": product.get("description") or listing.get("description_listing"),
        "stock": listing.get("stock"),
        "price_brl": {
            "listing_sale_price": listing.get("sale_price_listing"),
            "product_ldjson_price": product.get("price_product"),
            "currency": product.get("currency") or "BRL",
        },
        "availability": product.get("availability"),
        "image": product.get("image"),
        "source": {
            "listing_page": listing.get("listing_page"),
            "product_page": listing.get("url"),
        },
    }
    return merged


def collect_listing_hits(config: ScrapeConfig) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    first_url = listing_url(1)
    first_html = fetch_text(first_url, timeout=config.timeout, retries=config.retries)
    first_payload = extract_listing_payload(first_html)

    root = first_payload.get("live_sync", {})
    state = root.get("state", {})
    results = root.get("results", [{}])
    first_result = results[0] if results else {}

    nb_hits = int(first_result.get("nbHits", 0))
    hits_per_page = int(state.get("hitsPerPage") or first_result.get("hitsPerPage") or 24)
    total_pages = max(1, math.ceil(nb_hits / hits_per_page))
    if config.max_pages:
        total_pages = min(total_pages, config.max_pages)

    unique: dict[int, dict[str, Any]] = {}

    for page in range(1, total_pages + 1):
        page_url = listing_url(page)
        html = first_html if page == 1 else fetch_text(page_url, timeout=config.timeout, retries=config.retries)
        payload = first_payload if page == 1 else extract_listing_payload(html)

        hits = payload.get("live_sync", {}).get("results", [{}])[0].get("hits", [])
        for hit in hits:
            wine_id = hit.get("id")
            if not isinstance(wine_id, int):
                continue
            if wine_id not in unique:
                unique[wine_id] = normalize_listing_hit(hit, page_url)
                if config.max_wines and len(unique) >= config.max_wines:
                    break

        print(f"[listing] page={page}/{total_pages} collected={len(unique)}")

        if config.max_wines and len(unique) >= config.max_wines:
            break

        if config.sleep > 0:
            time.sleep(config.sleep)

    meta = {
        "nb_hits": nb_hits,
        "hits_per_page": hits_per_page,
        "total_pages": total_pages,
        "collected_wines": len(unique),
    }
    return list(unique.values()), meta


def fetch_product_and_merge(listing_item: dict[str, Any], config: ScrapeConfig) -> tuple[dict[str, Any], dict[str, Any]]:
    product_url = listing_item.get("url")
    if not product_url:
        merged = merge_wine_data(listing_item, None)
        raw = {"listing": listing_item, "product_json_ld": None, "error": "missing product url"}
        return merged, raw

    try:
        html = fetch_text(product_url, timeout=config.timeout, retries=config.retries)
        node = extract_product_json_ld(html)
        product_norm = normalize_product_data(node) if node else None
        merged = merge_wine_data(listing_item, product_norm)
        raw = {"listing": listing_item, "product_json_ld": node, "error": None}
        return merged, raw
    except Exception as exc:  # noqa: BLE001
        merged = merge_wine_data(listing_item, None)
        raw = {"listing": listing_item, "product_json_ld": None, "error": str(exc)}
        return merged, raw


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Bourgogne wines from mistral.com.br")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Normalized output JSON file")
    parser.add_argument(
        "--raw-output",
        type=Path,
        default=DEFAULT_RAW_OUTPUT,
        help="Raw output JSON file (listing + product JSON-LD)",
    )
    parser.add_argument("--workers", type=int, default=8, help="Concurrent workers for product pages")
    parser.add_argument("--timeout", type=float, default=30, help="HTTP timeout (seconds)")
    parser.add_argument("--retries", type=int, default=3, help="Retries per request")
    parser.add_argument("--sleep", type=float, default=0.1, help="Sleep between listing page requests")
    parser.add_argument("--max-pages", type=int, default=None, help="Limit listing pages (for testing)")
    parser.add_argument("--max-wines", type=int, default=None, help="Limit number of wines (for testing)")
    parser.add_argument(
        "--skip-raw",
        action="store_true",
        help="Do not write the raw output file",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = ScrapeConfig(
        timeout=args.timeout,
        retries=args.retries,
        sleep=args.sleep,
        workers=max(1, args.workers),
        max_pages=args.max_pages,
        max_wines=args.max_wines,
    )

    listing_items, meta = collect_listing_hits(config)
    print(
        "[listing] finished ",
        f"nb_hits={meta['nb_hits']} hits_per_page={meta['hits_per_page']} ",
        f"total_pages={meta['total_pages']} collected={meta['collected_wines']}",
        sep="",
    )

    merged_results: list[dict[str, Any]] = []
    raw_results: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=config.workers) as executor:
        futures = [executor.submit(fetch_product_and_merge, item, config) for item in listing_items]
        total = len(futures)
        done = 0
        for fut in as_completed(futures):
            merged, raw = fut.result()
            merged_results.append(merged)
            raw_results.append(raw)
            done += 1
            if done % 25 == 0 or done == total:
                print(f"[product] fetched={done}/{total}")

    merged_results.sort(key=lambda x: (x.get("id") is None, x.get("id")))
    raw_results.sort(key=lambda x: (x.get("listing", {}).get("id") is None, x.get("listing", {}).get("id")))

    summary = {
        "generated_at_unix": int(time.time()),
        "source": LISTING_BASE_URL,
        "meta": meta,
        "count": len(merged_results),
        "items": merged_results,
    }

    write_json(args.output, summary)
    print(f"[write] normalized output: {args.output}")

    if not args.skip_raw:
        raw_summary = {
            "generated_at_unix": int(time.time()),
            "source": LISTING_BASE_URL,
            "meta": meta,
            "count": len(raw_results),
            "items": raw_results,
        }
        write_json(args.raw_output, raw_summary)
        print(f"[write] raw output: {args.raw_output}")

    errors = sum(1 for row in raw_results if row.get("error"))
    print(f"[done] wines={len(merged_results)} product_errors={errors}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        raise SystemExit(130)
