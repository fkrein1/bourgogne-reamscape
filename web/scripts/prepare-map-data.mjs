#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const sourceDirCandidates = [
  path.join(root, "scraping", "data"),
  path.join(root, "data"),
];
const sourceDir =
  sourceDirCandidates.find((candidate) => fs.existsSync(candidate)) ??
  sourceDirCandidates[0];
const outDir = path.join(process.cwd(), "public", "data");

const files = {
  wines: "bourgogne-wines.enriched.json",
  producers: "bourgogne-producers.enriched.json",
  subRegions: "bourgogne-subregions.enriched.json",
  grapes: "bourgogne-grapes.enriched.json",
  producerGrapeGeo: "bourgogne-producer-grape-points.geojson",
  producersGeo: "bourgogne-producers.geojson",
  subRegionsGeo: "bourgogne-subregions.geojson",
  subRegionPolygonsGeo: "bourgogne-subregions.polygons.geojson",
  producerOverrides: "producer-coordinate-overrides.json",
};

const BOURGOGNE_BOUNDS = {
  minLat: 46.1,
  maxLat: 48.4,
  minLng: 2.95,
  maxLng: 6.1,
};

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readOptionalJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath);
}

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inBourgogneBounds(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= BOURGOGNE_BOUNDS.minLat &&
    lat <= BOURGOGNE_BOUNDS.maxLat &&
    lng >= BOURGOGNE_BOUNDS.minLng &&
    lng <= BOURGOGNE_BOUNDS.maxLng
  );
}

function centroid(points) {
  if (!points.length) return null;
  const totals = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng,
    }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: totals.lat / points.length,
    lng: totals.lng / points.length,
  };
}

function toId(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSceneData() {
  const winesRaw = readJson(path.join(sourceDir, files.wines));
  const producersRaw = readJson(path.join(sourceDir, files.producers));
  const subRegionsRaw = readJson(path.join(sourceDir, files.subRegions));
  const grapesRaw = readJson(path.join(sourceDir, files.grapes));
  const producerGrapeGeoRaw = readJson(path.join(sourceDir, files.producerGrapeGeo));
  const producersGeoRaw = readJson(path.join(sourceDir, files.producersGeo));
  const subRegionsGeoRaw = readJson(path.join(sourceDir, files.subRegionsGeo));
  const subRegionPolygonsGeoRaw = readOptionalJson(path.join(sourceDir, files.subRegionPolygonsGeo), {
    type: "FeatureCollection",
    features: [],
  });
  const producerOverridesRaw = readOptionalJson(path.join(sourceDir, files.producerOverrides), {});

  const wines = (winesRaw.items || []).map((wine) => ({
    id: wine.id,
    slug: wine.slug,
    title: wine.name_product || wine.title_listing,
    title_listing: wine.title_listing,
    url: wine.url,
    image: wine.image,
    producer: wine.producer,
    sub_region: wine.sub_region,
    grape: wine.grape,
    bottle_size: wine.bottle_size,
    stock: safeNumber(wine.stock),
    description: wine.description,
    style_keywords: wine?.derived?.style_keywords || [],
    price_bucket: wine?.derived?.price_bucket || "unknown",
    price: safeNumber(wine?.price_brl?.listing_sale_price) || safeNumber(wine?.price_brl?.product_ldjson_price),
    map: {
      lat: safeNumber(wine?.map?.lat),
      lng: safeNumber(wine?.map?.lng),
      source: wine?.map?.source || "unknown",
      confidence: safeNumber(wine?.map?.confidence),
    },
  }));

  const wineSubRegionPoints = new Map();
  for (const wine of wines) {
    const subRegionId = toId(wine.sub_region);
    if (!subRegionId) continue;
    if (!inBourgogneBounds(wine.map.lat, wine.map.lng)) continue;
    const list = wineSubRegionPoints.get(subRegionId) || [];
    list.push({ lat: wine.map.lat, lng: wine.map.lng });
    wineSubRegionPoints.set(subRegionId, list);
  }

  const subRegionFallbackCentroids = new Map();
  for (const [subRegionId, points] of wineSubRegionPoints.entries()) {
    const c = centroid(points);
    if (c) subRegionFallbackCentroids.set(subRegionId, c);
  }

  const producers = (producersRaw.items || []).map((producer) => {
    const override = producerOverridesRaw?.[producer.producer];
    const overrideLat = safeNumber(override?.lat);
    const overrideLng = safeNumber(override?.lng);
    const hasOverride = overrideLat !== null && overrideLng !== null;

    return {
      id: toId(producer.producer),
      name: producer.producer,
      wine_count: producer.wine_count,
      primary_sub_region: producer.primary_sub_region,
      grapes: producer.grapes || {},
      sub_regions: producer.sub_regions || {},
      price: producer.price_brl || {},
      location: {
        lat: hasOverride ? overrideLat : safeNumber(producer?.location?.lat),
        lng: hasOverride ? overrideLng : safeNumber(producer?.location?.lng),
        source: hasOverride ? "manual_override" : producer?.location?.source || "unknown",
        confidence: hasOverride ? 0.95 : safeNumber(producer?.location?.confidence),
        label: hasOverride ? override?.label || producer.producer : producer?.location?.display_name || "",
      },
      override_note: hasOverride ? override?.note || "" : "",
    };
  });

  const sub_regions = (subRegionsRaw.items || []).map((row) => {
    const id = toId(row.sub_region);
    let lat = safeNumber(row?.location?.lat);
    let lng = safeNumber(row?.location?.lng);
    let source = row?.location?.source || "unknown";
    let confidence = safeNumber(row?.location?.confidence);

    if (!inBourgogneBounds(lat, lng)) {
      const fallback = subRegionFallbackCentroids.get(id);
      if (fallback) {
        lat = fallback.lat;
        lng = fallback.lng;
        source = source === "unknown" ? "wine_centroid_fallback" : `${source}_wine_centroid_fallback`;
        confidence = confidence === null ? 0.72 : Math.max(confidence, 0.72);
      }
    }

    if (id === "bourgogne" && !inBourgogneBounds(lat, lng)) {
      lat = 47.16;
      lng = 4.85;
      source = `${source}_manual_bourgogne_fallback`;
      confidence = confidence === null ? 0.65 : Math.max(confidence, 0.65);
    }

    return {
      id,
      name: row.sub_region,
      wine_count: row.wine_count,
      producer_count: row.producer_count,
      grapes: row.grapes || {},
      price: row.price_brl || {},
      location: {
        lat,
        lng,
        source,
        confidence,
      },
    };
  });

  const grapes = (grapesRaw.items || []).map((grape) => ({
    id: toId(grape.grape),
    name: grape.grape,
    wine_count: grape.wine_count,
    producer_count: grape.producer_count,
    dominant_style_keywords: grape.dominant_style_keywords || [],
    centroid: {
      lat: safeNumber(grape?.centroid?.lat),
      lng: safeNumber(grape?.centroid?.lng),
    },
    price: grape.price_brl || {},
  }));

  const producer_grape_points = (producerGrapeGeoRaw.features || []).map((feature) => {
    const coords = feature?.geometry?.coordinates || [];
    const props = feature?.properties || {};
    return {
      lat: safeNumber(coords[1]),
      lng: safeNumber(coords[0]),
      producer: props.producer,
      grape: props.grape,
      wine_count: props.wine_count,
      avg_price_brl: safeNumber(props.avg_price_brl),
      dominant_style_keywords: props.dominant_style_keywords || [],
    };
  });

  const subRegionById = new Map(sub_regions.map((item) => [item.id, item]));
  const subRegionPolygons = {
    type: "FeatureCollection",
    features: (subRegionPolygonsGeoRaw.features || []).map((feature) => {
      const props = feature?.properties || {};
      const regionId = toId(props.id || props.sub_region);
      const region = subRegionById.get(regionId);
      return {
        ...feature,
        properties: {
          ...props,
          id: regionId,
          sub_region: region?.name || props.sub_region || "",
          wine_count: region?.wine_count ?? null,
          producer_count: region?.producer_count ?? null,
          avg_price: region?.price?.avg ?? null,
          source: "nominatim_polygon",
        },
      };
    }),
  };

  const producersWithOverrides = producers.filter((producer) => producer.location.source === "manual_override").length;
  const polygonCount = subRegionPolygons.features.length;

  return {
    generated_at_unix: Math.floor(Date.now() / 1000),
    counts: {
      wines: wines.length,
      producers: producers.length,
      sub_regions: sub_regions.length,
      grapes: grapes.length,
      producer_grape_points: producer_grape_points.length,
      sub_region_polygons: polygonCount,
      producers_with_overrides: producersWithOverrides,
    },
    wines,
    producers,
    sub_regions,
    grapes,
    producer_grape_points,
    geojson: {
      producers: producersGeoRaw,
      sub_regions: subRegionsGeoRaw,
      sub_region_polygons: subRegionPolygons,
      producer_grape_points: producerGrapeGeoRaw,
    },
  };
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const sceneData = buildSceneData();
  fs.writeFileSync(path.join(outDir, "bourgogne-scene.json"), JSON.stringify(sceneData, null, 2), "utf8");
  console.log(`Wrote ${path.join(outDir, "bourgogne-scene.json")}`);
}

main();
