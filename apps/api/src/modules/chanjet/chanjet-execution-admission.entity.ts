import { Entity, Column, PrimaryColumn, Unique, Check, ManyToOne, JoinColumn } from 'typeorm';
import { ExecutionManifest } from './chanjet-execution-manifest';
import { AdmissionPhase, RequestKind, RequestPhase } from './chanjet-execution-admission.store';

/** Schema metadata only; not registered in a Nest module or any HTTP/CRUD path. */
@Entity('chanjet_execution_admissions')
@Unique('uq_chanjet_admission_approval', ['approvalId'])
@Check('ck_chanjet_admission_cap', 'request_cap > 0 AND request_count >= 0 AND request_count <= request_cap')
@Check('ck_chanjet_admission_time', 'total_timeout_ms > 0 AND http_timeout_ms > 0 AND deadline_at > started_at AND deadline_at <= verification_expires_at')
@Check('ck_chanjet_admission_phase', "phase IN ('REGISTERED','PROBING','PROBED','SYNCING','VERIFIED','HOLD')")
@Check('ck_chanjet_admission_lease', "(phase IN ('PROBING','SYNCING') AND lease_id <> '') OR (phase NOT IN ('PROBING','SYNCING') AND lease_id = '')")
@Check('ck_chanjet_admission_reason', "(phase = 'HOLD' AND hold_reason <> '') OR (phase <> 'HOLD' AND hold_reason = '')")
export class ChanjetExecutionAdmissionEntity {
  @PrimaryColumn({name:'execution_id',type:'varchar',length:128,primaryKeyConstraintName:'chanjet_execution_admissions_pkey'}) executionId: string;
  @Column({name:'approval_id',type:'varchar',length:128}) approvalId: string;
  @Column({name:'owner_id',type:'varchar',length:128}) ownerId: string;
  @Column({name:'floor_sha',type:'varchar',length:40}) floorSha: string;
  @Column({type:'jsonb'}) manifest: ExecutionManifest;
  @Column({name:'canonical_manifest',type:'text'}) canonicalManifest: string;
  @Column({name:'manifest_digest',type:'varchar',length:64}) manifestDigest: string;
  @Column({name:'request_cap',type:'integer'}) requestCap: number;
  @Column({name:'total_timeout_ms',type:'integer'}) totalTimeoutMs: number;
  @Column({name:'http_timeout_ms',type:'integer'}) httpTimeoutMs: number;
  @Column({name:'verification_expires_at',type:'timestamptz'}) verificationExpiresAt: Date;
  @Column({name:'started_at',type:'timestamptz'}) startedAt: Date;
  @Column({name:'deadline_at',type:'timestamptz'}) deadlineAt: Date;
  @Column({name:'request_count',type:'integer',default:0}) requestCount: number;
  @Column({type:'varchar',length:24,default:'REGISTERED'}) phase: AdmissionPhase;
  @Column({name:'lease_id',type:'varchar',length:128,default:''}) leaseId: string;
  @Column({name:'hold_reason',type:'varchar',length:48,default:''}) holdReason: string;
}

@Entity('chanjet_execution_requests')
@Unique('uq_chanjet_request_ordinal', ['executionId','ordinal'])
@Check('ck_chanjet_request_ordinal', 'ordinal > 0')
@Check('ck_chanjet_request_phase', "phase IN ('PROBING','SYNCING')")
@Check('ck_chanjet_request_kind', "kind IN ('BUSINESS','DISCOVERY','CERTIFICATE','TOKEN','RESEND')")
@Check('ck_chanjet_request_status', "(status = 'RESERVED' AND acknowledged_at IS NULL) OR (status = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL)")
export class ChanjetExecutionRequestEntity {
  @PrimaryColumn({type:'uuid',primaryKeyConstraintName:'chanjet_execution_requests_pkey'}) ticket: string;
  @Column({name:'execution_id',type:'varchar',length:128}) executionId: string;
  @Column({type:'integer'}) ordinal: number;
  @Column({type:'varchar',length:24}) phase: RequestPhase;
  @Column({name:'lease_id',type:'varchar',length:128}) leaseId: string;
  @Column({type:'varchar',length:24}) kind: RequestKind;
  @Column({type:'varchar',length:24,default:'RESERVED'}) status: 'RESERVED' | 'ACKNOWLEDGED';
  @Column({name:'reserved_at',type:'timestamptz'}) reservedAt: Date;
  @Column({name:'acknowledged_at',type:'timestamptz',nullable:true}) acknowledgedAt: Date | null;
  @ManyToOne(() => ChanjetExecutionAdmissionEntity)
  @JoinColumn({name:'execution_id',foreignKeyConstraintName:'chanjet_execution_requests_execution_id_fkey'}) admission: ChanjetExecutionAdmissionEntity;
}
