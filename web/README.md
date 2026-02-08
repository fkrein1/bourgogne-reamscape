# Bourgogne Dreamscape (Web)

Next.js app that renders an interactive Bourgogne wine map experience from precomputed JSON/GeoJSON files.

## What This Project Is

- Frontend: Next.js App Router (`src/app`)
- Main screen: one-page immersive map (`/`)
- Data source: generated scene file at `public/data/bourgogne-scene.json`
- Data generation script: `scripts/prepare-map-data.mjs` (reads `../scraping/data/*`)

This `web` app is the presentation layer. The scraping/enrichment pipeline lives in `/scraping`.

## Quick Start

### npm (default)

```bash
npm install
npm run prepare:data
npm run dev
```

### bun (also works)

```bash
bun install
bun run prepare:data
bun run dev
```

App runs at `http://localhost:3000`.

## Build and Sanity Checks

```bash
npm run lint
npm run build
```

## Data Contract

`prepare:data` reads:

- `../scraping/data/bourgogne-wines.enriched.json`
- `../scraping/data/bourgogne-producers.enriched.json`
- `../scraping/data/bourgogne-subregions.enriched.json`
- `../scraping/data/bourgogne-grapes.enriched.json`
- `../scraping/data/bourgogne-producer-grape-points.geojson`
- `../scraping/data/bourgogne-producers.geojson`
- `../scraping/data/bourgogne-subregions.geojson`
- `../scraping/data/bourgogne-subregions.polygons.geojson` (optional)
- `../scraping/data/producer-coordinate-overrides.json` (optional)

and outputs:

- `public/data/bourgogne-scene.json`

If upstream data changes, rerun `npm run prepare:data` before `dev`/`build`.

## Architecture Map

- Entry page: `src/app/page.tsx`
- App shell + global styles: `src/app/layout.tsx`, `src/app/globals.css`
- Main orchestration/state: `src/components/bourgogne-experience.tsx`
- Feature components: `src/features/bourgogne/components/*`
- Map layers/config: `src/features/bourgogne/lib/map-config.ts`
- Utilities/formatting/feature conversion: `src/features/bourgogne/lib/map-utils.ts`
- Shared types for scene payload: `src/features/bourgogne/types.ts`

## Current UX (High Level)

- Explore and Story modes
- Producer, grape, and price filtering
- Producer detail card + wine list
- Producer wine fanout around selected point
- Sub-region polygons + producer point layers + producer-grape overlay
- Hover popups and onboarding overlay

## Deploy Notes

- No runtime secrets or environment variables required today.
- Static build works with `npm run build`.
- Ensure `public/data/bourgogne-scene.json` exists and is current before deploy.

## Agent Handoff

Use this section to start quickly in a new session.

1. Verify baseline:
   - `npm run lint`
   - `npm run build`
2. If map data seems stale or missing:
   - run `npm run prepare:data`
3. Main file to inspect first for behavior changes:
   - `src/components/bourgogne-experience.tsx`
4. For visual/layer changes:
   - `src/app/globals.css`
   - `src/features/bourgogne/lib/map-config.ts`
5. For data-shape/runtime bugs:
   - `src/features/bourgogne/types.ts`
   - `scripts/prepare-map-data.mjs`

When making UI changes, keep Explore and Story mode behavior consistent and re-check mobile layout.
