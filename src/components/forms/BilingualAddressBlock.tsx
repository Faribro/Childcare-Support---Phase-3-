import React, { useState } from 'react';
import { INDIAN_STATES_AND_UTS } from '@/lib/constants/indianStates';
import { getDistrictsForState, validatePinCodeMatch } from '@/lib/constants/indianDistricts';
import { LocationFetchButton, type LocationResult } from '@/components/ui/LocationFetchButton';
import { MapPin, Phone, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';

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

  // Handle Location Fetch result
  const handleLocationFetched = (geo: LocationResult) => {
    const newlyFilled = new Set<string>();
    const updates: Partial<AddressFormData> = {};

    if (geo.state) {
      updates.state = geo.state;
      newlyFilled.add('state');
    }
    if (geo.district) {
      updates.district = geo.district;
      newlyFilled.add('district');
    }
    if (geo.pinCode) {
      updates.pinCode = geo.pinCode;
      newlyFilled.add('pinCode');
    }
    if (geo.villageCity) {
      updates.villageCity = geo.villageCity;
      newlyFilled.add('villageCity');
    }
    if (geo.talukMandalBlock) {
      updates.talukMandalBlock = geo.talukMandalBlock;
      newlyFilled.add('talukMandalBlock');
    }
    if (geo.street) {
      updates.street = geo.street;
      newlyFilled.add('street');
    }
    if (geo.doorAndColony) {
      updates.doorAndColony = geo.doorAndColony;
      newlyFilled.add('doorAndColony');
    }

    setAutoFilledFields((prev) => new Set([...Array.from(prev), ...Array.from(newlyFilled)]));
    onChange(updates);
  };

  // Handle Pin Code validation on blur / entry
  const handlePinCodeChange = (raw: string) => {
    const val = raw.replace(/\D/g, '').slice(0, 6);
    onChange({ pinCode: val });

    if (val.length === 6 && data.state) {
      const match = validatePinCodeMatch(val, data.state);
      if (!match.valid && match.message) {
        setPinCodeWarning(match.message);
      } else {
        setPinCodeWarning(null);
      }
    } else {
      setPinCodeWarning(null);
    }
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
      {/* Top Action Bar: Header + Fetch Live Address Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-purple-100">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Residential Address / आवासीय पता</span>
            <span className="text-xs font-normal text-slate-500">(Paper Form A12)</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter physical residence details or fetch live GNSS location.
          </p>
        </div>
        <LocationFetchButton onLocationFetched={handleLocationFetched} />
      </div>

      {/* Field 1: Type of Residence (Owned / Rented / Others) */}
      <div className="space-y-1.5" id="q-residence-type">
        <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
          Type of Residence / आवास का प्रकार <span className="text-rose-500">*</span>
          {isAutoFilled('residenceType') && (
            <span className="ml-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              Please verify
            </span>
          )}
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { value: 'Owned', labelEn: '1. Owned', labelHi: 'स्वामित्व' },
            { value: 'Rented', labelEn: '2. Rented', labelHi: 'किराए पर' },
            { value: 'Others', labelEn: '3. Others', labelHi: 'अन्य' },
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
                className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50/80 text-purple-950 font-bold shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <span className="text-xs sm:text-sm font-semibold">{opt.labelEn}</span>
                <span className="text-[11px] text-slate-500">{opt.labelHi}</span>
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
        <span className="text-[11px] text-slate-500 block -mt-1">
          दरवाजा संख्या / वार्ड संख्या / घर का नाम / कॉलोनी / अपार्टमेंट
        </span>
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
            Street / सड़क <span className="text-rose-500">*</span>
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

      {/* Row 4: Village / City AND Taluk / Mandal / Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Village / City */}
        <div className="space-y-1.5" id="q-village-city">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-village-city" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Village / City / गांव/शहर <span className="text-rose-500">*</span>
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
            placeholder="e.g. Pune"
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

        {/* Taluk / Mandal / Block */}
        <div className="space-y-1.5" id="q-taluk-block">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-taluk-block" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Taluk / Mandal / Block / तालुक/मंडल/ब्लॉक <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('talukMandalBlock') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <input
            id="addr-taluk-block"
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
            placeholder="e.g. Haveli"
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

      {/* Field 5: Landmark (Optional) */}
      <div className="space-y-1.5" id="q-landmark">
        <label htmlFor="addr-landmark" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
          Landmark / पहचान चिन्ह <span className="text-slate-400 font-normal lowercase">(optional)</span>
        </label>
        <input
          id="addr-landmark"
          type="text"
          value={data.landmark}
          onChange={(e) => onChange({ landmark: e.target.value })}
          placeholder="e.g. Near Zilla Parishad School / Near Hanuman Mandir"
          className="w-full h-11 px-3 text-sm text-slate-900 bg-white border border-slate-300 rounded-xl transition-all shadow-2xs focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-200"
        />
      </div>

      {/* Row 6: State AND District (Dropdowns, EMPTY by default) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* State Dropdown */}
        <div className="space-y-1.5" id="q-state">
          <div className="flex items-center justify-between">
            <label htmlFor="demographics-state" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              State / राज्य <span className="text-rose-500">*</span>
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
              const newState = e.target.value;
              setAutoFilledFields((prev) => {
                const next = new Set(prev);
                next.delete('state');
                return next;
              });
              onChange({ state: newState, district: '' });
            }}
            className={`w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer ${
              errors['demographics-state']
                ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          >
            <option value="">-- Select State / राज्य चुनें --</option>
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

        {/* District Dropdown (Dependent on State, Non-blocking advisory) */}
        <div className="space-y-1.5" id="q-district">
          <div className="flex items-center justify-between">
            <label htmlFor="demographics-district" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              District / जिला <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('district') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <select
            id="demographics-district"
            value={data.district}
            disabled={!data.state}
            onChange={(e) => {
              setAutoFilledFields((prev) => {
                const next = new Set(prev);
                next.delete('district');
                return next;
              });
              onChange({ district: e.target.value });
            }}
            className={`w-full h-11 px-3 text-sm font-medium text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 ${
              errors['demographics-district']
                ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          >
            <option value="">
              {!data.state ? '-- Select state first --' : '-- Select District / जिला चुनें --'}
            </option>
            {availableDistricts.map((dst) => (
              <option key={dst} value={dst}>
                {dst}
              </option>
            ))}
          </select>
          {errors['demographics-district'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-district']}
            </p>
          )}
        </div>
      </div>

      {/* Row 7: Pin Code AND Contact Number */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pin Code (6 digits) */}
        <div className="space-y-1.5" id="q-pincode">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-pincode" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Pin Code / पिन कोड <span className="text-rose-500">*</span>
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
            maxLength={6}
            value={data.pinCode}
            onChange={(e) => handlePinCodeChange(e.target.value)}
            placeholder="e.g. 411001"
            className={`w-full h-11 px-3 text-sm font-mono text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none ${
              errors['demographics-pinCode']
                ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
            }`}
          />
          {errors['demographics-pinCode'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-pinCode']}
            </p>
          )}
          {pinCodeWarning && !errors['demographics-pinCode'] && (
            <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{pinCodeWarning}</span>
            </p>
          )}
        </div>

        {/* Contact Number (10-digit mobile + No phone available checkbox) */}
        <div className="space-y-1.5" id="q-contact-number">
          <div className="flex items-center justify-between">
            <label htmlFor="addr-contact" className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
              Contact Number / संपर्क नंबर <span className="text-rose-500">*</span>
            </label>
            {isAutoFilled('contactNumber') && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Please verify
              </span>
            )}
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
              +91
            </div>
            <input
              id="addr-contact"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              disabled={data.noPhoneAvailable}
              value={data.contactNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                onChange({ contactNumber: val });
              }}
              placeholder={data.noPhoneAvailable ? 'No phone available' : 'e.g. 9822012345'}
              className={`w-full h-11 pl-11 pr-3 text-sm font-mono text-slate-900 bg-white border rounded-xl transition-all shadow-2xs focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 ${
                errors['demographics-contactNumber']
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200'
              }`}
            />
          </div>
          {errors['demographics-contactNumber'] && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {errors['demographics-contactNumber']}
            </p>
          )}

          {/* No phone available toggle */}
          <div className="pt-1 flex items-center gap-2">
            <input
              id="no-phone-checkbox"
              type="checkbox"
              checked={!!data.noPhoneAvailable}
              onChange={(e) => {
                const checked = e.target.checked;
                onChange({
                  noPhoneAvailable: checked,
                  contactNumber: checked ? '' : data.contactNumber,
                });
              }}
              className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
            />
            <label htmlFor="no-phone-checkbox" className="text-xs text-slate-700 cursor-pointer select-none">
              No phone available / फोन उपलब्ध नहीं है
            </label>
          </div>

          {/* Alternate Contact Field if no phone */}
          {data.noPhoneAvailable && (
            <div className="pt-2">
              <label htmlFor="addr-alt-contact" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block mb-1">
                Alternate Contact Number / वैकल्पिक संपर्क नंबर (Optional)
              </label>
              <input
                id="addr-alt-contact"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={data.alternateContactNumber || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  onChange({ alternateContactNumber: val });
                }}
                placeholder="Neighbor / Relative 10-digit number"
                className="w-full h-10 px-3 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
