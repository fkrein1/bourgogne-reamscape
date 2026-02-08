export type Mode = "explore" | "story";
export type PriceBucket = "all" | "entry" | "mid" | "premium" | "iconic";

export type SceneWine = {
  id: number;
  slug: string;
  title: string;
  title_listing: string;
  url: string;
  image: string;
  producer: string;
  sub_region: string;
  grape: string;
  bottle_size: string;
  stock: number | null;
  description: string;
  style_keywords: string[];
  price_bucket: "entry" | "mid" | "premium" | "iconic" | "unknown";
  price: number | null;
  map: {
    lat: number | null;
    lng: number | null;
    source: string;
    confidence: number | null;
  };
};

export type SceneProducer = {
  id: string;
  name: string;
  wine_count: number;
  primary_sub_region: string;
  grapes: Record<string, number>;
  price: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  location: {
    lat: number | null;
    lng: number | null;
    source: string;
    confidence: number | null;
    label: string;
  };
};

export type SceneSubRegion = {
  id: string;
  name: string;
  wine_count: number;
  producer_count: number;
  grapes: Record<string, number>;
  price: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  location: {
    lat: number | null;
    lng: number | null;
    source: string;
    confidence: number | null;
  };
};

export type SceneProducerGrapePoint = {
  lat: number | null;
  lng: number | null;
  producer: string;
  grape: string;
  wine_count: number;
  avg_price_brl: number | null;
  dominant_style_keywords: string[];
};

export type SceneData = {
  generated_at_unix: number;
  counts: {
    wines: number;
    producers: number;
    sub_regions: number;
    grapes: number;
    producer_grape_points: number;
    sub_region_polygons?: number;
    producers_with_overrides?: number;
  };
  wines: SceneWine[];
  producers: SceneProducer[];
  sub_regions: SceneSubRegion[];
  producer_grape_points: SceneProducerGrapePoint[];
  geojson?: {
    sub_region_polygons?: {
      type: "FeatureCollection";
      features: Array<Record<string, unknown>>;
    };
  };
};

export type HoverInfo = {
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
};
