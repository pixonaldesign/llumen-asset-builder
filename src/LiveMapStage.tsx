import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Cursor, Minus, Plus } from "@phosphor-icons/react";
import "mapbox-gl/dist/mapbox-gl.css";
import { createMapboxThreeLayer, type ThreeLayerApi } from "@/lib/mapboxThreeLayer";
import { getDatasetMeta } from "@/lib/geo/catalog";
import {
  applyValueProperty,
  boundsOfDataset,
  loadDatasetFromUrl,
  subsampleFeatures,
} from "@/lib/geo/loadDataset";
import { loadFloodGrid, floodSettingsForGrid, type LoadedFloodGrid } from "@/lib/flood";
import { loadDustStormField, type LoadedDustField } from "@/lib/dustStorm";
import { loadOilSpillTracks, type OilSpillTracks } from "@/lib/oilSpill";
import { pointBevelFromConfig } from "@/lib/primitives";
import { publicUrl } from "@/lib/publicUrl";
import type { PlaygroundConfig, VizDataset } from "@/lib/types";
import type { LiveMapScene } from "./liveMapScene";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

type Loaded = {
  datasetId: string;
  dataset: VizDataset;
  maxPoints: number;
  flood: LoadedFloodGrid | null;
  dust: LoadedDustField | null;
  oil: OilSpillTracks | null;
  water: GeoJSON.GeoJSON | null;
  floodScenarios: PlaygroundConfig["flood"]["scenario"][];
};

/** Fields that need new geometry; everything else goes through the layer's apply* calls. */
function identityKey(cfg: PlaygroundConfig): string {
  return JSON.stringify([
    cfg.datasetId,
    cfg.pointVisual,
    cfg.primitive,
    cfg.pointScaleProfile,
    cfg.localBaseScale,
    cfg.localHeightScale,
    cfg.areaBaseHeight,
    cfg.areaExtrusionScale,
    cfg.colorMode,
    cfg.colorProperty,
    cfg.colorRamp,
    cfg.valueProperty,
    cfg.waterGradient.radiusFromValue,
    cfg.markerLod.enabled,
    cfg.markerLod.maxFull3d,
  ]);
}

function sceneConfig(scene: LiveMapScene, loaded: Loaded): PlaygroundConfig {
  const cfg = { ...scene.config, maxPoints: loaded.maxPoints };
  if (loaded.flood) cfg.flood = floodSettingsForGrid(cfg.flood, loaded.flood, loaded.floodScenarios);
  return cfg;
}

function build(api: ThreeLayerApi, loaded: Loaded, cfg: PlaygroundConfig) {
  const raw = loaded.dataset;
  if (raw.kind === "area") {
    api.setAreas({
      areas: subsampleFeatures(applyValueProperty(raw.areas, cfg.valueProperty), cfg.maxPoints),
      baseHeight: cfg.areaBaseHeight,
      extrusionScale: cfg.areaExtrusionScale,
      bevelEnabled: cfg.bevelEnabled,
      bevelSize: cfg.bevelSize,
      bevelSegments: cfg.bevelSegments,
      colorMode: cfg.colorMode,
      colorProperty: cfg.colorProperty,
      colorRamp: cfg.colorRamp,
      opacityRandomMin: cfg.opacityRandomMin,
      opacityRandomMax: cfg.opacityRandomMax,
    });
    return;
  }
  if (cfg.pointVisual === "flood" && loaded.flood) {
    api.setFlood({ grid: loaded.flood, settings: cfg.flood });
    return;
  }
  if (cfg.pointVisual === "dust-storm" && loaded.dust) {
    api.setDustStorm({ field: loaded.dust, settings: cfg.dustStorm });
    return;
  }
  if (cfg.pointVisual === "oil-spill" && loaded.oil) {
    api.setOilSpill({ tracks: loaded.oil, settings: cfg.oilSpill, fallbackWater: loaded.water });
    return;
  }
  const points = subsampleFeatures(applyValueProperty(raw.points, cfg.valueProperty), cfg.maxPoints);
  if (cfg.pointVisual === "water-gradient") {
    api.setWaterGradients({
      points,
      settings: cfg.waterGradient,
      colorMode: cfg.colorMode,
      colorProperty: cfg.colorProperty,
      colorRamp: cfg.colorRamp,
      fallbackWater: loaded.water,
    });
    return;
  }
  const bevel = pointBevelFromConfig(cfg);
  api.setMarkers({
    points,
    primitive: cfg.primitive,
    quality: cfg.geometryQuality,
    icosphereSubdivisions: cfg.icosphereSubdivisions,
    bevelEnabled: bevel.enabled,
    bevelSize: bevel.size,
    bevelSegments: bevel.segments,
    baseScale: cfg.pointScaleProfile === "local" ? cfg.localBaseScale : cfg.baseScale,
    heightScale: cfg.pointScaleProfile === "local" ? cfg.localHeightScale : cfg.heightScale,
    colorMode: cfg.colorMode,
    colorProperty: cfg.colorProperty,
    colorRamp: cfg.colorRamp,
    opacityRandomMin: cfg.opacityRandomMin,
    opacityRandomMax: cfg.opacityRandomMax,
    lod: cfg.markerLod,
    flagAura: cfg.flagAura,
  });
}

function applyLook(api: ThreeLayerApi, cfg: PlaygroundConfig) {
  api.applyMaterial(cfg.material);
  api.applyLighting(cfg.lighting);
  api.applyRenderer(cfg.renderer);
  api.applyZoomScaling({
    enabled: cfg.adaptiveZoomScaling,
    minPixels: cfg.zoomScaleMinPixels,
    maxPixels: cfg.zoomScaleMaxPixels,
    collisionAware: cfg.collisionAwareScaling,
  });
  api.applyMarkerLod(cfg.markerLod);
  api.applyFlagAura(cfg.flagAura);
  if (cfg.pointVisual === "water-gradient") api.applyWaterGradient(cfg.waterGradient);
  if (cfg.pointVisual === "oil-spill") api.applyOilSpill(cfg.oilSpill);
  if (cfg.pointVisual === "dust-storm") api.applyDustStorm(cfg.dustStorm);
  if (cfg.pointVisual === "flood") api.applyFlood(cfg.flood);
}

function densestPoint(points: { lng: number; lat: number }[]): [number, number] {
  const sample = subsampleFeatures(points, 400);
  const radius = 0.003;
  let best = sample[0]!;
  let bestCount = -1;
  for (const p of sample) {
    let count = 0;
    for (const q of sample) {
      if (Math.abs(p.lng - q.lng) < radius * 1.6 && Math.abs(p.lat - q.lat) < radius) count++;
    }
    if (count > bestCount) {
      best = p;
      bestCount = count;
    }
  }
  return [best.lng, best.lat];
}

/** Street-scale markers are metres wide, so a whole-city fit in a card would hide them. */
function frame(map: mapboxgl.Map, dataset: VizDataset, cfg: PlaygroundConfig) {
  if (dataset.kind === "point" && cfg.pointVisual === "marker" && cfg.pointScaleProfile === "local") {
    if (!dataset.points.length) return;
    map.jumpTo({
      center: densestPoint(dataset.points),
      zoom: 15.4,
      pitch: 60,
      bearing: -24,
    });
    return;
  }
  if (dataset.kind === "area") {
    map.jumpTo({ center: [14, 34], zoom: 1.6, pitch: 25, bearing: 0 });
    return;
  }
  const bounds = boundsOfDataset(dataset);
  if (bounds) map.fitBounds(bounds, { padding: 24, duration: 0, maxZoom: 15, pitch: 45 });
}

async function loadScene(datasetId: string): Promise<Loaded> {
  const meta = getDatasetMeta(datasetId);
  if (!meta) throw new Error(`Unknown dataset ${datasetId}`);
  const dataset = await loadDatasetFromUrl(meta.path);
  const [flood, dust, oil, water] = await Promise.all([
    meta.floodPath ? loadFloodGrid(meta.floodPath) : null,
    meta.fieldPath ? loadDustStormField(meta.fieldPath) : null,
    meta.tracksPath && meta.surfacePath ? loadOilSpillTracks(meta.tracksPath, meta.surfacePath) : null,
    meta.waterMaskPath
      ? fetch(publicUrl(meta.waterMaskPath))
          .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.GeoJSON>) : null))
          .catch(() => null)
      : null,
  ]);
  return {
    datasetId,
    dataset,
    maxPoints: meta.defaultMaxPoints ?? 50000,
    flood,
    dust,
    oil,
    water,
    floodScenarios: meta.floodScenarios ?? [],
  };
}

export function LiveMapStage({ scene }: { scene: LiveMapScene }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const apiRef = useRef<ThreeLayerApi | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const builtKeyRef = useRef<string | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: sceneRef.current.config.styleUrl,
      center: [4.9, 52.37],
      zoom: 11,
      pitch: 55,
      antialias: true,
      projection: "mercator",
      attributionControl: false,
    });
    mapRef.current = map;
    const onStyleLoad = () => {
      apiRef.current?.dispose();
      const api = createMapboxThreeLayer(map);
      apiRef.current = api;
      if (!map.getLayer(api.layer.id)) map.addLayer(api.layer);
      builtKeyRef.current = null;
      setReady(true);
    };
    const onError = (e: mapboxgl.ErrorEvent) => {
      const msg = e.error?.message ?? "";
      if (/style|unauthorized|401|403/i.test(msg)) setError(`Map style failed to load: ${msg}`);
    };
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(containerRef.current);
    map.on("style.load", onStyleLoad);
    map.on("error", onError);
    return () => {
      resize.disconnect();
      map.off("style.load", onStyleLoad);
      map.off("error", onError);
      apiRef.current?.dispose();
      apiRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadScene(scene.datasetId)
      .then((next) => {
        if (cancelled) return;
        loadedRef.current = next;
        builtKeyRef.current = null;
        setLoaded(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dataset");
      });
    return () => {
      cancelled = true;
    };
  }, [scene.datasetId]);

  const cfgKey = useMemo(() => JSON.stringify(scene.config), [scene.config]);

  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    const current = loadedRef.current;
    if (!ready || !api || !map || !current || current.datasetId !== sceneRef.current.datasetId) return;
    const cfg = sceneConfig(sceneRef.current, current);
    applyLook(api, cfg);
    const key = identityKey(cfg);
    if (key === builtKeyRef.current) return;
    const firstBuild = builtKeyRef.current === null;
    builtKeyRef.current = key;
    build(api, current, cfg);
    if (firstBuild) frame(map, current.dataset, cfg);
  }, [ready, loaded, cfgKey]);

  if (!TOKEN) {
    return (
      <div className="live-map-stage live-map-stage--empty">
        Add VITE_MAPBOX_TOKEN to .env.local to render the live map.
      </div>
    );
  }

  return (
    <div className="live-map-stage">
      <div ref={containerRef} className="live-map-stage__map" />
      <div className="live-map-stage__controls" role="group" aria-label="Map controls">
        <button
          type="button"
          className="live-map-stage__control"
          disabled={!ready}
          aria-label="Reset map orientation"
          onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 420 })}
        >
          <Cursor size={18} weight="regular" aria-hidden />
        </button>
        <button
          type="button"
          className="live-map-stage__control"
          disabled={!ready}
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn({ duration: 280 })}
        >
          <Plus size={18} weight="regular" aria-hidden />
        </button>
        <button
          type="button"
          className="live-map-stage__control"
          disabled={!ready}
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut({ duration: 280 })}
        >
          <Minus size={18} weight="regular" aria-hidden />
        </button>
      </div>
      {(!ready || !loaded) && !error ? <div className="live-map-stage__status">Loading map…</div> : null}
      {error ? <div className="live-map-stage__status live-map-stage__status--error">{error}</div> : null}
    </div>
  );
}
