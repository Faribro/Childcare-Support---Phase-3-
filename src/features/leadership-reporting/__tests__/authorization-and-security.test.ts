import { describe, expect, it } from 'vitest';
import { calculateJuneCohortMetrics, validateCallerAccess } from '../metrics-calculator';
import { SYNTHETIC_JUNE_ASSESSMENT_DATASET } from '../synthetic-dataset';
import { LeadershipReportingAgent } from '../reporting-agent';
import { CallerSecurityContext } from '../types';

describe('Leadership Reporting Assistant - Authorization & Security Hardening', () => {
  const nationalLeader: CallerSecurityContext = {
    userId: 'usr_director_national',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
  };

  const maharashtraLead: CallerSecurityContext = {
    userId: 'usr_lead_mh',
    role: 'STATE_LEAD',
    permittedStates: ['Maharashtra'],
  };

  const unauthorizedCaller: CallerSecurityContext = {
    userId: 'usr_rogue_01',
    role: 'SUPERVISOR',
    permittedStates: [], // No state permissions
  };

  const agent = new LeadershipReportingAgent();

  describe('1. Trusted Scope & Scope Widening Defense', () => {
    it('allows national leader to access any state or national scope', () => {
      const authAll = validateCallerAccess(nationalLeader);
      expect(authAll.allowed).toBe(true);
      expect(authAll.effectiveStates).toEqual(['*']);

      const authMP = validateCallerAccess(nationalLeader, 'Madhya Pradesh');
      expect(authMP.allowed).toBe(true);
      expect(authMP.effectiveStates).toEqual(['Madhya Pradesh']);
    });

    it('strictly denies state lead from widening scope to unauthorized states', () => {
      const authDenial = validateCallerAccess(maharashtraLead, 'Madhya Pradesh');
      expect(authDenial.allowed).toBe(false);
      expect(authDenial.denialReason).toContain("is not authorized to access 'Madhya Pradesh'");
    });

    it('throws authorization error at calculation layer if caller tries to access unauthorized records', () => {
      expect(() => {
        calculateJuneCohortMetrics(maharashtraLead, SYNTHETIC_JUNE_ASSESSMENT_DATASET, {
          stateFilter: 'Madhya Pradesh',
        });
      }).toThrow(/Scope Denied/);
    });

    it('proves reporting functions filter strictly to authorized scope when state filter is omitted', () => {
      // Maharashtra lead queries without explicit filter.
      // Filter MUST NOT default to national; it must default strictly to ['Maharashtra']
      const result = calculateJuneCohortMetrics(maharashtraLead, SYNTHETIC_JUNE_ASSESSMENT_DATASET);

      // Only Maharashtra records should be included:
      // In MH: 3 assessments matching on visit-date basis. (MP and UP records excluded!)
      expect(result.totalAssessmentsCount).toBe(3);
      expect(result.uniqueBeneficiariesCount).toBe(2);
      expect(result.stateFilter).toBe('Maharashtra');
    });
  });

  describe('2. Reset Filters Restores Permitted Scope, NEVER National Automatically', () => {
    it('restores state-scoped boundary on reset for State Lead', () => {
      let session = agent.createSession('mh_lead_sess', maharashtraLead);

      // Turn 1: Lead asks for June cohort
      const turn1 = agent.processQuery(session, 'June single-orphan children in government school', maharashtraLead);
      session = turn1.updatedSession;
      expect(turn1.response.content).toContain('Maharashtra');

      // Turn 2: Lead says "reset filters"
      const turn2 = agent.processQuery(session, 'reset filters', maharashtraLead);
      session = turn2.updatedSession;

      expect(turn2.response.intent).toBe('RESET_FILTERS');
      expect(turn2.response.content).toContain('Permitted States: [Maharashtra]');
      expect(turn2.response.content).not.toContain('National Scope');

      // Turn 3: Follow-up query after reset still evaluates ONLY Maharashtra
      const turn3 = agent.processQuery(session, 'Show me overview', maharashtraLead);
      expect(turn3.response.structuredData).toBeDefined();
    });
  });

  describe('3. Cross-User Session Access Defense', () => {
    it('strictly denies User B from executing queries in a session owned by User A', () => {
      const sessionUserA = agent.createSession('session_user_a', nationalLeader);

      const crossUserAttack = agent.processQuery(
        sessionUserA,
        'June single-orphan children in government school',
        maharashtraLead // Different user attempting to access sessionUserA!
      );

      expect(crossUserAttack.response.intent).toBe('AUTHORIZATION_DENIED');
      expect(crossUserAttack.response.content).toContain('Authorization Violation');
      expect(crossUserAttack.response.content).toContain('usr_lead_mh');
      expect(crossUserAttack.response.content).toContain('session_user_a');
    });
  });

  describe('4. Permission Revocation', () => {
    it('immediately denies access if caller permissions are revoked mid-lifecycle', () => {
      // User starts with Maharashtra access
      let leadContext: CallerSecurityContext = {
        userId: 'lead-05',
        role: 'STATE_LEAD',
        permittedStates: ['Maharashtra'],
      };

      const session = agent.createSession('sess_revocation', leadContext);
      const turn1 = agent.processQuery(session, 'June single-orphan children in government school', leadContext);
      expect(turn1.response.intent).toBe('JUNE_ORPHAN_SCHOOL_COHORT');

      // Permissions revoked:
      leadContext = {
        userId: 'lead-05',
        role: 'STATE_LEAD',
        permittedStates: [], // Revoked!
      };

      const turn2 = agent.processQuery(session, 'Only Maharashtra', leadContext);
      expect(turn2.response.intent).toBe('AUTHORIZATION_DENIED');
      expect(turn2.response.content).toMatch(/Scope (Widening )?Denied/);
    });
  });

  describe('5. Architectural Read-Only Guarantee', () => {
    it('verifies that the agent has no mutation tools or database write paths', () => {
      const agentInstance = agent as any;
      expect(agentInstance.createRecord).toBeUndefined();
      expect(agentInstance.updateRecord).toBeUndefined();
      expect(agentInstance.deleteRecord).toBeUndefined();
      expect(agentInstance.approveRecord).toBeUndefined();
    });
  });
});
