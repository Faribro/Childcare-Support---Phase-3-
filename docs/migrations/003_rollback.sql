BEGIN;

DROP FUNCTION IF EXISTS public.provision_leader_identity(UUID, TEXT, TEXT, TEXT, TEXT[], TEXT[], BOOLEAN, INT);
DROP FUNCTION IF EXISTS public.increment_challenge_failed_attempts(UUID, INT);
DROP FUNCTION IF EXISTS consume_leader_challenge_and_create_session(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.consume_leader_challenge_and_create_session(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.issue_leader_auth_challenge(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_and_record_leader_rate_limit(TEXT, INT, INT, INT, INT);

DROP TABLE IF EXISTS public.leader_sessions CASCADE;
DROP TABLE IF EXISTS public.leader_auth_challenges CASCADE;
DROP TABLE IF EXISTS public.leader_rate_limit_events CASCADE;
DROP TABLE IF EXISTS public.leader_identities CASCADE;

COMMIT;
