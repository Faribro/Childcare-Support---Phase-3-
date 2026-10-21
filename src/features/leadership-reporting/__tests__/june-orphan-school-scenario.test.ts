import { describe, expect, it } from 'vitest';
import { calculateJuneCohortMetrics } from '../metrics-calculator';
import { SYNTHETIC_JUNE_ASSESSMENT_DATASET } from '../synthetic-dataset';
import { LeadershipReportingAgent } from '../reporting-agent';
import { CallerSecurityContext } from '../types';

/**
 * Scenario Verification: "June single-orphan children in government school"
 *
 * INDEPENDENTLY DEFINED EXPECTED RESULTS FROM FIXTURES:
 * Fixture set contains 11 synthetic assessments:
 * - Maharashtra:
 *   - REC-MH-01: CH-MH-01, Pune, visit 2026-06-05, sub 2026-06-06, SINGLE_ORPHAN, GOV_SCHOOL, APPROVED
 *   - REC-MH-02: CH-MH-01, Pune, visit 2026-06-25, sub 2026-06-26, SINGLE_ORPHAN, GOV_SCHOOL, APPROVED (Repeat!)
 *   - REC-MH-03: CH-MH-02, Thane, visit 2026-06-10, sub 2026-06-12, SINGLE_ORPHAN, GOV_SCHOOL, PENDING
 *   - REC-MH-04: CH-MH-03, Mumbai, visit 2026-06-14, sub 2026-06-15, SINGLE_ORPHAN, PRIVATE_SCHOOL (Excluded)
 *   - REC-MH-05: CH-MH-04, Pune, visit 2026-05-30, sub 2026-06-02, SINGLE_ORPHAN, GOV_SCHOOL, APPROVED (Visit in May!)
 *   - REC-MH-06: CH-MH-05, Nashik, visit 2026-06-18, sub 2026-06-20, SINGLE_ORPHAN, school null (Missing school!)
 * - Madhya Pradesh:
 *   - REC-MP-01: CH-MP-01, Bhopal, visit 2026-06-08, sub 2026-06-09, SINGLE_ORPHAN, GOV_SCHOOL, APPROVED
 *   - REC-MP-02: CH-MP-02, Indore, visit 2026-06-11, sub 2026-06-13, SINGLE_ORPHAN, GOV_SCHOOL, FLAGGED
 * - Uttar Pradesh:
 *   - REC-UP-01: CH-UP-01, Lucknow, visit 2026-06-07, sub 2026-06-08, SINGLE_ORPHAN, GOV_SCHOOL, APPROVED
 *   - REC-UP-02: CH-UP-02, Varanasi, visit 2026-06-15, sub 2026-06-16, DOUBLE_ORPHAN, GOV_SCHOOL (Excluded)
 *   - REC-UP-03: CH-UP-03, Lucknow, visit 2026-06-20, sub 2026-06-21, orphan null, GOV_SCHOOL (Missing orphan!)
 */
describe('Leadership Scenario - June Single-Orphan Children in Government School', () => {
  const leadershipCaller: CallerSecurityContext = {
    userId: 'exec-director-01',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
  };

  const agent = new LeadershipReportingAgent();

  it('calculates national metrics on Visit-Date basis with independent fixture math', () => {
    const result = calculateJuneCohortMetrics(leadershipCaller, SYNTHETIC_JUNE_ASSESSMENT_DATASET, {
      dateBasis: 'VISIT_DATE',
      year: 2026,
    });

    expect(result.year).toBe(2026);
    expect(result.month).toBe('June');
    expect(result.dateBasis).toBe('VISIT_DATE');
    expect(result.orphanCategory).toBe('SINGLE_ORPHAN');
    expect(result.schoolCategory).toBe('GOVERNMENT_SCHOOL');

    // Total matching assessments on visit-date basis:
    // REC-MH-01, REC-MH-02, REC-MH-03, REC-MP-01, REC-MP-02, REC-UP-01 = 6 assessments
    expect(result.totalAssessmentsCount).toBe(6);

    // Unique beneficiaries:
    // CH-MH-01 (assessed twice), CH-MH-02, CH-MP-01, CH-MP-02, CH-UP-01 = 5 children
    expect(result.uniqueBeneficiariesCount).toBe(5);

    // Approval status distribution:
    // Approved: REC-MH-01, REC-MH-02, REC-MP-01, REC-UP-01 = 4
    // Pending: REC-MH-03 = 1
    // Flagged: REC-MP-02 = 1
    // Rejected: 0
    expect(result.approvedAssessmentsCount).toBe(4);
    expect(result.pendingAssessmentsCount).toBe(1);
    expect(result.flaggedAssessmentsCount).toBe(1);
    expect(result.rejectedAssessmentsCount).toBe(0);

    // Missing-value treatment:
    // REC-MH-06 missing schoolType = 1
    // REC-UP-03 missing orphanStatus = 1
    expect(result.recordsExcludedMissingSchool).toBe(1);
    expect(result.recordsExcludedMissingOrphanStatus).toBe(1);
  });

  it('demonstrates visit-date vs submission-date basis discrimination', () => {
    // Under Submission-Date basis:
    // REC-MH-05 (visit May 30, submission June 02) gets included!
    const submissionResult = calculateJuneCohortMetrics(leadershipCaller, SYNTHETIC_JUNE_ASSESSMENT_DATASET, {
      dateBasis: 'SUBMISSION_DATE',
      year: 2026,
    });

    // 6 visit-date matches + 1 delayed sync (REC-MH-05) = 7 total assessments
    expect(submissionResult.totalAssessmentsCount).toBe(7);
    expect(submissionResult.uniqueBeneficiariesCount).toBe(6);
    expect(submissionResult.approvedAssessmentsCount).toBe(5); // REC-MH-05 is APPROVED
  });

  it('filters specifically for Maharashtra scope', () => {
    const mhResult = calculateJuneCohortMetrics(leadershipCaller, SYNTHETIC_JUNE_ASSESSMENT_DATASET, {
      stateFilter: 'Maharashtra',
      dateBasis: 'VISIT_DATE',
      year: 2026,
    });

    expect(mhResult.stateFilter).toBe('Maharashtra');
    // In MH on visit-date: REC-MH-01, REC-MH-02, REC-MH-03 = 3 assessments
    expect(mhResult.totalAssessmentsCount).toBe(3);
    // Unique children: CH-MH-01, CH-MH-02 = 2 unique beneficiaries
    expect(mhResult.uniqueBeneficiariesCount).toBe(2);
    expect(mhResult.approvedAssessmentsCount).toBe(2);
    expect(mhResult.pendingAssessmentsCount).toBe(1);
    // Missing school excluded in MH: REC-MH-06
    expect(mhResult.recordsExcludedMissingSchool).toBe(1);
  });

  it('breaks down Maharashtra cohort district-wise', () => {
    const mhResult = calculateJuneCohortMetrics(leadershipCaller, SYNTHETIC_JUNE_ASSESSMENT_DATASET, {
      stateFilter: 'Maharashtra',
      dateBasis: 'VISIT_DATE',
      year: 2026,
    });

    const districts = mhResult.districtBreakdown;
    expect(districts.length).toBe(2); // Pune and Thane

    const pune = districts.find((d) => d.district === 'Pune');
    expect(pune).toBeDefined();
    expect(pune?.totalAssessments).toBe(2); // REC-MH-01 and REC-MH-02
    expect(pune?.uniqueBeneficiaries).toBe(1); // CH-MH-01 assessed twice
    expect(pune?.approvedAssessments).toBe(2);

    const thane = districts.find((d) => d.district === 'Thane');
    expect(thane).toBeDefined();
    expect(thane?.totalAssessments).toBe(1); // REC-MH-03
    expect(thane?.uniqueBeneficiaries).toBe(1); // CH-MH-02
    expect(thane?.pendingAssessments).toBe(1);
  });

  describe('Multi-Turn Conversational Dialogue for the Scenario', () => {
    it('executes full sequence: initial query -> Only Maharashtra -> district-wise -> reset filters', () => {
      let session = agent.createSession('scenario_flow_01', leadershipCaller);

      // Turn 1: Initial query
      const turn1 = agent.processQuery(session, 'June single-orphan children in government school');
      session = turn1.updatedSession;

      expect(turn1.response.intent).toBe('JUNE_ORPHAN_SCHOOL_COHORT');
      expect(turn1.response.content).toContain('Unique Beneficiaries:** **5** children');
      expect(turn1.response.content).toContain('Total Assessments:** **6** assessment events');
      expect(turn1.response.content).toContain('Visit-Date Basis');
      expect(turn1.response.content).toContain('Excluded due to Missing School Type:** **1**');
      expect(turn1.response.content).toContain('Excluded due to Missing Orphan Status:** **1**');
      expect(session.activeStateFilter).toBeNull();

      // Turn 2: Follow-up: "Only Maharashtra"
      const turn2 = agent.processQuery(session, 'Only Maharashtra');
      session = turn2.updatedSession;

      expect(session.activeStateFilter).toBe('Maharashtra');
      expect(turn2.response.content).toContain('in **Maharashtra**');
      expect(turn2.response.content).toContain('Unique Beneficiaries:** **2** children');
      expect(turn2.response.content).toContain('Total Assessments:** **3** assessment events');
      expect(turn2.response.content).toContain('Approved:** **2**');
      expect(turn2.response.content).toContain('Pending Supervisor Verification:** **1**');

      // Turn 3: Follow-up: "district-wise"
      const turn3 = agent.processQuery(session, 'district-wise');
      session = turn3.updatedSession;

      expect(turn3.response.intent).toBe('DISTRICT_BREAKDOWN');
      expect(turn3.response.content).toContain('District Breakdown');
      expect(turn3.response.content).toContain('Pune');
      expect(turn3.response.content).toContain('Thane');

      // Turn 4: Follow-up: "reset filters"
      const turn4 = agent.processQuery(session, 'reset filters');
      session = turn4.updatedSession;

      expect(turn4.response.intent).toBe('RESET_FILTERS');
      expect(session.activeStateFilter).toBeNull();
      expect(turn4.response.content).toContain('Filters Reset');
      expect(turn4.response.content).toContain('National Scope');
    });
  });
});
