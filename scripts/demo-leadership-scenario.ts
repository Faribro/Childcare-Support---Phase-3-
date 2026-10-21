import { LeadershipReportingAgent } from '../src/features/leadership-reporting/reporting-agent';
import { CallerSecurityContext } from '../src/features/leadership-reporting/types';

/**
 * Local Runnable Harness for Leadership Reporting Assistant
 * Scenario: "June single-orphan children in government school"
 *
 * Demonstrates:
 * 1. Initial query: "June single-orphan children in government school"
 *    - Clarification of Year (2026) and Visit-Date vs Submission-Date basis
 *    - Exact orphan and school categories
 *    - Unique beneficiaries vs total assessment counting
 *    - Approval status breakdown
 *    - Missing-value treatment (surfaces records with missing schoolType or orphanStatus)
 * 2. Follow-up: "Only Maharashtra"
 * 3. Follow-up: "district-wise"
 * 4. Follow-up: "reset filters"
 */
function runScenarioHarness() {
  console.log('================================================================');
  console.log('LEADERSHIP REPORTING ASSISTANT - LOCAL SYNTHETIC DEMONSTRATION');
  console.log('================================================================\n');

  const caller: CallerSecurityContext = {
    userId: 'usr_director_national',
    role: 'LEADERSHIP',
    permittedStates: ['*'],
  };

  const agent = new LeadershipReportingAgent();
  let session = agent.createSession('demo_sess_001', caller);

  const steps = [
    'June single-orphan children in government school',
    'Only Maharashtra',
    'district-wise',
    'reset filters',
  ];

  for (let i = 0; i < steps.length; i++) {
    const query = steps[i];
    console.log(`----------------------------------------------------------------`);
    console.log(`[Turn ${i + 1}] USER QUERY: "${query}"`);
    console.log(`----------------------------------------------------------------`);

    const result = agent.processQuery(session, query, caller);
    session = result.updatedSession;

    console.log(result.response.content);
    console.log('\n');
  }

  console.log('================================================================');
  console.log('DEMONSTRATION RUN COMPLETE');
  console.log('================================================================');
}

runScenarioHarness();
