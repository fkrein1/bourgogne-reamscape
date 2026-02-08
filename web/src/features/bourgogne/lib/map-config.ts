import type { LayerProps } from "react-map-gl/maplibre";

export const BOURGOGNE_BOUNDS: [[number, number], [number, number]] = [
  [2.95, 46.1],
  [6.1, 48.4],
];

export const darkRasterStyle = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    dark: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "dark-base",
      type: "raster",
      source: "dark",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export const subRegionLayer: LayerProps = {
  id: "subregion-layer",
  type: "circle",
  paint: {
    "circle-color": [
      "interpolate",
      ["linear"],
      ["get", "wine_count"],
      1,
      "#44d7b6",
      12,
      "#e2ff6f",
      25,
      "#ffb454",
      50,
      "#ff6a4f",
    ],
    "circle-opacity": 0.36,
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "wine_count"],
      2,
      5,
      20,
      16,
      60,
      26,
    ],
    "circle-blur": 0.35,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#f9ffd9",
    "circle-stroke-opacity": 0.38,
  },
};

export const subRegionPolygonFillLayer: LayerProps = {
  id: "subregion-polygon-fill-layer",
  type: "fill",
  paint: {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "wine_count"], 0],
      1,
      "#3ec8ab",
      12,
      "#b4ea6d",
      25,
      "#ffbf5f",
      50,
      "#ff7864",
    ],
    "fill-opacity": [
      "case",
      ["==", ["coalesce", ["get", "selected"], 0], 1],
      0.35,
      0.17,
    ],
  },
};

export const subRegionPolygonOutlineLayer: LayerProps = {
  id: "subregion-polygon-outline-layer",
  type: "line",
  paint: {
    "line-color": [
      "case",
      ["==", ["coalesce", ["get", "selected"], 0], 1],
      "#f6ffe2",
      "#d7f7d5",
    ],
    "line-width": [
      "case",
      ["==", ["coalesce", ["get", "selected"], 0], 1],
      2.1,
      1.1,
    ],
    "line-opacity": 0.65,
  },
};

export const producerLayer: LayerProps = {
  id: "producer-layer",
  type: "circle",
  paint: {
    "circle-color": [
      "match",
      ["get", "location_source"],
      "producer_geocode",
      "#7dd3fc",
      "producer_wikidata",
      "#fef08a",
      "producer_sub_region_fallback",
      "#fda4af",
      "#c4b5fd",
    ],
    "circle-opacity": 0.95,
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "wine_count"],
      1,
      5,
      15,
      11,
      40,
      18,
      80,
      24,
    ],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#0f172a",
  },
};

export const producerGlowLayer: LayerProps = {
  id: "producer-glow-layer",
  type: "circle",
  paint: {
    "circle-color": "#b6ffcb",
    "circle-opacity": 0.16,
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "wine_count"],
      1,
      9,
      20,
      22,
      60,
      30,
    ],
    "circle-blur": 0.8,
  },
};

export const producerGrapeLayer: LayerProps = {
  id: "producer-grape-layer",
  type: "circle",
  paint: {
    "circle-color": [
      "match",
      ["get", "grape"],
      "Pinot Noir",
      "#f87171",
      "Chardonnay",
      "#fde047",
      "Aligoté",
      "#86efac",
      "Gamay",
      "#fb7185",
      "#a5b4fc",
    ],
    "circle-opacity": 0.6,
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "wine_count"],
      1,
      3,
      10,
      6,
      40,
      10,
    ],
    "circle-stroke-width": 1,
    "circle-stroke-color": "#09090b",
  },
};

export const selectedProducerLayer: LayerProps = {
  id: "producer-selected-layer",
  type: "circle",
  paint: {
    "circle-color": "#f8fafc",
    "circle-opacity": 0.15,
    "circle-radius": 26,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#f8fafc",
    "circle-stroke-opacity": 0.95,
  },
  filter: ["==", ["get", "selected"], 1],
};
