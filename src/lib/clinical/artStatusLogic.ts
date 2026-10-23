/**
 * ART-Status Dependency Logic
 *
 * Implements the clinical workflow rules for ART status transitions across
 * New Assessment, Draft Reload, and Record Edit flows, with matching server-side validation.
 *
 * Applicable Statuses:
 * 1. 'On ART'
 * 2. 'Not on ART'
 * 3. 'Defaulted / Interrupted'
 * 4. 'Transferred In'
 *
 * Invariants:
 * - Never silently erase historical data on status transitions.
 * - Do not present or report a medication as currently being taken when not on ART or interrupted.
 * - Retain laboratory history (Viral Load / CD4) independent of ART status.
 * - Transferred In requires minimal confirmation of current ART use to distinguish active vs historical regimen.
 */

import { ARTStatus } from '../../types/domain';

export type RegimenMode = 'CURRENT_REGIMEN' | 'HISTORICAL_REGIMEN' | 'NOT_APPLICABLE';

export interface RegimenUIConfig {
  mode: RegimenMode;
  label: string;
  fieldId: string;
  helpText: string;
  isApplicable: boolean;
  isCurrentMedication: boolean;
  disabledExplanation?: string;
}

export interface ArtInitiationConfig {
  label: string;
  isHistorical: boolean;
  helpText: string;
  isApplicable: boolean;
}

export interface ArtIdConfig {
  label: string;
  isHistorical: boolean;
  helpText: string;
  isApplicable: boolean;
}

/**
 * Determines whether a prescribed ART regimen is currently applicable as active medication.
 */
export function isCurrentRegimenApplicable(
  status: ARTStatus | string | undefined,
  currentlyOnArt?: boolean | string
): boolean {
  if (status === 'On ART') {
    return true;
  }
  if (status === 'Transferred In') {
    return currentlyOnArt === true || currentlyOnArt === 'Yes' || currentlyOnArt === 'true';
  }
  return false;
}

/**
 * Generates the UI and validation configuration for the ART regimen selector
 * based on the active ART status and transfer confirmation.
 */
export function getRegimenUIConfig(
  status: ARTStatus | string | undefined,
  currentlyOnArt?: boolean | string
): RegimenUIConfig {
  if (status === 'On ART') {
    return {
      mode: 'CURRENT_REGIMEN',
      label: 'Current Prescribed ART Regimen',
      fieldId: 'health-artMedicineType',
      helpText: 'Select or document the ART regimen currently prescribed to the child.',
      isApplicable: true,
      isCurrentMedication: true,
    };
  }

  if (status === 'Defaulted / Interrupted') {
    return {
      mode: 'HISTORICAL_REGIMEN',
      label: 'Last Known / Prior ART Regimen (Historical)',
      fieldId: 'health-artMedicineType',
      helpText: 'Document the medication regimen recorded prior to treatment interruption. This medication is not currently being taken.',
      isApplicable: true,
      isCurrentMedication: false,
    };
  }

  if (status === 'Transferred In') {
    const isTaking = currentlyOnArt === true || currentlyOnArt === 'Yes' || currentlyOnArt === 'true';
    if (isTaking) {
      return {
        mode: 'CURRENT_REGIMEN',
        label: 'Current Prescribed ART Regimen (At Receiving Centre)',
        fieldId: 'health-artMedicineType',
        helpText: 'Document the current regimen prescribed or continued at the receiving ART centre.',
        isApplicable: true,
        isCurrentMedication: true,
      };
    }
    return {
      mode: 'HISTORICAL_REGIMEN',
      label: 'Prior ART Regimen from Transferring Centre (Historical)',
      fieldId: 'health-artMedicineType',
      helpText: 'Prior regimen recorded on transfer slip. Not currently active at receiving centre.',
      isApplicable: true,
      isCurrentMedication: false,
    };
  }

  // 'Not on ART' or default
  return {
    mode: 'NOT_APPLICABLE',
    label: 'ART Regimen (Not Applicable)',
    fieldId: 'health-artMedicineType',
    helpText: 'Child is not currently on ART treatment.',
    isApplicable: false,
    isCurrentMedication: false,
    disabledExplanation: 'Not applicable while not on ART. (Prior historical regimen data, if any, is retained in storage).',
  };
}

/**
 * Configures the clinical treatment start date field ('artInitiationDate').
 * Explicitly separates treatment initiation from administrative registration date.
 */
export function getArtInitiationConfig(status: ARTStatus | string | undefined): ArtInitiationConfig {
  if (status === 'On ART') {
    return {
      label: 'On ART Since (Initiation Date)',
      isHistorical: false,
      helpText: 'Exact date child initiated antiretroviral therapy (from Green Card).',
      isApplicable: true,
    };
  }

  if (status === 'Defaulted / Interrupted') {
    return {
      label: 'Prior ART Initiation Date (Historical)',
      isHistorical: true,
      helpText: 'Historical treatment initiation date recorded before interruption.',
      isApplicable: true,
    };
  }

  if (status === 'Transferred In') {
    return {
      label: 'Original ART Initiation Date',
      isHistorical: false,
      helpText: 'Original initiation date documented on the transfer out certificate.',
      isApplicable: true,
    };
  }

  return {
    label: 'Past Treatment Start Date (If Previously Treated)',
    isHistorical: true,
    helpText: 'Retained for historical records if the child was ever previously on ART.',
    isApplicable: false,
  };
}

/**
 * Configures the clinical ART ID / UID field ('artIdNumber').
 */
export function getArtIdConfig(status: ARTStatus | string | undefined): ArtIdConfig {
  if (status === 'On ART') {
    return {
      label: 'UID / ART No. (Clinical ART ID)',
      isHistorical: false,
      helpText: 'Clinical identifier assigned by the treating ART centre.',
      isApplicable: true,
    };
  }

  if (status === 'Defaulted / Interrupted') {
    return {
      label: 'UID / ART No. (Prior Centre Record)',
      isHistorical: true,
      helpText: 'Last known clinical ART identifier prior to default.',
      isApplicable: true,
    };
  }

  if (status === 'Transferred In') {
    return {
      label: 'UID / ART No. (Receiving / Transfer ID)',
      isHistorical: false,
      helpText: 'Clinical ART ID at the new centre or transferred record number.',
      isApplicable: true,
    };
  }

  return {
    label: 'UID / ART No. (Historical Record If Available)',
    isHistorical: true,
    helpText: 'Historical ART identifier if previously enrolled in care.',
    isApplicable: false,
  };
}

/**
 * Validates ART-related inputs for consistency.
 */
export function validateArtDependencyState(data: {
  artStatus?: ARTStatus | string;
  artMedicineType?: string;
  artInitiationDate?: string;
  artIdNumber?: string;
  currentlyOnArt?: boolean | string;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const { artStatus, artMedicineType, currentlyOnArt } = data;

  if (artStatus === 'On ART') {
    // Current regimen is required when On ART
    if (!artMedicineType || artMedicineType.trim() === '') {
      errors.artMedicineType = 'Current ART regimen is required when child is On ART.';
    }
  }

  if (artStatus === 'Transferred In') {
    const isTaking = currentlyOnArt === true || currentlyOnArt === 'Yes' || currentlyOnArt === 'true';
    if (isTaking && (!artMedicineType || artMedicineType.trim() === '')) {
      errors.artMedicineType = 'Current ART regimen is required when child is confirmed currently taking ART at receiving centre.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
