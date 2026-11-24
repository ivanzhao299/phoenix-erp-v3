import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OrgScope, scopeWhere } from './farm.service';
import type { FlockActor } from './flock-lifecycle.service';

function signer(actor: FlockActor) {
  if (!actor.accountId || !actor.id || actor.impersonatedBy) throw new ForbiddenException('须由本人登录实名签认');
  return actor.accountId;
}

const sourceRows = `FROM brd_daily_logs d JOIN brd_egg_course_intervals m ON m.flock_no=d.flock_no
  AND m.start_date<=d.log_date AND (m.last_day IS NULL OR m.last_day>=d.log_date)
  LEFT JOIN brd_flock_occupancies o ON o.id=d.occupancy_id AND o.flock_no=d.flock_no AND o.house_code=d.house_code
  LEFT JOIN brd_flock_balances b ON b.flock_no=d.flock_no
  CROSS JOIN LATERAL (SELECT COALESCE(o.farm_code,d.farm_code) AS farm_code,
    COALESCE(o.company_code,d.company_code) AS company_code,COALESCE(o.site_code,d.site_code) AS site_code) origin
  CROSS JOIN LATERAL (SELECT COALESCE(b.farm_code,origin.farm_code) AS farm_code,
    COALESCE(b.company_code,origin.company_code) AS company_code,COALESCE(b.site_code,origin.site_code) AS site_code) care`;

@Injectable()
export class EggWithdrawalReviewService {
  constructor(@InjectEntityManager() private readonly db: EntityManager) {}

  private async lockFlock(m: EntityManager, flock: string) {
    const [row] = await m.query("SELECT pg_try_advisory_xact_lock(hashtext('vet:egg-flock'),hashtext($1)) AS locked",[flock]);
    if (!row.locked) throw new ConflictException('产蛋来源正在变更，请刷新后重试');
  }

  async list(scope: OrgScope, day: string, qa: boolean) {
    const params: unknown[] = [day];
    const visible = scopeWhere(scope, params, qa ? 'origin.' : 'care.') || 'true';
    return this.db.query(`SELECT d.id::text AS daily_log_id,
      d.log_date::text AS production_date,d.flock_no,d.house_code,origin.company_code,origin.site_code,o.id IS NOT NULL AS verified_source,
      d.shift,EXISTS(SELECT 1 FROM brd_daily_logs unresolved WHERE unresolved.flock_no=d.flock_no
        AND unresolved.log_date=d.log_date AND unresolved.occupancy_id IS NULL) AS unresolved_source,
      m.id AS medication_id,m.medication_code,m.house_code AS treatment_house,m.status AS course_status,
      ${qa ? 'NULL::text' : 'b.house_code'} AS current_house_code,
      v.id AS review_id,v.vet_name,v.vet_reason,q.outcome,q.qa_name,q.evidence_ref,
      vet_egg_day_held(d.flock_no,d.log_date) AS held
      ${sourceRows}
      LEFT JOIN LATERAL (SELECT * FROM brd_egg_vet_reviews review WHERE review.medication_id=m.id
        AND review.daily_log_id=d.id AND review.source_facts=vet_egg_source_facts(d) ORDER BY review.sequence_no DESC LIMIT 1) v ON true
      LEFT JOIN brd_egg_qc_decisions q ON q.review_id=v.id
      WHERE d.log_date=$1 AND ${visible} ORDER BY d.house_code,d.shift,m.id,d.id`, params);
  }

  async requestReview(scope: OrgScope, actor: FlockActor, medicationId: number, logId: string, reason: string, requestId: string) {
    const userId = signer(actor);
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      throw new BadRequestException('缺少有效核查请求号');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new BadRequestException('请填写兽医核查依据');
    if (!Number.isSafeInteger(medicationId) || !/^[1-9][0-9]{0,17}$/.test(logId)) throw new BadRequestException('隔离来源无效');
    return this.db.transaction(async m => {
      const [course] = await m.query('SELECT flock_no FROM brd_medication_records WHERE id=$1 FOR SHARE',[medicationId]);
      if (!course) throw new NotFoundException('用药来源不可见或不存在');
      await m.query('SELECT flock_no FROM brd_flock_balances WHERE flock_no=$1 FOR SHARE',[course.flock_no]);
      const params: unknown[] = [medicationId, logId];
      const visible = scopeWhere(scope, params, 'care.') || 'true';
      await m.query(`SELECT d.id FROM brd_daily_logs d JOIN brd_flock_occupancies o ON o.id=d.occupancy_id
        WHERE d.id=$1 FOR SHARE OF d,o`,[logId]);
      await this.lockFlock(m,course.flock_no);
      const [source] = await m.query(`SELECT vet_egg_source_facts(d) AS facts,m.id,d.flock_no,d.log_date::text AS day,o.house_code,o.company_code,o.farm_code,o.site_code
        ${sourceRows} WHERE m.id=$1 AND d.id=$2 AND o.id IS NOT NULL AND ${visible}`, params);
      if (!source) throw new NotFoundException('该产蛋日与用药来源不可见或不匹配');

      const [replay] = await m.query('SELECT * FROM brd_egg_vet_reviews WHERE id=$1',[requestId]);
      if (replay) {
        if (replay.vet_id === userId && replay.medication_id === medicationId && String(replay.daily_log_id) === logId && replay.vet_reason === reason.trim()) return replay.id;
        throw new ConflictException('核查请求与已登记内容不符');
      }
      const [prior] = await m.query(`SELECT v.*,q.outcome FROM brd_egg_vet_reviews v
        LEFT JOIN brd_egg_qc_decisions q ON q.review_id=v.id WHERE v.medication_id=$1 AND v.daily_log_id=$2 AND v.source_facts=$3::jsonb
        ORDER BY v.sequence_no DESC LIMIT 1`, [medicationId, logId,source.facts]);
      if (prior && !prior.outcome) {
        if (prior.vet_id === userId && prior.vet_reason === reason.trim()) return prior.id;
        throw new ConflictException('该产蛋日已有待质检签认的兽医核查');
      }
      if (prior?.outcome === 'RELEASE' || prior?.outcome === 'DISPOSE') throw new ConflictException('该用药单在此产蛋日已签认');
      const id = requestId;
      await m.query(`INSERT INTO brd_egg_vet_reviews(id,medication_id,flock_no,production_date,daily_log_id,
        house_code,company_code,farm_code,site_code,vet_id,vet_name,vet_reason,source_facts)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id,medicationId,source.flock_no,
        source.day,logId,source.house_code,source.company_code,source.farm_code,source.site_code,userId,actor.id,reason.trim(),source.facts]);
      return id;
    });
  }

  async decide(scope: OrgScope, actor: FlockActor, reviewId: string, outcome: string, evidence: string) {
    const userId = signer(actor);
    if (!['RELEASE','RETAIN','DISPOSE'].includes(outcome) || typeof evidence !== 'string' || !evidence.trim()) {
      throw new BadRequestException('须明确质检结论并上传本次质检凭证');
    }
    return this.db.transaction(async m => {
      const params: unknown[] = [reviewId];
      const visible = scopeWhere(scope, params, 'v.') || 'true';
      const [v] = await m.query(`SELECT v.* FROM brd_egg_vet_reviews v WHERE v.id=$1 AND ${visible} FOR UPDATE`,params);
      if (!v) throw new NotFoundException('兽医核查单不存在或不可见');
      if (v.vet_id === userId) throw new ForbiddenException('质检签认须由另一实名账号完成');
      await m.query('SELECT id FROM brd_medication_records WHERE id=$1 FOR SHARE',[v.medication_id]);
      const [prior] = await m.query('SELECT * FROM brd_egg_qc_decisions WHERE review_id=$1',[reviewId]);
      if (prior) {
        if (prior.qa_id === userId && prior.outcome === outcome && prior.evidence_ref === evidence) return prior;
        throw new ConflictException('质检结论已签认');
      }
      const [file] = await m.query(`SELECT file_id,checksum FROM file_metadata WHERE file_id=$1 AND owner_type='EGG_REVIEW'
        AND owner_id=$2 AND company_code=$3 AND module_code='EGG_WITHDRAWAL' AND uploaded_by=$4
        AND status='ACTIVE' AND deleted_at IS NULL AND visibility IN ('PROTECTED','PRIVATE')
        AND mime_type IN ('application/pdf','image/jpeg','image/png','image/webp') AND checksum IS NOT NULL FOR SHARE`,
      [evidence,v.id,v.company_code,actor.id]);
      if (!file) throw new BadRequestException('须上传由本人提交、归属该产蛋舍的受控质检凭证');
      const [source] = await m.query('SELECT 1 FROM brd_daily_logs d JOIN brd_flock_occupancies o ON o.id=d.occupancy_id WHERE d.id=$1 AND vet_egg_source_facts(d)=$2::jsonb FOR SHARE OF d,o',[v.daily_log_id,v.source_facts]);
      if (!source) throw new ConflictException('日报来源已更正，请重新核查');
      await this.lockFlock(m,v.flock_no);
      const [course] = await m.query(`SELECT status FROM brd_egg_course_intervals WHERE id=$1 AND flock_no=$2
        AND start_date<=$3 AND (last_day IS NULL OR last_day>=$3)`,[v.medication_id,v.flock_no,v.production_date]);
      if (!course) throw new ConflictException('用药来源已更正，请重新核查');
      if (outcome === 'RELEASE' && course?.status !== 'CANCELLED') {
        throw new ConflictException('该产蛋日仍在有效用药记录范围内，只能保留隔离');
      }
      const [result] = await m.query(`INSERT INTO brd_egg_qc_decisions(review_id,outcome,qa_id,qa_name,evidence_ref,evidence_checksum)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[reviewId,outcome,userId,actor.id,evidence,file.checksum]);
      return result;
    });
  }
}
