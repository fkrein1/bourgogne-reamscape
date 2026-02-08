"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import { Controls } from "@/features/bourgogne/components/controls";
import { Hero } from "@/features/bourgogne/components/hero";
import { LoadingState } from "@/features/bourgogne/components/loading-state";
import { MapCanvas } from "@/features/bourgogne/components/map-canvas";
import { OnboardingOverlay } from "@/features/bourgogne/components/onboarding-overlay";
import { ProducerCard } from "@/features/bourgogne/components/producer-card";
import { StoryPanel } from "@/features/bourgogne/components/story-panel";
import { WineFanout } from "@/features/bourgogne/components/wine-fanout";
import {
  producerToId,
  toFeatureCollection,
} from "@/features/bourgogne/lib/map-utils";
import type {
  HoverInfo,
  Mode,
  PriceBucket,
  SceneData,
  SceneProducer,
  SceneSubRegion,
} from "@/features/bourgogne/types";

const STORY_CHAPTER_IDS = [
  "cote-de-nuits",
  "chablis",
  "beaune",
  "volnay",
  "puligny-montrachet",
  "gevrey-chambertin",
  "chassagne-montrachet",
  "vosne-romanee",
  "bourgogne",
  "macon",
];

export function BourgogneExperience() {
  const mapRef = useRef<MapRef | null>(null);
  const onboardingKey = "bourgogne_onboarding_seen_v1";

  const initialUrlState = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        mode: "explore" as Mode,
        selectedGrape: "All",
        selectedPriceBucket: "all" as PriceBucket,
        selectedProducerId: "",
        selectedSubRegionId: "",
      };
    }

    const params = new URLSearchParams(window.location.search);
    const qMode = params.get("m");
    const qGrape = params.get("g");
    const qPrice = params.get("p");
    const qProducer = params.get("pr");
    const qSubRegion = params.get("sr");

    const mode: Mode = qMode === "explore" || qMode === "story" ? qMode : "explore";
    const selectedGrape = qGrape || "All";
    const selectedPriceBucket: PriceBucket =
      qPrice === "all" ||
      qPrice === "entry" ||
      qPrice === "mid" ||
      qPrice === "premium" ||
      qPrice === "iconic"
        ? qPrice
        : "all";
    const selectedProducerId = qProducer || "";
    const selectedSubRegionId = qSubRegion || "";

    return {
      mode,
      selectedGrape,
      selectedPriceBucket,
      selectedProducerId,
      selectedSubRegionId,
    };
  }, []);

  const [scene, setScene] = useState<SceneData | null>(null);
  const [mode, setMode] = useState<Mode>(initialUrlState.mode);
  const [selectedGrape, setSelectedGrape] = useState<string>(
    initialUrlState.selectedGrape,
  );
  const [selectedPriceBucket, setSelectedPriceBucket] = useState<PriceBucket>(
    initialUrlState.selectedPriceBucket,
  );
  const [selectedProducerId, setSelectedProducerId] = useState<string>(
    initialUrlState.selectedProducerId,
  );
  const [selectedSubRegionId, setSelectedSubRegionId] = useState<string>(
    initialUrlState.selectedSubRegionId,
  );
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [storyIndex, setStoryIndex] = useState<number>(0);
  const [storyAutoplay, setStoryAutoplay] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem(onboardingKey);
  });
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [fanoutCenter, setFanoutCenter] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const response = await fetch("/data/bourgogne-scene.json");
      const payload = (await response.json()) as SceneData;
      setScene(payload);
    };
    loadData().catch(() => setScene(null));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const subRegionStory = useMemo(() => {
    if (!scene) return [];
    const eligible = [...scene.sub_regions]
      .filter((region) => region.id !== "unknown")
      .filter((region) => {
        const lat = region.location.lat;
        const lng = region.location.lng;
        return typeof lat === "number" && lat >= 46.1 && lat <= 48.4 && typeof lng === "number" && lng >= 2.95 && lng <= 6.1;
      });

    const byId = new Map(eligible.map((region) => [region.id, region]));
    const curated = STORY_CHAPTER_IDS.map((id) => byId.get(id)).filter((region): region is SceneSubRegion => Boolean(region));
    const curatedIds = new Set(curated.map((region) => region.id));
    const fallback = eligible
      .filter((region) => !curatedIds.has(region.id))
      .sort((a, b) => b.wine_count - a.wine_count)
      .slice(0, Math.max(0, 10 - curated.length));

    return [...curated, ...fallback].slice(0, 10);
  }, [scene]);

  const storyChapter = useMemo(() => {
    if (subRegionStory.length === 0) return null;
    return subRegionStory[storyIndex % subRegionStory.length];
  }, [storyIndex, subRegionStory]);

  const activeSubRegionId =
    mode === "story" && storyChapter ? storyChapter.id : selectedSubRegionId;

  const subRegionById = useMemo(() => {
    if (!scene) return new Map<string, SceneData["sub_regions"][number]>();
    return new Map(scene.sub_regions.map((region) => [region.id, region]));
  }, [scene]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (mode !== "explore") params.set("m", mode);
    if (selectedGrape !== "All") params.set("g", selectedGrape);
    if (selectedPriceBucket !== "all") params.set("p", selectedPriceBucket);
    if (selectedProducerId) params.set("pr", selectedProducerId);
    if (activeSubRegionId) params.set("sr", activeSubRegionId);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [mode, selectedGrape, selectedPriceBucket, selectedProducerId, activeSubRegionId]);

  useEffect(() => {
    if (mode !== "story" || !storyAutoplay || subRegionStory.length < 2) return;
    const timer = window.setInterval(() => {
      setStoryIndex((prev) => (prev + 1) % subRegionStory.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [mode, storyAutoplay, subRegionStory.length]);

  useEffect(() => {
    if (!scene || mode !== "story" || !storyChapter) return;
    const lat = storyChapter.location.lat;
    const lng = storyChapter.location.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return;

    const motionWave = storyIndex % 4;
    mapRef.current?.easeTo({
      center: [lng, lat],
      zoom: 9.35,
      pitch: 42 + motionWave * 4,
      bearing: -26 + motionWave * 12,
      duration: 2400,
      easing: (t) => 1 - (1 - t) ** 3,
    });
  }, [mode, scene, storyIndex, storyChapter]);

  const grapes = useMemo(() => {
    if (!scene) return ["All"];
    const set = new Set(scene.wines.map((wine) => wine.grape).filter(Boolean));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [scene]);

  const filteredWines = useMemo(() => {
    if (!scene) return [];
    return scene.wines.filter((wine) => {
      if (selectedGrape !== "All" && wine.grape !== selectedGrape) return false;
      if (
        selectedPriceBucket !== "all" &&
        wine.price_bucket !== selectedPriceBucket
      )
        return false;
      if (
        activeSubRegionId &&
        producerToId(wine.sub_region) !== activeSubRegionId
      )
        return false;
      return true;
    });
  }, [scene, selectedGrape, selectedPriceBucket, activeSubRegionId]);

  const filteredProducerIdSet = useMemo(() => {
    return new Set(filteredWines.map((w) => producerToId(w.producer)));
  }, [filteredWines]);

  const filteredProducers = useMemo(() => {
    if (!scene) return [];
    return scene.producers.filter((producer) =>
      filteredProducerIdSet.has(producer.id),
    );
  }, [scene, filteredProducerIdSet]);

  const selectedProducer: SceneProducer | null = useMemo(
    () =>
      filteredProducers.find(
        (producer) => producer.id === selectedProducerId,
      ) ?? null,
    [filteredProducers, selectedProducerId],
  );

  useEffect(() => {
    if (!selectedProducer?.location?.lat || !selectedProducer?.location?.lng)
      return;
    mapRef.current?.flyTo({
      center: [selectedProducer.location.lng, selectedProducer.location.lat],
      zoom: 9,
      speed: 0.8,
      curve: 1.25,
      essential: true,
    });
  }, [selectedProducer]);

  const producerFeatures = useMemo(() => {
    return toFeatureCollection(
      filteredProducers
        .filter((producer) => producer.location.lat && producer.location.lng)
        .map((producer) => ({
          lat: producer.location.lat as number,
          lng: producer.location.lng as number,
          properties: {
            id: producer.id,
            producer: producer.name,
            wine_count: producer.wine_count,
            location_source: producer.location.source,
            selected: selectedProducer?.id === producer.id ? 1 : 0,
            avg_price: producer.price.avg,
          },
        })),
    );
  }, [filteredProducers, selectedProducer]);

  const subRegionPolygonFeatures = useMemo<
    FeatureCollection<Geometry, Record<string, unknown>>
  >(() => {
    if (!scene?.geojson?.sub_region_polygons)
      return { type: "FeatureCollection", features: [] };
    const features = Array.isArray(scene.geojson.sub_region_polygons.features)
      ? scene.geojson.sub_region_polygons.features
      : [];
    const valid = features.filter(
      (
        feature,
      ): feature is {
        type: "Feature";
        geometry: Geometry;
        properties?: Record<string, unknown>;
      } =>
        !!feature &&
        typeof feature === "object" &&
        (feature as { type?: string }).type === "Feature" &&
        typeof (feature as { geometry?: unknown }).geometry === "object" &&
        !!(feature as { geometry?: unknown }).geometry,
    );
    return {
      type: "FeatureCollection",
      features: valid.map((feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const id = String(props.id ?? "");
        return {
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            ...props,
            selected: id === activeSubRegionId ? 1 : 0,
          },
        };
      }),
    };
  }, [scene, activeSubRegionId]);

  const producerGrapeFeatures = useMemo(() => {
    if (!scene) return toFeatureCollection([]);
    return toFeatureCollection(
      scene.producer_grape_points
        .filter((point) => point.lat && point.lng)
        .filter(
          (point) => selectedGrape === "All" || point.grape === selectedGrape,
        )
        .map((point) => ({
          lat: point.lat as number,
          lng: point.lng as number,
          properties: {
            producer: point.producer,
            grape: point.grape,
            wine_count: point.wine_count,
          },
        })),
    );
  }, [scene, selectedGrape]);

  const producerWines = useMemo(() => {
    if (!selectedProducer) return [];
    return filteredWines
      .filter((wine) => producerToId(wine.producer) === selectedProducer.id)
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  }, [filteredWines, selectedProducer]);

  const recenterFanout = (producer: SceneProducer | null) => {
    if (
      mode === "story" ||
      !producer?.location?.lat ||
      !producer?.location?.lng
    ) {
      setFanoutCenter(null);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const projected = map.project([
      producer.location.lng,
      producer.location.lat,
    ]);
    const x = Math.min(
      Math.max(projected.x, 120),
      Math.max(120, viewportSize.w - 120),
    );
    const y = Math.min(
      Math.max(projected.y, 120),
      Math.max(120, viewportSize.h - 120),
    );
    setFanoutCenter({ x, y });
  };

  const onMapHover = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setHoverInfo(null);
      return;
    }

    const pointerLat = event.lngLat.lat;
    const pointerLng = event.lngLat.lng;
    let lng = pointerLng;
    let lat = pointerLat;
    if (feature.geometry?.type === "Point") {
      [lng, lat] = feature.geometry.coordinates as [number, number];
    }
    const props = (feature.properties ?? {}) as Record<string, string | number>;
    const readNumericProp = (value: string | number | undefined) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    if (feature.layer.id === "subregion-polygon-fill-layer") {
      const wineCount = readNumericProp(props.wine_count);
      const producerCount = readNumericProp(props.producer_count);
      setHoverInfo({
        lat,
        lng,
        title: String(props.sub_region ?? props.name ?? "Sub-region"),
        subtitle:
          wineCount !== null && producerCount !== null
            ? `${wineCount} wines • ${producerCount} producers`
            : "Region stats unavailable",
      });
      return;
    }

    if (
      feature.layer.id === "producer-layer" ||
      feature.layer.id === "producer-glow-layer" ||
      feature.layer.id === "producer-selected-layer"
    ) {
      setHoverInfo({
        lat,
        lng,
        title: String(props.producer ?? "Producer"),
        subtitle: `${props.wine_count ?? 0} wines`,
      });
      return;
    }

    if (feature.layer.id === "producer-grape-layer") {
      setHoverInfo({
        lat,
        lng,
        title: String(props.producer ?? "Producer"),
        subtitle: `${String(props.grape ?? "") || "Grape not listed"} • ${props.wine_count ?? 0} labels`,
      });
      return;
    }

    setHoverInfo(null);
  };

  const onMapClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setSelectedProducerId("");
      if (mode !== "story") setSelectedSubRegionId("");
      setFanoutCenter(null);
      return;
    }
    const props = (feature.properties ?? {}) as Record<string, string>;
    if (feature.layer.id === "subregion-polygon-fill-layer") {
      if (props.id) {
        setSelectedSubRegionId(props.id);
        const region = subRegionById.get(props.id);
        if (region?.location?.lat && region.location.lng) {
          mapRef.current?.flyTo({
            center: [region.location.lng, region.location.lat],
            zoom: 9,
            speed: 0.8,
            curve: 1.2,
            essential: true,
          });
        }
      }
      setSelectedProducerId("");
      setFanoutCenter(null);
      return;
    }
    if (props.id) {
      setSelectedProducerId(props.id);
      const producer =
        filteredProducers.find((item) => item.id === props.id) ?? null;
      recenterFanout(producer);
      return;
    }
    if (props.producer) {
      const producerId = producerToId(props.producer);
      setSelectedProducerId(producerId);
      const producer =
        filteredProducers.find((item) => item.id === producerId) ?? null;
      recenterFanout(producer);
    }
  };

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bourgogne_onboarding_seen_v1", "1");
    }
  };

  if (!scene) return <LoadingState />;

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === "story") {
      setSelectedProducerId("");
      setFanoutCenter(null);
      return;
    }
    if (nextMode === "explore") setSelectedSubRegionId("");
    mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    recenterFanout(selectedProducer);
  };

  return (
    <main className="bourgogne-shell">
      <MapCanvas
        mapRef={mapRef}
        subRegionPolygonFeatures={subRegionPolygonFeatures}
        producerFeatures={producerFeatures}
        producerGrapeFeatures={producerGrapeFeatures}
        hoverInfo={hoverInfo}
        onMapHover={onMapHover}
        onMapLeave={() => setHoverInfo(null)}
        onMapClick={onMapClick}
        onMapMove={() => recenterFanout(selectedProducer)}
      />

      <div className="bourgogne-atmosphere" />
      <div className="bourgogne-vignette" />

      <div className="bourgogne-top-hud">
        <Hero
          counts={{
            wines: scene.counts.wines,
            producers: scene.counts.producers,
            grapes: scene.counts.grapes,
          }}
        />

        <Controls
          mode={mode}
          onModeChange={handleModeChange}
          grapes={grapes}
          selectedGrape={selectedGrape}
          onGrapeChange={setSelectedGrape}
          selectedPriceBucket={selectedPriceBucket}
          onPriceBucketChange={setSelectedPriceBucket}
        />
      </div>

      {mode === "story" ? (
        <StoryPanel
          chapters={subRegionStory}
          storyIndex={storyIndex}
          storyAutoplay={storyAutoplay}
          onPrev={() =>
            setStoryIndex((prev) =>
              subRegionStory.length === 0
                ? prev
                : (prev - 1 + subRegionStory.length) % subRegionStory.length,
            )
          }
          onToggleAutoplay={() => setStoryAutoplay((prev) => !prev)}
          onNext={() =>
            setStoryIndex((prev) =>
              subRegionStory.length === 0
                ? prev
                : (prev + 1) % subRegionStory.length,
            )
          }
          onSelectChapter={setStoryIndex}
        />
      ) : null}

      {mode === "explore" ? (
        <ProducerCard producer={selectedProducer} wines={producerWines} />
      ) : null}

      <WineFanout center={fanoutCenter} wines={producerWines} />

      <OnboardingOverlay
        open={showOnboarding}
        onClose={handleCloseOnboarding}
      />
    </main>
  );
}
