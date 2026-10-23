import { describe, it, expect } from 'vitest';
import {
  classifyVLCategoryPolicy,
  VIRAL_LOAD_POLICY_METADATA,
} from '../lib/clinical/viralLoadPolicy';
import {
  isCurrentRegimenApplicable,
  getRegimenUIConfig,
  getArtInitiationConfig,
  getArtIdConfig,
  validateArtDependencyState,
} from '../lib/clinical/artStatusLogic';
import {
  NACO_ART_REGIMEN_CATALOGUE,
  searchRegimens,
  findRegimenByCodeOrName,
  REGIMEN_CATALOGUE_METADATA,
} from '../lib/clinical/artRegimenCatalogue';

describe('Forms Clinical Corrections & Viral Load / ART Policy Suite', () => {
  describe('1. Viral Load Policy & Boundary Resolution', () => {
    it('correctly resolves the exact 1000 copies/mL threshold under NACO strict policy', () => {
      // 999 is strictly < 1000
      const res999 = classifyVLCategoryPolicy({ viralLoad: '999', vlStatus: 'Tested in last 6 months' });
      expect(res999.vlCategory).toBe('Suppressed (<1000 copies/mL)');
      expect(res999.isSuppressed).toBe(true);
      expect(res999.isUnsuppressed).toBe(false);

      // Exact 1000 is >= 1000 under NACO standard
      const res1000 = classifyVLCategoryPolicy({ viralLoad: '1000', vlStatus: 'Tested in last 6 months' });
      expect(res1000.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
      expect(res1000.isSuppressed).toBe(false);
      expect(res1000.isUnsuppressed).toBe(true);

      // 1001 is >= 1000
      const res1001 = classifyVLCategoryPolicy({ viralLoad: '1001', vlStatus: 'Tested in last 6 months' });
      expect(res1001.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
      expect(res1001.isUnsuppressed).toBe(true);
    });

    it('supports WHO <= 1000 policy when explicitly selected', () => {
      const res1000Who = classifyVLCategoryPolicy({
        viralLoad: '1000',
        vlStatus: 'Tested in last 6 months',
        thresholdBoundary: 'WHO_LESS_OR_EQUAL',
      });
      expect(res1000Who.vlCategory).toBe('Suppressed (<1000 copies/mL)');
      expect(res1000Who.isSuppressed).toBe(true);

      const res1001Who = classifyVLCategoryPolicy({
        viralLoad: '1001',
        vlStatus: 'Tested in last 6 months',
        thresholdBoundary: 'WHO_LESS_OR_EQUAL',
      });
      expect(res1001Who.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
      expect(res1001Who.isUnsuppressed).toBe(true);
    });

    it('treats a genuine numeric zero (0 copies/mL) as Undetectable without fabricating or erasing string', () => {
      const resZero = classifyVLCategoryPolicy({ viralLoad: '0', vlStatus: 'Tested in last 6 months' });
      expect(resZero.vlCategory).toBe('Undetectable (<50 copies/mL)');
      expect(resZero.isUndetectable).toBe(true);
      expect(resZero.isSuppressed).toBe(true);
      expect(resZero.rawReportedValue).toBe('0');
      // Crucial: Raw value must remain '0', not converted to 'Not detected' or empty
      expect(resZero.rawReportedValue).not.toBe('');
      expect(resZero.rawReportedValue).not.toBe('Not detected');
    });

    it('classifies explicit "Not detected", "TND", "Target Not Detected" as Undetectable', () => {
      const inputs = ['Not detected', 'Target Not Detected', 'TND', 'undetectable'];
      for (const input of inputs) {
        const res = classifyVLCategoryPolicy({ viralLoad: input, vlStatus: 'Tested in last 6 months' });
        expect(res.vlCategory).toBe('Undetectable (<50 copies/mL)');
        expect(res.isUndetectable).toBe(true);
        expect(res.isSuppressed).toBe(true);
        expect(res.rawReportedValue).toBe(input);
      }
    });

    it('classifies qualified values by bound analysis without float coercion errors', () => {
      // Bound <= 50 -> Undetectable
      const resLt50 = classifyVLCategoryPolicy({ viralLoad: '< 50', vlStatus: 'Tested in last 6 months' });
      expect(resLt50.vlCategory).toBe('Undetectable (<50 copies/mL)');
      expect(resLt50.isUndetectable).toBe(true);

      const resLt20 = classifyVLCategoryPolicy({ viralLoad: '<20', vlStatus: 'Tested in last 6 months' });
      expect(resLt20.vlCategory).toBe('Undetectable (<50 copies/mL)');
      expect(resLt20.isUndetectable).toBe(true);

      // Bound <= 1000 -> Suppressed (<1000 copies/mL), NOT Undetectable
      const resLt200 = classifyVLCategoryPolicy({ viralLoad: '< 200', vlStatus: 'Tested in last 6 months' });
      expect(resLt200.vlCategory).toBe('Suppressed (<1000 copies/mL)');
      expect(resLt200.isSuppressed).toBe(true);
      expect(resLt200.isUndetectable).toBe(false);

      const resLt1000 = classifyVLCategoryPolicy({ viralLoad: '< 1000', vlStatus: 'Tested in last 6 months' });
      expect(resLt1000.vlCategory).toBe('Suppressed (<1000 copies/mL)');
      expect(resLt1000.isSuppressed).toBe(true);

      // Bound >= 1000 -> Unsuppressed
      const resGt1000 = classifyVLCategoryPolicy({ viralLoad: '> 1000', vlStatus: 'Tested in last 6 months' });
      expect(resGt1000.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
      expect(resGt1000.isUnsuppressed).toBe(true);

      const resGt5000 = classifyVLCategoryPolicy({ viralLoad: '> 5000', vlStatus: 'Tested in last 6 months' });
      expect(resGt5000.vlCategory).toBe('Unsuppressed (≥1000 copies/mL)');
      expect(resGt5000.isUnsuppressed).toBe(true);

      // Indeterminate bound: > 200 cannot prove suppression
      const resGt200 = classifyVLCategoryPolicy({ viralLoad: '> 200', vlStatus: 'Tested in last 6 months' });
      expect(resGt200.vlCategory).toBe('Unknown / Pending');
      expect(resGt200.confidence).toBe('INDETERMINATE');

      // Indeterminate bound: < 5000 cannot prove suppression < 1000
      const resLt5000 = classifyVLCategoryPolicy({ viralLoad: '< 5000', vlStatus: 'Tested in last 6 months' });
      expect(resLt5000.vlCategory).toBe('Unknown / Pending');
      expect(resLt5000.confidence).toBe('INDETERMINATE');
    });

    it('never coerces missing or unknown values to zero', () => {
      const resEmpty = classifyVLCategoryPolicy({ viralLoad: '', vlStatus: 'Tested in last 6 months' });
      expect(resEmpty.vlCategory).toBe('Unknown / Pending');
      expect(resEmpty.isSuppressed).toBe(false);
      expect(resEmpty.rawReportedValue).toBe('');

      const resUndefined = classifyVLCategoryPolicy({ viralLoad: undefined, vlStatus: 'Tested in last 6 months' });
      expect(resUndefined.vlCategory).toBe('Unknown / Pending');
      expect(resUndefined.isSuppressed).toBe(false);

      const resPending = classifyVLCategoryPolicy({ viralLoad: '', vlStatus: 'Awaiting results' });
      expect(resPending.vlCategory).toBe('Unknown / Pending');
      expect(resPending.displayBadge).toBe('Awaiting Results');
      expect(resPending.isPending).toBe(true);
      expect(resPending.isSuppressed).toBe(false);
    });

    it('never treats "Not tested" as suppressed', () => {
      const resNotTested = classifyVLCategoryPolicy({ viralLoad: '300', vlStatus: 'Not tested' });
      expect(resNotTested.vlCategory).toBe('Unknown / Pending');
      expect(resNotTested.displayBadge).toBe('Not Tested');
      expect(resNotTested.isNotTested).toBe(true);
      expect(resNotTested.isSuppressed).toBe(false);
    });

    it('rejects negative numbers and malformed strings without coercing to zero', () => {
      const resNeg = classifyVLCategoryPolicy({ viralLoad: '-25', vlStatus: 'Tested in last 6 months' });
      expect(resNeg.vlCategory).toBe('Unknown / Pending');
      expect(resNeg.displayBadge).toBe('Invalid Negative');
      expect(resNeg.isSuppressed).toBe(false);

      const resMalformed = classifyVLCategoryPolicy({ viralLoad: 'Positive / detected', vlStatus: 'Tested in last 6 months' });
      expect(resMalformed.vlCategory).toBe('Unknown / Pending');
      expect(resMalformed.isSuppressed).toBe(false);
    });
  });

  describe('2. ART Status Dependency Logic', () => {
    it('configures "On ART" with current active regimen mode', () => {
      expect(isCurrentRegimenApplicable('On ART')).toBe(true);

      const config = getRegimenUIConfig('On ART');
      expect(config.mode).toBe('CURRENT_REGIMEN');
      expect(config.isApplicable).toBe(true);
      expect(config.isCurrentMedication).toBe(true);
      expect(config.label).toBe('Current Prescribed ART Regimen');

      const initConfig = getArtInitiationConfig('On ART');
      expect(initConfig.isHistorical).toBe(false);

      const idConfig = getArtIdConfig('On ART');
      expect(idConfig.isHistorical).toBe(false);

      const validation = validateArtDependencyState({ artStatus: 'On ART', artMedicineType: '' });
      expect(validation.valid).toBe(false);
      expect(validation.errors.artMedicineType).toBeDefined();
    });

    it('configures "Not on ART" with not applicable explanation and preserves historical state', () => {
      expect(isCurrentRegimenApplicable('Not on ART')).toBe(false);

      const config = getRegimenUIConfig('Not on ART');
      expect(config.mode).toBe('NOT_APPLICABLE');
      expect(config.isApplicable).toBe(false);
      expect(config.isCurrentMedication).toBe(false);
      expect(config.disabledExplanation).toContain('Not applicable while not on ART');

      // Does not require current medicine
      const validation = validateArtDependencyState({ artStatus: 'Not on ART', artMedicineType: '' });
      expect(validation.valid).toBe(true);
      expect(validation.errors.artMedicineType).toBeUndefined();
    });

    it('configures "Defaulted / Interrupted" with historical / prior regimen mode', () => {
      expect(isCurrentRegimenApplicable('Defaulted / Interrupted')).toBe(false);

      const config = getRegimenUIConfig('Defaulted / Interrupted');
      expect(config.mode).toBe('HISTORICAL_REGIMEN');
      expect(config.isApplicable).toBe(true);
      expect(config.isCurrentMedication).toBe(false);
      expect(config.label).toContain('Prior');
      expect(config.helpText).toContain('not currently being taken');

      const initConfig = getArtInitiationConfig('Defaulted / Interrupted');
      expect(initConfig.isHistorical).toBe(true);
    });

    it('handles "Transferred In" with minimal confirmation of current ART use', () => {
      // Without confirmation -> historical
      expect(isCurrentRegimenApplicable('Transferred In', false)).toBe(false);
      const configUnconfirmed = getRegimenUIConfig('Transferred In', false);
      expect(configUnconfirmed.mode).toBe('HISTORICAL_REGIMEN');
      expect(configUnconfirmed.isCurrentMedication).toBe(false);

      // With confirmation (Yes / true) -> current regimen
      expect(isCurrentRegimenApplicable('Transferred In', true)).toBe(true);
      expect(isCurrentRegimenApplicable('Transferred In', 'Yes')).toBe(true);
      const configConfirmed = getRegimenUIConfig('Transferred In', 'Yes');
      expect(configConfirmed.mode).toBe('CURRENT_REGIMEN');
      expect(configConfirmed.isCurrentMedication).toBe(true);
    });
  });

  describe('3. Searchable ART Regimen Catalogue', () => {
    it('contains all essential NACO pediatric and adult regimens with documented metadata', () => {
      expect(NACO_ART_REGIMEN_CATALOGUE.length).toBeGreaterThanOrEqual(12);
      expect(REGIMEN_CATALOGUE_METADATA.version).toBe('NACO-ART-2023.1');
      expect(REGIMEN_CATALOGUE_METADATA.offlineAvailable).toBe(true);

      const tld = findRegimenByCodeOrName('TLD');
      expect(tld).toBeDefined();
      expect(tld?.line).toBe('First-line');

      const pdtg = findRegimenByCodeOrName('pDTG');
      expect(pdtg).toBeDefined();
      expect(pdtg?.line).toBe('First-line Pediatric');

      const other = findRegimenByCodeOrName('OTHER');
      expect(other).toBeDefined();

      const unknown = findRegimenByCodeOrName('UNKNOWN');
      expect(unknown).toBeDefined();
    });

    it('searches regimens accurately by abbreviations, names, and population tokens', () => {
      const searchTLD = searchRegimens('tld');
      expect(searchTLD.some((r) => r.code === 'TLD')).toBe(true);

      const searchPediatric = searchRegimens('pediatric');
      expect(searchPediatric.some((r) => r.code === 'pDTG_ABC_3TC')).toBe(true);

      const searchKaletra = searchRegimens('kaletra');
      expect(searchKaletra.some((r) => r.code === 'ABC_3TC_LPVr')).toBe(true);

      const searchSecondLine = searchRegimens('second-line');
      expect(searchSecondLine.length).toBeGreaterThanOrEqual(2);
    });
  });
});
