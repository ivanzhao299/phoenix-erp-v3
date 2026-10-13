import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Control schema only; no runtime registration, business seed or provider call.
 * @allow-data-dml: DDL-only trigger event UPDATE OR/DELETE ON is a regex false positive; no data DML in up().
 * Same-role table owners can bypass triggers/DDL: this is not root/API privilege isolation.
 */
export class CreateChanjetExecutionAdmissions1791878400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE chanjet_execution_admissions (
      execution_id varchar(128) PRIMARY KEY,
      approval_id varchar(128) NOT NULL,
      owner_id varchar(128) NOT NULL,
      floor_sha varchar(40) NOT NULL,
      manifest jsonb NOT NULL,
      canonical_manifest text NOT NULL,
      manifest_digest varchar(64) NOT NULL,
      request_cap integer NOT NULL,
      total_timeout_ms integer NOT NULL,
      http_timeout_ms integer NOT NULL,
      verification_expires_at timestamptz NOT NULL,
      started_at timestamptz NOT NULL,
      deadline_at timestamptz NOT NULL,
      request_count integer NOT NULL DEFAULT 0,
      phase varchar(24) NOT NULL DEFAULT 'REGISTERED',
      lease_id varchar(128) NOT NULL DEFAULT '',
      hold_reason varchar(48) NOT NULL DEFAULT '',
      CONSTRAINT uq_chanjet_admission_approval UNIQUE (approval_id),
      CONSTRAINT ck_chanjet_admission_cap CHECK (request_cap > 0 AND request_count >= 0 AND request_count <= request_cap),
      CONSTRAINT ck_chanjet_admission_time CHECK (total_timeout_ms > 0 AND http_timeout_ms > 0 AND deadline_at > started_at AND deadline_at <= verification_expires_at),
      CONSTRAINT ck_chanjet_admission_phase CHECK (phase IN ('REGISTERED','PROBING','PROBED','SYNCING','VERIFIED','HOLD')),
      CONSTRAINT ck_chanjet_admission_lease CHECK ((phase IN ('PROBING','SYNCING') AND lease_id <> '') OR (phase NOT IN ('PROBING','SYNCING') AND lease_id = '')),
      CONSTRAINT ck_chanjet_admission_reason CHECK ((phase = 'HOLD' AND hold_reason <> '') OR (phase <> 'HOLD' AND hold_reason = ''))
    )`);
    await queryRunner.query(`CREATE TABLE chanjet_execution_requests (
      ticket uuid PRIMARY KEY,
      execution_id varchar(128) NOT NULL REFERENCES chanjet_execution_admissions(execution_id),
      ordinal integer NOT NULL,
      lease_id varchar(128) NOT NULL,
      kind varchar(24) NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'RESERVED',
      reserved_at timestamptz NOT NULL,
      acknowledged_at timestamptz,
      CONSTRAINT uq_chanjet_request_ordinal UNIQUE (execution_id, ordinal),
      CONSTRAINT ck_chanjet_request_ordinal CHECK (ordinal > 0),
      CONSTRAINT ck_chanjet_request_kind CHECK (kind IN ('BUSINESS','DISCOVERY','CERTIFICATE','TOKEN','RESEND')),
      CONSTRAINT ck_chanjet_request_status CHECK ((status = 'RESERVED' AND acknowledged_at IS NULL) OR (status = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE FUNCTION chanjet_admission_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE t timestamptz := clock_timestamp();
      BEGIN
        IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'CHANJET_ADMISSION_IMMUTABLE'; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.execution_id !~ '^[A-Za-z0-9_-]{1,128}$' OR NEW.approval_id !~ '^[A-Za-z0-9_-]{1,128}$'
             OR NEW.owner_id !~ '^[A-Za-z0-9_-]{1,128}$' OR NEW.floor_sha !~ '^[a-f0-9]{40}$'
             OR NEW.phase <> 'REGISTERED' OR NEW.request_count <> 0 OR NEW.lease_id <> '' OR NEW.hold_reason <> ''
             OR NEW.manifest IS DISTINCT FROM NEW.canonical_manifest::jsonb
             OR NEW.manifest_digest IS DISTINCT FROM encode(sha256(convert_to(NEW.canonical_manifest,'UTF8')),'hex')
             OR NEW.execution_id IS DISTINCT FROM NEW.manifest->>'executionId'
             OR NEW.owner_id IS DISTINCT FROM NEW.manifest->>'ownerId'
             OR NEW.approval_id IS DISTINCT FROM NEW.manifest->'approval'->>'approvalId'
             OR NEW.floor_sha IS DISTINCT FROM NEW.manifest->'approval'->>'floorSha'
             OR NEW.request_cap IS DISTINCT FROM (NEW.manifest->>'requestCap')::integer
             OR NEW.total_timeout_ms IS DISTINCT FROM (NEW.manifest->>'totalTimeoutMs')::integer
             OR NEW.http_timeout_ms IS DISTINCT FROM (NEW.manifest->>'httpTimeoutMs')::integer
             OR NEW.verification_expires_at IS DISTINCT FROM (NEW.manifest->'approval'->'verification'->>'expiresAt')::timestamptz
             OR NEW.verification_expires_at <= t OR NEW.verification_expires_at > t + interval '30 minutes'
          THEN RAISE EXCEPTION 'CHANJET_ADMISSION_REGISTRATION'; END IF;
          NEW.started_at := t;
          NEW.deadline_at := LEAST(t + NEW.total_timeout_ms * interval '1 millisecond', NEW.verification_expires_at);
          RETURN NEW;
        END IF;
        IF ROW(NEW.execution_id,NEW.approval_id,NEW.owner_id,NEW.floor_sha,NEW.manifest,NEW.canonical_manifest,
               NEW.manifest_digest,NEW.request_cap,NEW.total_timeout_ms,NEW.http_timeout_ms,NEW.verification_expires_at,NEW.started_at,NEW.deadline_at)
           IS DISTINCT FROM
           ROW(OLD.execution_id,OLD.approval_id,OLD.owner_id,OLD.floor_sha,OLD.manifest,OLD.canonical_manifest,
               OLD.manifest_digest,OLD.request_cap,OLD.total_timeout_ms,OLD.http_timeout_ms,OLD.verification_expires_at,OLD.started_at,OLD.deadline_at)
           OR OLD.phase IN ('HOLD','VERIFIED') THEN RAISE EXCEPTION 'CHANJET_ADMISSION_IMMUTABLE'; END IF;
        IF NEW.phase = 'HOLD' AND NEW.request_count = OLD.request_count THEN RETURN NEW; END IF;
        IF t >= OLD.deadline_at THEN RAISE EXCEPTION 'CHANJET_ADMISSION_EXPIRED'; END IF;
        IF NEW.phase = OLD.phase THEN
          IF OLD.phase NOT IN ('PROBING','SYNCING') OR NEW.lease_id <> OLD.lease_id
             OR NEW.request_count <> OLD.request_count + 1 THEN RAISE EXCEPTION 'CHANJET_ADMISSION_RESERVATION'; END IF;
        ELSE
          IF NEW.request_count <> OLD.request_count OR NOT (
            (OLD.phase = 'REGISTERED' AND NEW.phase = 'PROBING') OR
            (OLD.phase = 'PROBING' AND NEW.phase = 'PROBED') OR
            (OLD.phase = 'PROBED' AND NEW.phase = 'SYNCING') OR
            (OLD.phase = 'SYNCING' AND NEW.phase = 'VERIFIED'))
            THEN RAISE EXCEPTION 'CHANJET_ADMISSION_PHASE'; END IF;
          IF (NEW.phase IN ('PROBED','VERIFIED') AND NOT EXISTS (SELECT 1 FROM chanjet_execution_requests
            WHERE execution_id = OLD.execution_id AND lease_id = OLD.lease_id AND kind = 'BUSINESS' AND status = 'ACKNOWLEDGED')) OR EXISTS (SELECT 1 FROM chanjet_execution_requests WHERE execution_id = OLD.execution_id AND status = 'RESERVED')
            THEN RAISE EXCEPTION 'CHANJET_ADMISSION_AMBIGUOUS_REQUEST'; END IF;
        END IF;
        RETURN NEW;
      END $fn$`);
    await queryRunner.query(`CREATE TRIGGER chanjet_admission_row_guard BEFORE INSERT OR UPDATE OR DELETE ON chanjet_execution_admissions FOR EACH ROW EXECUTE FUNCTION chanjet_admission_guard()`);
    await queryRunner.query(`CREATE TRIGGER chanjet_admission_truncate_guard BEFORE TRUNCATE ON chanjet_execution_admissions FOR EACH STATEMENT EXECUTE FUNCTION chanjet_admission_guard()`);
    await queryRunner.query(`CREATE FUNCTION chanjet_request_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE a chanjet_execution_admissions; t timestamptz;
      BEGIN
        IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'CHANJET_REQUEST_IMMUTABLE'; END IF;
        SELECT * INTO STRICT a FROM chanjet_execution_admissions WHERE execution_id = NEW.execution_id FOR UPDATE;
        t := clock_timestamp();
        IF a.phase NOT IN ('PROBING','SYNCING') OR a.lease_id <> NEW.lease_id OR t >= a.deadline_at
          THEN RAISE EXCEPTION 'CHANJET_REQUEST_CONTEXT'; END IF;
        IF TG_OP = 'INSERT' THEN
          IF NEW.status <> 'RESERVED' OR NEW.ordinal <> a.request_count OR NEW.acknowledged_at IS NOT NULL
            THEN RAISE EXCEPTION 'CHANJET_REQUEST_RESERVATION'; END IF;
          NEW.reserved_at := t;
        ELSE
          IF ROW(NEW.ticket,NEW.execution_id,NEW.ordinal,NEW.lease_id,NEW.kind,NEW.reserved_at)
             IS DISTINCT FROM ROW(OLD.ticket,OLD.execution_id,OLD.ordinal,OLD.lease_id,OLD.kind,OLD.reserved_at)
             OR OLD.status <> 'RESERVED' OR NEW.status <> 'ACKNOWLEDGED'
            THEN RAISE EXCEPTION 'CHANJET_REQUEST_IMMUTABLE'; END IF;
          NEW.acknowledged_at := t;
        END IF;
        RETURN NEW;
      END $fn$`);
    await queryRunner.query(`CREATE TRIGGER chanjet_request_row_guard BEFORE INSERT OR UPDATE OR DELETE ON chanjet_execution_requests FOR EACH ROW EXECUTE FUNCTION chanjet_request_guard()`);
    await queryRunner.query(`CREATE TRIGGER chanjet_request_truncate_guard BEFORE TRUNCATE ON chanjet_execution_requests FOR EACH STATEMENT EXECUTE FUNCTION chanjet_request_guard()`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE chanjet_execution_requests');
    await queryRunner.query('DROP TABLE chanjet_execution_admissions');
    await queryRunner.query('DROP FUNCTION chanjet_request_guard()');
    await queryRunner.query('DROP FUNCTION chanjet_admission_guard()');
  }
}
