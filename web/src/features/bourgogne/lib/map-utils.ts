import type { Feature, FeatureCollection, Geometry, Point } from "geojson";

export type MapPointFeature = Feature<Point, Record<string, unknown>>;
export type MapFeatureCollection = FeatureCollection<Point, Record<string, unknown>>;
export type GenericFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>;

export function money(v?: number | null) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
}

export function producerToId(name?: string | null) {
  if (typeof name !== "string") return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function toFeatureCollection(
  points: Array<{ lat: number; lng: number; properties: Record<string, unknown> }>,
): MapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map<MapPointFeature>((point) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [point.lng, point.lat] as [number, number] },
      properties: point.properties,
    })),
  };
}
