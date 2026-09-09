'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Layers,
  MapPin,
  Building2,
  Activity,
  HeartPulse,
  GraduationCap,
  Sparkles,
  Maximize,
  Minimize,
  RotateCcw,
  ShieldAlert,
  Info,
  Box,
  CheckCircle2,
  TrendingUp,
  School,
  HeartHandshake,
} from 'lucide-react';
import { normalizeGeographicKey } from '@/lib/normalizeGeographicKey';
import type { GISRegionMetrics } from './GISMapComponent';

const GISMapComponent = dynamic(() => import('./GISMapComponent'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 w-full h-full bg-slate-50 flex flex-col items-center justify-center text-slate-600 gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-teal-600" />
      <p className="text-xs font-semibold text-slate-600">Loading 3D Spatial Deck.GL Map...</p>
    </div>
  ),
});

const CATEGORIES = [
  { id: 'all', label: 'All Beneficiaries' },
  { id: 'enrolled', label: 'Enrolled in School' },
  { id: 'outofschool', label: 'Out of School' },
  { id: 'orphans', label: 'Single / Double Orphan' },
  { id: 'highrisk', label: 'High Clinical Risk' },
];

const INDICATORS = [
  { key: 'total', label: '1. Evaluated Children (Caseload)', icon: Activity, group: 'Overview' },
  { key: 'suppression_rate', label: '2. Viral Suppression Rate (%)', icon: Activity, group: 'Clinical' },
  { key: 'vl_unsuppressed', label: '3. High Viral Load (≥1,000 c/mL)', icon: ShieldAlert, group: 'Clinical' },
  { key: 'severe_underweight', label: '4. Severe Underweight (WHO SAM)', icon: HeartPulse, group: 'Nutrition' },
  { key: 'severe_anemia', label: '5. Severe Anemia (<7.0 g/dL)', icon: HeartPulse, group: 'Clinical' },
  { key: 'grant_amount', label: '6. DBT Educational Grants (₹)', icon: GraduationCap, group: 'Entitlements' },
];

// Baseline districts initialized empty - only actual uploaded surveys will populate the map
const BASELINE_DISTRICTS: Record<string, GISRegionMetrics> = {};

export default function GISDashboard() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [educationStatus, setEducationStatus] = useState('ALL');
  const [orphanStatus, setOrphanStatus] = useState('ALL');
  const [activeMetric, setActiveMetric] = useState('total');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [is3DEnabled, setIs3DEnabled] = useState(true);
  const [tooltip, setTooltip] = useState<any>(null);
  const [liveSubmissions, setLiveSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Automatically request fullscreen on mount as requested
  useEffect(() => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // Ignored if user interaction is required
    }
  }, []);

  // Fetch real synchronized submissions from API
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/submissions?limit=500');
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json.data) ? json.data : Array.isArray(json.items) ? json.items : [];
          setLiveSubmissions(items);
        }
      } catch (err) {
        console.warn('GIS data fetch fallback to live cohort:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Compile active data dynamically
  const compiledData = useMemo(() => {
    const districts: Record<string, GISRegionMetrics> = {};
    const states: Record<string, GISRegionMetrics> = {};

    // Layer real submissions on top
    if (liveSubmissions.length > 0) {
      liveSubmissions.forEach((it: any) => {
        const rawDistrict = it['19\nDistrict'] || it.demographics?.district || it.district || 'Pune';
        const rawState = it['18\nState'] || it.demographics?.state || it.state || 'Maharashtra';
        const distKey = normalizeGeographicKey(rawDistrict);

        // Education & school type evaluation
        const rawSchoolType = String(
          it['53\nSchool Type'] ||
          it.educationStatus?.schoolType ||
          it.education?.schoolType ||
          it.school_type ||
          ''
        );
        const rawEducation = String(
          it['49\nEducation Status'] ||
          it.education?.educationStatus ||
          ''
        );
        const isEnrolled = rawEducation
          ? !rawEducation.toLowerCase().includes('not')
          : !rawSchoolType.toLowerCase().includes('not in school');

        // Orphan evaluation
        const rawOrphan = String(
          it['13\nOrphan Status'] ||
          it['15\nOrphan Status'] ||
          it.demographics?.orphanStatus ||
          it.orphan_status ||
          'Both parents alive'
        );
        const isOrphan = !rawOrphan.toLowerCase().includes('both');

        const rawVl = it['45\nViral Load'] ?? it.clinical?.viralLoad ?? it.clinical?.viralload ?? '';
        const numVl = parseFloat(String(rawVl).replace(/[^0-9.]/g, ''));
        const isSuppressed = String(rawVl).toLowerCase().includes('undetect') || (!isNaN(numVl) && numVl < 1000);
        const isUnsuppressed = !isNaN(numVl) && numVl >= 1000;

        const rawBmi = it['34\nBMI'] ?? it.nutrition?.bmi ?? it.clinical?.bmi ?? 0;
        const numBmi = Number(rawBmi) || 0;
        const isSevereUnderweight = numBmi > 0 && numBmi < 13.5;
        const isModerateUnderweight = numBmi >= 13.5 && numBmi < 15.0;
        const isNormalNutrition = numBmi >= 15.0;

        const rawHb = it['36\nHemoglobin (g/dL)'] ?? it.clinical?.hemoglobin ?? '';
        const numHb = parseFloat(String(rawHb));
        const isSevereAnemia = !isNaN(numHb) && numHb > 0 && numHb < 7.0;
        const isModerateAnemia = !isNaN(numHb) && numHb >= 7.0 && numHb < 10.0;

        const grant = Number(it['63\nTotal Annual Education Cost'] ?? it.grantCalculation?.totalGrantAmount ?? 2000);

        if (activeCategory === 'enrolled' && !isEnrolled) return;
        if (activeCategory === 'outofschool' && isEnrolled) return;
        if (activeCategory === 'orphans' && !isOrphan) return;
        if (activeCategory === 'highrisk' && !(isUnsuppressed || isSevereUnderweight || isSevereAnemia)) return;

        // Apply dedicated education status filter
        if (educationStatus === 'Enrolled' && !isEnrolled) return;
        if (educationStatus === 'Not In School' && isEnrolled) return;
        if (educationStatus === 'Government' && !rawSchoolType.toLowerCase().includes('government')) return;
        if (educationStatus === 'Private' && !rawSchoolType.toLowerCase().includes('private')) return;
        if (educationStatus === 'Aided' && !rawSchoolType.toLowerCase().includes('aided')) return;

        // Apply dedicated orphan status filter
        if (orphanStatus === 'Both parents alive' && !rawOrphan.toLowerCase().includes('both')) return;
        if (orphanStatus === 'Single orphan' && !rawOrphan.toLowerCase().includes('single')) return;
        if (orphanStatus === 'Double orphan' && !rawOrphan.toLowerCase().includes('double')) return;

        if (!districts[distKey]) {
          districts[distKey] = {
            name: rawDistrict,
            state: rawState,
            total: 0,
            vl_suppressed: 0,
            vl_unsuppressed: 0,
            suppression_rate: 100,
            severe_underweight: 0,
            moderate_underweight: 0,
            normal_nutrition: 0,
            severe_anemia: 0,
            moderate_anemia: 0,
            school_enrolled: 0,
            out_of_school: 0,
            grant_amount: 0,
            orphans: 0,
          };
        }

        const d = districts[distKey];
        d.total += 1;
        if (isSuppressed) d.vl_suppressed += 1;
        if (isUnsuppressed) d.vl_unsuppressed += 1;
        d.suppression_rate = d.total > 0 ? Math.round((d.vl_suppressed / d.total) * 100) : 0;
        if (isSevereUnderweight) d.severe_underweight += 1;
        if (isModerateUnderweight) d.moderate_underweight += 1;
        if (isNormalNutrition) d.normal_nutrition += 1;
        if (isSevereAnemia) d.severe_anemia += 1;
        if (isModerateAnemia) d.moderate_anemia += 1;
        if (isEnrolled) d.school_enrolled += 1;
        else d.out_of_school += 1;
        d.grant_amount += grant;
        if (isOrphan) d.orphans += 1;
      });
    }

    // Roll up to state level
    Object.values(districts).forEach((d) => {
      const stateKey = normalizeGeographicKey(d.state);
      if (!states[stateKey]) {
        states[stateKey] = {
          name: d.state,
          state: d.state,
          total: 0,
          vl_suppressed: 0,
          vl_unsuppressed: 0,
          suppression_rate: 0,
          severe_underweight: 0,
          moderate_underweight: 0,
          normal_nutrition: 0,
          severe_anemia: 0,
          moderate_anemia: 0,
          school_enrolled: 0,
          out_of_school: 0,
          grant_amount: 0,
          orphans: 0,
        };
      }
      const s = states[stateKey];
      s.total += d.total;
      s.vl_suppressed += d.vl_suppressed;
      s.vl_unsuppressed += d.vl_unsuppressed;
      s.severe_underweight += d.severe_underweight;
      s.moderate_underweight += d.moderate_underweight;
      s.normal_nutrition += d.normal_nutrition;
      s.severe_anemia += d.severe_anemia;
      s.moderate_anemia += d.moderate_anemia;
      s.school_enrolled += d.school_enrolled;
      s.out_of_school += d.out_of_school;
      s.grant_amount += d.grant_amount;
      s.orphans += d.orphans;
      s.suppression_rate = s.total > 0 ? Math.round((s.vl_suppressed / s.total) * 100) : 0;
    });

    return { districts, states };
  }, [liveSubmissions, activeCategory, educationStatus, orphanStatus]);

  // Available states
  const availableStates = useMemo(() => {
    return Object.values(compiledData.states)
      .map((s) => s.name)
      .sort();
  }, [compiledData]);

  // Available districts
  const availableDistricts = useMemo(() => {
    const list = Object.values(compiledData.districts);
    if (selectedState) {
      const stateNorm = normalizeGeographicKey(selectedState);
      return list
        .filter((d) => normalizeGeographicKey(d.state) === stateNorm)
        .map((d) => d.name)
        .sort();
    }
    return list.map((d) => d.name).sort();
  }, [compiledData, selectedState]);

  const activeMetricMeta = useMemo(() => {
    return INDICATORS.find((i) => i.key === activeMetric) || INDICATORS[0];
  }, [activeMetric]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 text-slate-800 relative font-sans">
      {/* ── Ultra-thin Sleek Command Bar (Space-compatible, no blue tint, complete map visible) ── */}
      <header className="shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 z-40 shadow-xs text-xs">
        {/* Left: Exit to Supervisor Portal */}
        <div className="flex items-center space-x-2">
          <Link
            href="/supervisor"
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-teal-700" />
            <span>Supervisor Portal</span>
          </Link>
        </div>

        {/* Center: Filters & Metric Selectors */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          {/* 1. Category Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-white text-slate-800">
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* 2. State Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            <select
              value={selectedState || ''}
              onChange={(e) => {
                setSelectedState(e.target.value || null);
                setSelectedDistrict(null);
              }}
              className="bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[130px]"
            >
              <option value="" className="bg-white text-slate-800">
                All-India (States)
              </option>
              {availableStates.map((st) => (
                <option key={st} value={st} className="bg-white text-slate-800">
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* 3. District Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            <select
              value={selectedDistrict || ''}
              disabled={availableDistricts.length === 0}
              onChange={(e) => setSelectedDistrict(e.target.value || null)}
              className="bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer disabled:opacity-40 max-w-[140px]"
            >
              <option value="" className="bg-white text-slate-800">
                All Districts
              </option>
              {availableDistricts.map((dt) => (
                <option key={dt} value={dt} className="bg-white text-slate-800">
                  {dt}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Education Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <School className="w-3 h-3 text-slate-500 shrink-0" />
            <select
              value={educationStatus}
              onChange={(e) => setEducationStatus(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[130px]"
            >
              <option value="ALL" className="bg-white text-slate-800">
                All Education
              </option>
              <option value="Enrolled" className="bg-white text-slate-800">
                Enrolled
              </option>
              <option value="Government" className="bg-white text-slate-800">
                Govt School
              </option>
              <option value="Private" className="bg-white text-slate-800">
                Private School
              </option>
              <option value="Aided" className="bg-white text-slate-800">
                Aided School
              </option>
              <option value="Not In School" className="bg-white text-slate-800">
                Not in School
              </option>
            </select>
          </div>

          {/* 5. Orphan Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <HeartHandshake className="w-3 h-3 text-slate-500 shrink-0" />
            <select
              value={orphanStatus}
              onChange={(e) => setOrphanStatus(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer max-w-[130px]"
            >
              <option value="ALL" className="bg-white text-slate-800">
                All Orphan Status
              </option>
              <option value="Both parents alive" className="bg-white text-slate-800">
                Both Parents Alive
              </option>
              <option value="Single orphan" className="bg-white text-slate-800">
                Single Orphan
              </option>
              <option value="Double orphan" className="bg-white text-slate-800">
                Double Orphan
              </option>
            </select>
          </div>

          {/* 6. Indicator / Metric Selector */}
          <div className="flex items-center space-x-1 bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
            <Layers className="w-3 h-3 text-teal-700 shrink-0" />
            <select
              value={activeMetric}
              onChange={(e) => setActiveMetric(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-teal-900 focus:outline-none cursor-pointer max-w-[210px]"
            >
              {INDICATORS.map((ind) => (
                <option key={ind.key} value={ind.key} className="bg-white text-slate-800">
                  {ind.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: 3D Toggle & Reset (Text removed, fullscreen toggle removed) */}
        <div className="flex items-center space-x-1.5">
          {/* 3D Extrusion Toggle (Icon only, no text) */}
          <button
            type="button"
            onClick={() => setIs3DEnabled((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              is3DEnabled
                ? 'bg-teal-700 text-white border-teal-700 shadow-2xs'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800 hover:bg-slate-50'
            }`}
            title={is3DEnabled ? '3D Pillars Active (Click to switch to 2D)' : '2D Flat Active (Click to enable 3D)'}
          >
            <Box className="w-3.5 h-3.5" />
          </button>

          {/* Reset Filters */}
          {(selectedDistrict || selectedState || activeCategory !== 'all' || educationStatus !== 'ALL' || orphanStatus !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSelectedState(null);
                setSelectedDistrict(null);
                setActiveCategory('all');
                setEducationStatus('ALL');
                setOrphanStatus('ALL');
              }}
              className="flex items-center space-x-1 px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg text-[11px] font-medium transition-all cursor-pointer shadow-2xs"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Map Canvas (Fills entire screen) ── */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <GISMapComponent
          category={activeCategory}
          activeMetric={activeMetric}
          selectedState={selectedState}
          selectedDistrict={selectedDistrict}
          onSelectState={(st) => {
            setSelectedState(st);
            setSelectedDistrict(null);
          }}
          onSelectDistrict={setSelectedDistrict}
          is3DEnabled={is3DEnabled}
          data={compiledData}
          setTooltip={setTooltip}
        />

        {/* ── Interactive Hover Tooltip (Neutral/Light glass) ── */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-50 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl p-3.5 text-xs max-w-xs text-slate-800 animate-in fade-in zoom-in-95 duration-75"
            style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}
          >
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{tooltip.name}</h4>
                {tooltip.state && (
                  <p className="text-[10px] text-teal-700 font-semibold">{tooltip.state}</p>
                )}
              </div>
              <span className="text-[10px] font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                {CATEGORIES.find((c) => c.id === activeCategory)?.label}
              </span>
            </div>

            {tooltip.metrics ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <span className="text-slate-500 text-[11px] font-medium">
                    {activeMetricMeta.label.split('.')[1] || activeMetricMeta.label}:
                  </span>
                  <span className="font-extrabold text-teal-800 text-sm">
                    {activeMetric === 'grant_amount'
                      ? `₹${Number(tooltip.metrics[activeMetric] || 0).toLocaleString('en-IN')}`
                      : activeMetric.includes('rate')
                      ? `${tooltip.metrics[activeMetric] || 0}%`
                      : Number(tooltip.metrics[activeMetric] || 0).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="block text-[10px] text-slate-400">Total Evaluated</span>
                    <span className="font-bold text-slate-900 text-xs">{tooltip.metrics.total}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="block text-[10px] text-slate-400">VL Suppressed</span>
                    <span className="font-bold text-emerald-700 text-xs">
                      {tooltip.metrics.suppression_rate}% ({tooltip.metrics.vl_suppressed})
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="block text-[10px] text-slate-400">Severe Stunting</span>
                    <span className="font-bold text-rose-700 text-xs">
                      {tooltip.metrics.severe_underweight} Cases
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="block text-[10px] text-slate-400">Severe Anemia</span>
                    <span className="font-bold text-amber-700 text-xs">
                      {tooltip.metrics.severe_anemia} Cases
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 italic text-center py-2 text-xs">No survey records in this sector.</p>
            )}
          </div>
        )}

        {/* ── Bottom-Right Floating Legend (Neutral Light Glass) ── */}
        <div className="absolute bottom-4 right-4 z-30 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3 py-2 shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            {activeMetricMeta.label}
          </p>
          <div className="flex items-center space-x-2">
            <div
              className={`w-24 h-2 rounded-full ${
                ['vl_unsuppressed', 'severe_underweight', 'severe_anemia', 'out_of_school'].includes(
                  activeMetric
                )
                  ? 'bg-gradient-to-r from-amber-300 to-rose-600'
                  : 'bg-gradient-to-r from-teal-200 via-teal-500 to-emerald-700'
              }`}
            />
            <span className="text-[10px] text-slate-500 font-semibold">Low → High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
