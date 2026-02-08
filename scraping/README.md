# Wine Bourgogne Scraping + Data Pipeline

Run these commands from `scraping/`.

```bash
cd scraping
```

## 1) Scrape Wines

```bash
./scripts/scrape_bourgogne.py
```

Outputs:
- `data/bourgogne-wines.json` (normalized wine array)
- `data/bourgogne-wines.raw.json` (listing + product raw payloads)

## 2) Enrich For Map Visualization

```bash
./scripts/enrich_bourgogne_geo.py
```

Outputs:
- `data/bourgogne-wines.enriched.json`
  - Wine-level map coordinates, confidence, style keywords, price buckets
- `data/bourgogne-producers.enriched.json`
  - Producer stats + location + grapes + sub-region breakdown
- `data/bourgogne-producers.geojson`
  - Producer point layer for map rendering
- `data/bourgogne-producer-grape-points.geojson`
  - Producer+grape point layer (one point per producer/grape combination)
- `data/bourgogne-subregions.enriched.json`
  - Sub-region stats + map point summaries
- `data/bourgogne-subregions.geojson`
  - Sub-region point layer
- `data/bourgogne-grapes.enriched.json`
  - Grape-level counts, centroids, dominant style keywords
- `data/geocode-cache.json`
  - Cached geocoder responses (Nominatim + Wikidata)

## 3) Fetch Sub-region Polygons

```bash
./scripts/fetch_subregion_polygons.py
```

Outputs:
- `data/bourgogne-subregions.polygons.geojson`
  - Polygon boundaries (when available) for map fill/outline layers
- `data/bourgogne-subregions.polygons.report.json`
  - Match/miss report and source metadata
- `data/subregion-polygons-cache.json`
  - Cached polygon geocoder responses

## 4) Optional Producer Coordinate Overrides

Use:
- `data/producer-coordinate-overrides.json`

to pin exact producer locations. These overrides are applied by the web `prepare:data` step and marked as `manual_override`.

## Geo Confidence Model

- `sub_region` source: strongest wine-level mapping for this dataset
- `producer_geocode` / `producer_wikidata`: direct producer point when found
- `producer_sub_region_fallback`: producer set to its dominant sub-region point
- `region` fallback: Bourgogne center fallback

Use `map.confidence` and `location.confidence` to style certainty (opacity/blur/radius).

## Web Integration

The web app (`../web`) reads these generated files from:

- `../scraping/data/*`

and compiles them into:

- `../web/public/data/bourgogne-scene.json`

via:

```bash
cd ../web
npm run prepare:data
```
