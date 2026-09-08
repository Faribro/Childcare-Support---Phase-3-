'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import MapLibreMap from 'react-map-gl/maplibre';
import { GeoJsonLayer, TextLayer, ColumnLayer } from '@deck.gl/layers';
import { LightingEffect, AmbientLight, PointLight } from '@deck.gl/core';
import dynamic from 'next/dynamic';
import { normalizeGeographicKey } from '@/lib/normalizeGeographicKey';
import { feature } from 'topojson-client';
import 'maplibre-gl/dist/maplibre-gl.css';

const DeckGL = dynamic(() => import('@deck.gl/react').then((mod) => mod.default), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-400">
      <div className="flex flex-col items-center space-y-3">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-teal-500" />
        <span className="text-xs font-semibold">Initializing 3D Spatial GIS Engine...</span>
      </div>
    </div>
  ),
});

const STATE_FILE_MAP: Record<string, string> = {
  maharashtra: 'maharashtra',
  karnataka: 'karnataka',
  delhi: 'delhi',
  tamilnadu: 'tamilnadu',
  uttarpradesh: 'uttar-pradesh',
  westbengal: 'west-bengal',
  gujarat: 'gujarat',
  rajasthan: 'rajasthan',
  madhyapradesh: 'madhya-pradesh',
  andhrapradesh: 'andhra-pradesh',
  telangana: 'telangana',
  kerala: 'kerala',
  bihar: 'bihar',
  odisha: 'odisha',
  punjab: 'punjab',
  haryana: 'haryana',
  jharkhand: 'jharkhand',
  chhattisgarh: 'chhattisgarh',
  assam: 'assam',
  uttarakhand: 'uttarakhand',
  himachalpradesh: 'himachal-pradesh',
  goa: 'goa',
  jammuandkashmir: 'jammu-and-kashmir',
  ladakh: 'ladakh',
  mizoram: 'mizoram',
  chandigarh: 'chandigarh',
  arunachalpradesh: 'arunachal-pradesh',
  manipur: 'manipur',
  meghalaya: 'meghalaya',
  nagaland: 'nagaland',
  sikkim: 'sikkim',
  tripura: 'tripura',
  andamanandnicobarislands: 'andaman-and-nicobar-islands',
  dnhanddd: 'dnh-and-dd',
  lakshadweep: 'lakshadweep',
  puducherry: 'puducherry',
};

// Premium ambient & 3D point lighting
const ambientLight = new AmbientLight({ color: [255, 255, 255], intensity: 1.2 });
const pointLight = new PointLight({
  color: [240, 253, 250],
  intensity: 2.2,
  position: [78.0, 20.0, 150000],
});
const lightingEffect = new LightingEffect({ ambientLight, pointLight });

// Bounding box calculator
const getBBox = (coordinates: any[]): [number, number, number, number] => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const processCoords = (coords: any[]) => {
    coords.forEach((c) => {
      if (typeof c[0] === 'number') {
        minX = Math.min(minX, c[0]);
        minY = Math.min(minY, c[1]);
        maxX = Math.max(maxX, c[0]);
        maxY = Math.max(maxY, c[1]);
      } else {
        processCoords(c);
      }
    });
  };
  processCoords(coordinates);
  return [minX, minY, maxX, maxY];
};

export interface GISRegionMetrics {
  name: string;
  state: string;
  total: number;
  vl_suppressed: number;
  vl_unsuppressed: number;
  suppression_rate: number;
  severe_underweight: number;
  moderate_underweight: number;
  normal_nutrition: number;
  severe_anemia: number;
  moderate_anemia: number;
  school_enrolled: number;
  out_of_school: number;
  grant_amount: number;
  orphans: number;
}

interface GISMapComponentProps {
  category: string;
  activeMetric: string;
  selectedState: string | null;
  selectedDistrict: string | null;
  onSelectState: (state: string | null) => void;
  onSelectDistrict: (district: string | null) => void;
  is3DEnabled: boolean;
  data: {
    districts: Record<string, GISRegionMetrics>;
    states: Record<string, GISRegionMetrics>;
  };
  setTooltip: (tooltip: any) => void;
}

export default function GISMapComponent({
  category,
  activeMetric,
  selectedState,
  selectedDistrict,
  onSelectState,
  onSelectDistrict,
  is3DEnabled,
  data,
  setTooltip,
}: GISMapComponentProps) {
  const [viewState, setViewState] = useState({
    longitude: 78.9629,
    latitude: 20.5937,
    zoom: 4.6,
    pitch: 45,
    bearing: -8,
  });

  const [topoGeoData, setTopoGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Depth level: 'state' = national overview, 'district' = state drilldown
  const depthLevel: 'state' | 'district' = useMemo(() => {
    if (selectedState || viewState.zoom >= 5.8) return 'district';
    return 'state';
  }, [selectedState, viewState.zoom]);

  // Load TopoJSON / GeoJSON boundaries
  useEffect(() => {
    setLoading(true);
    const stateKey = selectedState ? normalizeGeographicKey(selectedState) : null;
    const stateFile = stateKey ? STATE_FILE_MAP[stateKey] : null;
    const statesToLoad = stateFile ? [stateFile] : Object.values(STATE_FILE_MAP);

    let isCancelled = false;
    Promise.all(
      statesToLoad.map((fileName) =>
        fetch(`/geojson/states/${fileName}.json`)
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to load ${fileName}`);
            return res.json();
          })
          .then((topology) => {
            const objectKey = Object.keys(topology.objects)[0];
            const geojson: any = feature(topology, topology.objects[objectKey]);
            if (geojson.type === 'FeatureCollection') return geojson.features;
            if (geojson.type === 'Feature') return [geojson];
            return [];
          })
          .then((features) => (features || []).filter((f: any) => f && f.geometry))
          .catch((err) => {
            console.warn(`Could not load boundary for ${fileName}:`, err);
            return [];
          })
      )
    ).then((results) => {
      if (isCancelled) return;
      setTopoGeoData({ type: 'FeatureCollection', features: results.flat() });
      setLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedState]);

  // Fly to selected state
  useEffect(() => {
    if (selectedState && topoGeoData?.features?.length > 0) {
      const sample = topoGeoData.features.find((f: any) => {
        const fState = f.properties?.st_nm || f.properties?.state || '';
        return normalizeGeographicKey(fState) === normalizeGeographicKey(selectedState);
      });
      if (sample?.geometry?.coordinates) {
        const bbox = getBBox(sample.geometry.coordinates);
        setViewState((prev) => ({
          ...prev,
          longitude: (bbox[0] + bbox[2]) / 2,
          latitude: (bbox[1] + bbox[3]) / 2,
          zoom: 6.4,
          pitch: 48,
          bearing: -6,
        }));
      }
    } else if (!selectedState) {
      setViewState((prev) => ({
        ...prev,
        longitude: 78.9629,
        latitude: 20.5937,
        zoom: 4.6,
        pitch: is3DEnabled ? 45 : 0,
        bearing: is3DEnabled ? -8 : 0,
      }));
    }
  }, [selectedState, topoGeoData, is3DEnabled]);

  // Fly to selected district
  useEffect(() => {
    if (selectedDistrict && topoGeoData?.features?.length > 0) {
      const feat = topoGeoData.features.find((f: any) => {
        const dist = f.properties?.district || f.properties?.dtname || '';
        return normalizeGeographicKey(dist) === normalizeGeographicKey(selectedDistrict);
      });
      if (feat?.geometry?.coordinates) {
        const bbox = getBBox(feat.geometry.coordinates);
        setViewState((prev) => ({
          ...prev,
          longitude: (bbox[0] + bbox[2]) / 2,
          latitude: (bbox[1] + bbox[3]) / 2,
          zoom: 8.4,
          pitch: 52,
          bearing: -4,
        }));
      }
    }
  }, [selectedDistrict, topoGeoData]);

  // Active dictionary mapping
  const activeDict = useMemo(() => {
    const dict = new Map<string, GISRegionMetrics>();
    if (data?.districts) {
      Object.entries(data.districts).forEach(([k, v]) => dict.set(normalizeGeographicKey(k), v));
    }
    if (data?.states) {
      Object.entries(data.states).forEach(([k, v]) => dict.set(normalizeGeographicKey(k), v));
    }
    return dict;
  }, [data]);

  // Max value calculation for proportional color scale & extrusion
  const maxVal = useMemo(() => {
    let max = 1;
    activeDict.forEach((metrics) => {
      const val = (metrics as any)[activeMetric] || 0;
      if (val > max) max = val;
    });
    return max;
  }, [activeDict, activeMetric]);

  // Color gradient definition based on clinical indicator type
  const isAlertIndicator = useMemo(() => {
    return ['vl_unsuppressed', 'severe_underweight', 'severe_anemia', 'out_of_school'].includes(
      activeMetric
    );
  }, [activeMetric]);

  const getColor = useCallback(
    (metrics: any): [number, number, number, number] => {
      if (!metrics) return [226, 232, 240, 110]; // slate-200
      const val = metrics[activeMetric] || 0;
      if (val === 0) return [226, 232, 240, 110];
      const ratio = Math.min(val / maxVal, 1);

      if (isAlertIndicator) {
        // Rose/Amber alert gradient for clinical danger metrics
        return [
          Math.floor(225 + ratio * 30),
          Math.floor(60 + (1 - ratio) * 80),
          Math.floor(60 + (1 - ratio) * 60),
          190 + Math.floor(ratio * 55),
        ];
      } else {
        // Vibrant Emerald/Teal gradient for positive health/coverage metrics
        return [
          Math.floor(13 + (1 - ratio) * 20),
          Math.floor(148 + ratio * 40),
          Math.floor(136 + ratio * 40),
          180 + Math.floor(ratio * 65),
        ];
      }
    },
    [activeMetric, maxVal, isAlertIndicator]
  );

  // Pre-calculate centroids and bounding boxes
  const geoMetadata = useMemo(() => {
    const cache = new Map<string, { center: [number, number]; bbox: [number, number, number, number] }>();
    if (!topoGeoData?.features) return cache;

    const stateGroups = new Map<
      string,
      { minX: number; minY: number; maxX: number; maxY: number; label: string }
    >();

    topoGeoData.features.forEach((f: any) => {
      const stateName = f.properties?.st_nm || f.properties?.state || '';
      const districtName = f.properties?.district || f.properties?.dtname || '';

      if (districtName && f.geometry?.coordinates) {
        const bbox = getBBox(f.geometry.coordinates);
        cache.set(`district-${normalizeGeographicKey(districtName)}`, {
          center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
          bbox,
        });
      }

      if (stateName && f.geometry?.coordinates) {
        const key = normalizeGeographicKey(stateName);
        const bbox = getBBox(f.geometry.coordinates);
        const existing = stateGroups.get(key);
        if (!existing) {
          stateGroups.set(key, { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3], label: stateName });
        } else {
          existing.minX = Math.min(existing.minX, bbox[0]);
          existing.minY = Math.min(existing.minY, bbox[1]);
          existing.maxX = Math.max(existing.maxX, bbox[2]);
          existing.maxY = Math.max(existing.maxY, bbox[3]);
        }
      }
    });

    stateGroups.forEach((v, key) => {
      if (v.minX !== Infinity) {
        cache.set(`state-${key}`, {
          center: [(v.minX + v.maxX) / 2, (v.minY + v.maxY) / 2],
          bbox: [v.minX, v.minY, v.maxX, v.maxY],
        });
      }
    });

    return cache;
  }, [topoGeoData]);

  // State-level labels
  const stateLabels = useMemo(() => {
    if (!topoGeoData?.features) return [];
    const stateNameMap = new Map<string, string>();
    topoGeoData.features.forEach((f: any) => {
      const stateName = f.properties?.st_nm || f.properties?.state || '';
      if (stateName) stateNameMap.set(normalizeGeographicKey(stateName), stateName);
    });

    const labels: any[] = [];
    stateNameMap.forEach((displayName, key) => {
      const cached = geoMetadata.get(`state-${key}`);
      if (!cached) return;
      const metrics = activeDict.get(key);
      const val = metrics ? ((metrics as any)[activeMetric] || 0) : 0;
      if (val > 0) {
        labels.push({
          name: displayName,
          value: val,
          position: cached.center,
          isState: true,
          metrics,
        });
      }
    });
    return labels;
  }, [topoGeoData, geoMetadata, activeDict, activeMetric]);

  // District-level labels
  const districtLabels = useMemo(() => {
    if (!topoGeoData?.features) return [];
    const labels: any[] = [];
    topoGeoData.features.forEach((f: any) => {
      const districtName = f.properties?.district || f.properties?.dtname || '';
      const stateName = f.properties?.st_nm || f.properties?.state || '';

      if (selectedState && normalizeGeographicKey(stateName) !== normalizeGeographicKey(selectedState)) {
        return;
      }
      if (!districtName) return;

      const key = normalizeGeographicKey(districtName);
      const cached = geoMetadata.get(`district-${key}`);
      if (!cached) return;

      const metrics = activeDict.get(key);
      const val = metrics ? ((metrics as any)[activeMetric] || 0) : 0;
      if (val > 0) {
        labels.push({
          name: districtName,
          value: val,
          position: cached.center,
          isState: false,
          metrics,
        });
      }
    });
    return labels;
  }, [topoGeoData, geoMetadata, activeDict, activeMetric, selectedState]);

  const activeLabels = useMemo(() => {
    return depthLevel === 'state' ? stateLabels : districtLabels;
  }, [depthLevel, stateLabels, districtLabels]);

  const maxLabelVal = useMemo(() => {
    let max = 1;
    activeLabels.forEach((d) => {
      if (d.value > max) max = d.value;
    });
    return max;
  }, [activeLabels]);

  // GeoJSON 3D Extruded Polygon Layer
  const mapLayer = useMemo(() => {
    if (!topoGeoData) return null;
    return new GeoJsonLayer({
      id: 'india-clinical-geojson-layer',
      data: topoGeoData,
      pickable: true,
      autoHighlight: true,
      stroked: true,
      filled: true,
      extruded: is3DEnabled,
      wireframe: false,
      lineWidthMinPixels: 1,
      getLineColor: [100, 116, 139, 80],
      getFillColor: (f: any) => {
        const districtName = f.properties?.district || f.properties?.dtname || '';
        const stateName = f.properties?.st_nm || f.properties?.state || '';
        const useName = depthLevel === 'district' ? districtName : stateName;
        const key = normalizeGeographicKey(useName || districtName || stateName);
        return getColor(activeDict.get(key));
      },
      getElevation: (f: any) => {
        if (!is3DEnabled) return 0;
        const districtName = f.properties?.district || f.properties?.dtname || '';
        const stateName = f.properties?.st_nm || f.properties?.state || '';
        const useName = depthLevel === 'district' ? districtName : stateName;
        const key = normalizeGeographicKey(useName || districtName || stateName);
        const metrics = activeDict.get(key);
        if (!metrics) return 400;
        const val = (metrics as any)[activeMetric] || 0;
        return (val / maxVal) * 35000 + 400;
      },
      updateTriggers: {
        getFillColor: [activeMetric, activeDict, maxVal, depthLevel],
        getElevation: [activeMetric, activeDict, maxVal, depthLevel, is3DEnabled],
      },
      onHover: (info: any) => {
        if (info.x && info.y && info.object) {
          const props = info.object.properties;
          const districtName = props.district || props.dtname || '';
          const stateName = props.st_nm || props.state || '';
          const name = districtName || stateName;
          const key = normalizeGeographicKey(name);
          const metrics = activeDict.get(key);
          setTooltip({
            x: info.x,
            y: info.y,
            name,
            state: stateName,
            metrics: metrics || null,
          });
        } else {
          setTooltip(null);
        }
      },
      onClick: (info: any) => {
        if (info.object) {
          const props = info.object.properties;
          const stateName = props.st_nm || props.state || '';
          const districtName = props.district || props.dtname || '';
          if (districtName) onSelectDistrict(districtName);
          if (stateName) onSelectState(stateName);
        }
      },
    });
  }, [
    topoGeoData,
    activeMetric,
    activeDict,
    maxVal,
    getColor,
    onSelectState,
    onSelectDistrict,
    setTooltip,
    depthLevel,
    is3DEnabled,
  ]);

  // Glowing 3D column pillars on each region centroid
  const columnLayer = useMemo(() => {
    if (!activeLabels.length || !is3DEnabled) return null;
    return new ColumnLayer({
      id: 'clinical-indicator-pillars',
      data: activeLabels,
      pickable: false,
      extruded: true,
      diskResolution: 8,
      radius: depthLevel === 'state' ? 14000 : 5500,
      getPosition: (d: any) => d.position,
      getElevation: (d: any) => {
        const ratio = maxLabelVal > 0 ? d.value / maxLabelVal : 0;
        return ratio * 48000 + 1500;
      },
      getFillColor: (d: any) => {
        if (d.value === 0) return [148, 163, 184, 80];
        const ratio = maxLabelVal > 0 ? Math.min(d.value / maxLabelVal, 1) : 0;
        if (isAlertIndicator) {
          return [244, Math.floor(63 - ratio * 40), Math.floor(94 - ratio * 40), 220];
        } else {
          return [15, Math.floor(118 + ratio * 60), Math.floor(110 + ratio * 60), 220];
        }
      },
      updateTriggers: {
        getElevation: [activeLabels, maxLabelVal],
        getFillColor: [activeLabels, maxLabelVal, isAlertIndicator],
      },
    });
  }, [activeLabels, maxLabelVal, depthLevel, isAlertIndicator, is3DEnabled]);

  // Text label layer on top of each centroid
  const textLayer = useMemo(() => {
    if (!activeLabels.length) return null;

    return new TextLayer({
      id: 'clinical-indicator-text',
      data: activeLabels,
      pickable: false,
      parameters: { depthTest: false, blend: true },
      getPosition: (d: any) => {
        if (!is3DEnabled) return [d.position[0], d.position[1], 1000];
        const ratio = maxLabelVal > 0 ? d.value / maxLabelVal : 0;
        const elev = ratio * 48000 + 1500;
        return [d.position[0], d.position[1], elev + 5000];
      },
      getText: (d: any) => {
        const namePart = depthLevel === 'state' ? d.name.toUpperCase() : d.name;
        const val = d.value;
        const metricFormatted =
          activeMetric === 'grant_amount'
            ? `₹${Number(val).toLocaleString('en-IN')}`
            : activeMetric.includes('rate')
            ? `${val}%`
            : `${val} Children`;

        if (d.metrics?.suppression_rate !== undefined && activeMetric === 'total') {
          return `${namePart}\n${metricFormatted} | ${d.metrics.suppression_rate}% VL Suppressed`;
        }
        return `${namePart}\n${metricFormatted}`;
      },
      getSize: depthLevel === 'state' ? 12 : 11,
      sizeUnits: 'pixels',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      getColor: [15, 23, 42, 255],
      background: true,
      backgroundColor: [255, 255, 255, 235],
      backgroundPadding: [5, 3, 5, 3],
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontWeight: 700,
      updateTriggers: {
        getText: [activeMetric, activeLabels],
        getPosition: [activeLabels, maxLabelVal, is3DEnabled],
        getSize: [depthLevel],
      },
    });
  }, [activeLabels, maxLabelVal, depthLevel, activeMetric, is3DEnabled]);

  return (
    <div className="relative w-full h-full select-none">
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={true}
        layers={[mapLayer, columnLayer, textLayer].filter(Boolean)}
        effects={[lightingEffect]}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'default')}
      >
        <MapLibreMap
          reuseMaps
          mapLib={import('maplibre-gl')}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        />
      </DeckGL>

      {/* Depth level indicator badge */}
      <div className="absolute top-4 right-4 z-30 flex items-center space-x-2 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3.5 py-1.5 shadow-sm">
        <span
          className={`w-2 h-2 rounded-full ${
            depthLevel === 'district' ? 'bg-amber-500 animate-pulse' : 'bg-teal-600'
          }`}
        />
        <span className="text-[11px] font-bold tracking-wider text-slate-700">
          {depthLevel === 'state' ? 'NATIONAL STATE VIEW' : 'DISTRICT SURVEILLANCE VIEW'}
        </span>
      </div>

      {/* Loading overlay indicator */}
      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-white/95 border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl shadow-lg backdrop-blur-md flex items-center space-x-2">
          <svg className="animate-spin h-3.5 w-3.5 text-teal-700" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading Spatial TopoJSON Boundaries...</span>
        </div>
      )}
    </div>
  );
}
