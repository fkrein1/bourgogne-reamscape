import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type ViewStateChangeEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { RefObject } from "react";
import type { HoverInfo } from "@/features/bourgogne/types";
import {
  BOURGOGNE_BOUNDS,
  darkRasterStyle,
  producerGlowLayer,
  producerGrapeLayer,
  producerLayer,
  selectedProducerLayer,
  subRegionPolygonFillLayer,
  subRegionPolygonOutlineLayer,
} from "@/features/bourgogne/lib/map-config";
import type { GenericFeatureCollection, MapFeatureCollection } from "@/features/bourgogne/lib/map-utils";

type Props = {
  mapRef: RefObject<MapRef | null>;
  subRegionPolygonFeatures: GenericFeatureCollection;
  producerFeatures: MapFeatureCollection;
  producerGrapeFeatures: MapFeatureCollection;
  hoverInfo: HoverInfo | null;
  onMapHover: (event: MapLayerMouseEvent) => void;
  onMapLeave: () => void;
  onMapClick: (event: MapLayerMouseEvent) => void;
  onMapMove: (event: ViewStateChangeEvent) => void;
};

export function MapCanvas({
  mapRef,
  subRegionPolygonFeatures,
  producerFeatures,
  producerGrapeFeatures,
  hoverInfo,
  onMapHover,
  onMapLeave,
  onMapClick,
  onMapMove,
}: Props) {
  return (
    <Map
      ref={mapRef}
      mapLib={import("maplibre-gl")}
      initialViewState={{ latitude: 47.16, longitude: 4.85, zoom: 7.2 }}
      maxBounds={BOURGOGNE_BOUNDS}
      minZoom={6.2}
      maxZoom={13}
      mapStyle={darkRasterStyle as never}
      interactiveLayerIds={[
        "subregion-polygon-fill-layer",
        "producer-layer",
        "producer-glow-layer",
        "producer-selected-layer",
        "producer-grape-layer",
      ]}
      onMouseMove={onMapHover}
      onMouseLeave={onMapLeave}
      onClick={onMapClick}
      onMove={onMapMove}
    >
      <Source id="subregion-polygons-source" type="geojson" data={subRegionPolygonFeatures}>
        <Layer {...subRegionPolygonFillLayer} />
        <Layer {...subRegionPolygonOutlineLayer} />
      </Source>

      <Source id="producer-glow-source" type="geojson" data={producerFeatures}>
        <Layer {...producerGlowLayer} />
        <Layer {...producerLayer} />
        <Layer {...selectedProducerLayer} />
      </Source>

      <Source id="producer-grape-source" type="geojson" data={producerGrapeFeatures}>
        <Layer {...producerGrapeLayer} />
      </Source>

      <NavigationControl visualizePitch={false} position="bottom-right" />

      {hoverInfo ? (
        <Popup
          closeButton={false}
          closeOnClick={false}
          latitude={hoverInfo.lat}
          longitude={hoverInfo.lng}
          offset={12}
          className="bourgogne-popup"
        >
          <div className="bourgogne-popup-card">
            <p>{hoverInfo.title}</p>
            <span>{hoverInfo.subtitle}</span>
          </div>
        </Popup>
      ) : null}
    </Map>
  );
}
