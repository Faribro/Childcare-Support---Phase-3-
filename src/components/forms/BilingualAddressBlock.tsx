'use client';

import React, { useState } from 'react';
import { INDIAN_STATES_AND_UTS } from '@/lib/constants/indianStates';
import { getDistrictsForState, validatePinCodeMatch } from '@/lib/constants/indianDistricts';
import { lookupPincode } from '@/lib/constants/pincodeDirectory';
import { LocationFetchButton, type LocationResult } from '@/components/ui/LocationFetchButton';
import { Phone, Building2, AlertCircle } from 'lucide-react';

export interface AddressFormData {
  residenceType: 'Owned' | 'Rented' | 'Others' | '';
  doorAndColony: string;
  street: string;
  villageCity: string;
  talukMandalBlock: string;
  landmark: string;
  state: string;
  district: string;
  pinCode: string;
  contactNumber: string;
  noPhoneAvailable?: boolean;
  alternateContactNumber?: string;
}

interface BilingualAddressBlockProps {
  data: AddressFormData;
  onChange: (updates: Partial<AddressFormData>) => void;
  errors?: Record<string, string | undefined>;
}

export function BilingualAddressBlock({
  data,
  onChange,
  errors = {},
}: BilingualAddressBlockProps) {
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [pinCodeWarning, setPinCodeWarning] = useState<string | null>(null);

  // Available districts for the currently selected state
  const availableDistricts = data.state ? getDistrictsForState(data.state) : [];

  // ── 5. Progressive Hydration: Fill pincode/state/district first, then street/village ──
  const handleProgressiveFill = (partial: Partial<LocationResult>, stage: 'postal' | 'full') => {
    const newlyFilled = new Set<string>();
    const updates: Partial<AddressFormData> = {};

    if (stage === 'postal') {
      if (partial.pinCode) {
        updates.pinCode = partial.pinCode;
        newlyFilled.add('pinCode');
      }
      if (partial.state) {
        updates.state = partial.state;
        newlyFilled.add('state');
      }
      if (partial.district) {
        updates.district = partial.district;
        newlyFilled.add('district');
      }
      if (partial.talukMandalBlock) {
        updates.talukMandalBlock = partial.talukMandalBlock;
        newlyFilled.add('talukMandalBlock');
      }
    } else {
      if (partial.doorAndColony) {
        updates.doorAndColony = partial.doorAndColony;
        newlyFilled.add('doorAndColony');
      }
      if (partial.street) {
        updates.street = partial.street;
        newlyFilled.add('street');
      }
      if (partial.villageCity) {
        updates.villageCity = partial.villageCity;
        newlyFilled.add('villageCity');
      }
      if (partial.landmark) {
        updates.landmark = partial.landmark;
        newlyFilled.add('landmark');
      }
    }

    setAutoFilledFields((prev) => new Set([...Array.from(prev), ...Array.from(newlyFilled)]));
    onChange(updates);
  };

  // Full location fetched callback
  const handleLocationFetched = (geo: LocationResult) => {
    const newlyFilled = new Set<string>();
    const updates: Partial<AddressFormData> = {};

    if (geo.state && !data.state) {
      updates.state = geo.state;
      newlyFilled.add('state');
    }
    if (geo.district && !data.district) {
      updates.district = geo.district;
      newlyFilled.add('district');
    }
    if (geo.pinCode && !data.pinCode) {
      updates.pinCode = geo.pinCode;
      newlyFilled.add('pinCode');
    }
    if (geo.villageCity && !data.villageCity) {
      updates.villageCity = geo.villageCity;
      newlyFilled.add('villageCity');
    }
    if (geo.talukMandalBlock && !data.talukMandalBlock) {
      updates.talukMandalBlock = geo.talukMandalBlock;
      newlyFilled.add('talukMandalBlock');
    }
    if (geo.street && !data.street) {
      updates.street = geo.street;
      newlyFilled.add('street');
    }
    if (geo.doorAndColony && !data.doorAndColony) {
      updates.doorAndColony = geo.doorAndColony;
      newlyFilled.add('doorAndColony');
    }

    setAutoFilledFields((prev) => new Set([...Array.from(prev), ...Array.from(newlyFilled)]));
    onChange(updates);
  };

  // ── 4. Instant Pincode -> { taluk, district, state } Lookup on entry ──
  const handlePinCodeChange = (raw: string) => {
    const val = raw.replace(/\D/g, '').slice(0, 6);
    const updates: Partial<AddressFormData> = { pinCode: val };

    if (val.length === 6) {
      const resolved = lookupPincode(val);
      if (resolved) {
        if (resolved.state && !data.state) {
          updates.state = resolved.state;
          setAutoFilledFields((prev) => new Set([...Array.from(prev), 'state']));
        }
        if (resolved.district && !data.district) {
          updates.district = resolved.district;
          setAutoFilledFields((prev) => new Set([...Array.from(prev), 'district']));
        }
        if (resolved.taluk && !data.talukMandalBlock) {
          updates.talukMandalBlock = resolved.taluk;
          setAutoFilledFields((prev) => new Set([...Array.from(prev), 'talukMandalBlock']));
        }
      }

      const activeState = updates.state || data.state;
      if (activeState) {
        const match = validatePinCodeMatch(val, activeState);
        if (!match.valid && match.message) {
          setPinCodeWarning(match.message);
        } else {
          setPinCodeWarning(null);
        }
      }
    } else {
      setPinCodeWarning(null);
    }

    onChange(updates);
  };

  const isAutoFilled = (field: string) => autoFilledFields.has(field);

  return (
    <div className="space-y-6" id="demographics-fullAddress">
      {/* Hidden canonical address input for backward compatibility & test registry */}
      <input
        type="hidden"
        id="demographics-fullAddress-input"
        name="fullAddress"
        value={data.doorAndColony ? `${data.doorAndColony}, ${data.street}` : ''}
      />

      {/* Top Header Bar with Compact Right-Aligned Location Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-purple-100">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Residential Address</span>
            <span className="text-xs font-normal text-slate-500">(Paper Form A12)</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter physical residence details or fetch live GNSS location.
          </p>
        </div>
        <LocationFetchButton
          onLocationFetched={handleLocationFetched}
          onProgressiveFill={handleProgressiveFill}
        />
      </div>

      {/* Field 1: Type of Residence (Owned / Rented / Others) */}
      <div className="space-y-1.5" id="q-residence-type">
        <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
          Type of Residence <span className="text-rose-500">*</span>
          {isAutoFilled('residenceType') && (
            <span className="ml-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Please verify
            </span>
          )}
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { value: 'Owned', label: '1. Owned' },
            { value: 'Rented', label: '2. Rented' },
            { value: 'Others', label: '3. Others' },
          ].map((opt) => {
            const isSelected = data.residenceType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setAutoFilledFields((prev) => {
                    const next = new Set(prev);
                    next.delete('residenceType');
                    return next;
                  });
                  onChange({ residenceType: opt.value as any });
                }}
                className={`flex items-center justify-center py-2.5 px-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50/80 text-purple-950 font-bold shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <span className="text-xs sm:text-sm font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>
        {errors['demographics-residenceType'] && (
          <p role="alert" className="text-xs font-semibold text-rose-600">
            {errors['demographics-residenceType']}
          </p>
        )}
      </div>

      {/* Field 2: Door No / Ward No / House Name / Colony / Apartment */}
      <div className="space-y-1.5" id="q-door-colony">
        <div className="flex items-center justify-between">
          <label htmlFor="addr-door-colony" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
            Door No / Ward No / House Name / Colony / Apartment <span className="text-rose-500">*</span>
          </label>
          {isAutoFilled('doorAndColony') && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Please verify
            </span>
          )}
        </div>
        <input
          id="addr-door-colony"
          type="text"
          value={data.doorAndColony}
          onChange={(e) => {
            setAutoFilledFields((prev) => {
              const next = new Set(prev);
              next.delete('doorAndColony');
              return next;
            });
            onChange({ doorAndColony: e.target.value });
          }}
          placeholder="e.g. Flat 302, Vardhaman Apts, Ward 12"
          className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
            errors['demographics-doorAndColony']
              ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
              : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
          }`}
        />
        {errors['demographics-doorAndColony'] && (
          <p role="alert" className="text-xs font-semibold text-rose-600">
            {errors['demographics-doorAndColony']}
          </p>
        )}
      </div>

      {/* Field 3: Street */}
      <div className="space-y-1.5" id="q-street">
        <div className="flex items-center justify-between">
          <label htmlFor="addr-street" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
            Street <span className="text-rose-500">*</span>
          </label>
          {isAutoFilled('street') && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Please verify
            </span>
          )}
        </div>
        <input
          id="addr-street"
          type="text"
          value={data.street}
          onChange={(e) => {
            setAutoFilledFields((prev) => {
              const next = new Set(prev);
              next.delete('street');
              return next;
            });
            onChange({ street: e.target.value });
          }}
          placeholder="e.g. Mahatma Gandhi Road"
          className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
            errors['demographics-street']
              ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
              : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
          }`}
        />
        {errors['demographics-street'] && (
          <p role="alert" className="text-xs font-semibold text-rose-600">
            {errors['demographics-street']}
          </p>
        )}
      </div>

      {/* Grid: Village / City & Taluk / Mandal / Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Field 4: Village / City */}
        <div className="space-y-1.5" id="q-village-city">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-village-city" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Village / City <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('villageCity') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <input
            id="addr-village-city"
            type="text"
            value={data.villageCity}
            onChange={(e) => {
              setAutoFilledFields((prev) => {
                const next = new Set(prev);
                next.delete('villageCity');
                return next;
              });
              onChange({ villageCity: e.target.value });
            }}
            placeholder="e.g. Shivajinagar / Pune"
            className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
              errors['demographics-villageCity']
                ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          />
          {errors['demographics-villageCity'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-villageCity']}
            </p>
          )}
        </div>

        {/* Field 5: Taluk / Mandal / Block (Editable, left blank if not found) */}
        <div className="space-y-1.5" id="q-taluk-mandal-block">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-taluk" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Taluk / Mandal / Block <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('talukMandalBlock') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <input
            id="addr-taluk"
            type="text"
            value={data.talukMandalBlock}
            onChange={(e) => {
              setAutoFilledFields((prev) => {
                const next = new Set(prev);
                next.delete('talukMandalBlock');
                return next;
              });
              onChange({ talukMandalBlock: e.target.value });
            }}
            placeholder="e.g. Haveli / Pune City"
            className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
              errors['demographics-talukMandalBlock']
                ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          />
          {errors['demographics-talukMandalBlock'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-talukMandalBlock']}
            </p>
          )}
        </div>
      </div>

      {/* Field 6: Landmark (Optional) */}
      <div className="space-y-1.5" id="q-landmark">
        <div className="flex items-center justify-between">
          <label htmlFor="addr-landmark" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
            Landmark <span className="text-xs font-normal text-slate-400 normal-case">(Optional)</span>
          </label>
          {isAutoFilled('landmark') && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Please verify
            </span>
          )}
        </div>
        <input
          id="addr-landmark"
          type="text"
          value={data.landmark}
          onChange={(e) => {
            setAutoFilledFields((prev) => {
              const next = new Set(prev);
              next.delete('landmark');
              return next;
            });
            onChange({ landmark: e.target.value });
          }}
          placeholder="e.g. Near Primary Health Center / Opposite Water Tank"
          className="w-full h-11 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl transition-all shadow-2xs focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Grid: State & District */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Field 8: State (Empty by default) */}
        <div className="space-y-1.5" id="demographics-state-wrapper">
          <div className="flex items-center justify-between">
            <label htmlFor="demographics-state" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              State / Union Territory <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('state') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <select
            id="demographics-state"
            value={data.state}
            onChange={(e) => {
              const nextState = e.target.value;
              setAutoFilledFields((prev) => {
                const next = new Set(prev);
                next.delete('state');
                return next;
              });
              onChange({ state: nextState, district: '' });
            }}
            className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer ${
              errors['demographics-state']
                ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          >
            <option value="">Select State / UT...</option>
            {INDIAN_STATES_AND_UTS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          {errors['demographics-state'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-state']}
            </p>
          )}
        </div>

        {/* Field 7: District (LGD advisory dropdown dependent on State) */}
        <div className="space-y-1.5" id="demographics-district-wrapper">
          <div className="flex items-center justify-between">
            <label htmlFor="demographics-district" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              District <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('district') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          {availableDistricts.length > 0 ? (
            <select
              id="demographics-district"
              value={data.district}
              onChange={(e) => {
                setAutoFilledFields((prev) => {
                  const next = new Set(prev);
                  next.delete('district');
                  return next;
                });
                onChange({ district: e.target.value });
              }}
              className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer ${
                errors['demographics-district']
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
              }`}
            >
              <option value="">Select District...</option>
              {availableDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="demographics-district"
              type="text"
              value={data.district}
              onChange={(e) => onChange({ district: e.target.value })}
              placeholder={data.state ? 'Enter district name' : 'Select state first'}
              disabled={!data.state}
              className={`w-full h-11 px-3 text-sm text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
                errors['demographics-district']
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
              }`}
            />
          )}
          {errors['demographics-district'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-district']}
            </p>
          )}
        </div>
      </div>

      {/* Grid: Pin Code & Contact Number */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Field 9: Pin Code (6 digits) */}
        <div className="space-y-1.5" id="q-pincode">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-pincode" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Pin Code <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('pinCode') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <input
            id="addr-pincode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={data.pinCode}
            onChange={(e) => handlePinCodeChange(e.target.value)}
            placeholder="6-digit Indian PIN Code (e.g. 411001)"
            className={`w-full h-11 px-3 text-sm font-mono text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
              errors['demographics-pinCode'] || pinCodeWarning
                ? 'border-amber-400 focus:ring-2 focus:ring-amber-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          />
          {pinCodeWarning && (
            <p className="text-[11px] text-amber-700 flex items-center gap-1 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{pinCodeWarning}</span>
            </p>
          )}
          {errors['demographics-pinCode'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-pinCode']}
            </p>
          )}
        </div>

        {/* Field 10: Contact Number (10 digits) with no-phone checkbox */}
        <div className="space-y-1.5" id="demographics-contactNumber">
          <div className="flex items-center justify-between">
            <label htmlFor="demographics-contactNumber-input" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Contact Number <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('contactNumber') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-3 text-xs font-bold text-slate-400">+91</span>
            <input
              id="demographics-contactNumber-input"
              type="tel"
              maxLength={10}
              disabled={data.noPhoneAvailable}
              value={data.contactNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                onChange({ contactNumber: val });
              }}
              placeholder={data.noPhoneAvailable ? 'No phone available' : '10-digit mobile number'}
              className={`w-full h-11 pl-11 pr-3 text-sm font-mono text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
                data.noPhoneAvailable
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : errors['demographics-contactNumber']
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
              }`}
            />
          </div>

          {/* No phone available checkbox */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(data.noPhoneAvailable)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onChange({
                    noPhoneAvailable: checked,
                    contactNumber: checked ? '' : data.contactNumber,
                  });
                }}
                className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
              />
              <span>No phone available</span>
            </label>
          </div>

          {/* Alternate Contact Number (Optional if primary given, or required if no phone) */}
          <div className="pt-2">
            <label htmlFor="addr-alt-phone" className="text-[10.5px] font-medium text-slate-500 block mb-1">
              Alternate Contact Number <span className="text-slate-400">(Neighbour / Relative)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">+91</span>
              <input
                id="addr-alt-phone"
                type="tel"
                maxLength={10}
                value={data.alternateContactNumber || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  onChange({ alternateContactNumber: val });
                }}
                placeholder="Optional 10-digit number"
                className="w-full h-9 pl-11 pr-3 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:border-purple-600 focus:ring-1 focus:ring-purple-200"
              />
            </div>
          </div>

          {errors['demographics-contactNumber'] && !data.noPhoneAvailable && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-contactNumber']}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
