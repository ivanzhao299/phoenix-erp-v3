import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalRuleEntity } from './entities/approval-rule.entity';
import { ApprovalLogEntity } from './entities/approval-log.entity';
import { CurrencyService } from '../../common/services/currency.service';

export interface ApprovalRequest {
  docType: string;
  docId: number;
  amount: number;
  currencyCode: string;
  submitterId: number;
}

@Injectable()
export class ApprovalService {
  constructor(
    @InjectRepository(ApprovalRuleEntity)
    private readonly ruleRepo: Repository<ApprovalRuleEntity>,
    @InjectRepository(ApprovalLogEntity)
    private readonly logRepo: Repository<ApprovalLogEntity>,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * 基于单据金额与币种，动态计算需要经历的审批链条
   */
  async determineApprovalChain(req: ApprovalRequest): Promise<string[]> {
    // 获取该类型单据的所有审批规则
    const rules = await this.ruleRepo.find({ where: { doc_type: req.docType } });
    if (!rules || rules.length === 0) {
      // 默认后备：如果没有配置专门的规则，默认走三级全量审批
      return ['ROLE_FARM_MGR', 'ROLE_COMPANY_GM', 'ROLE_GROUP_PRESIDENT'];
    }

    // 将单据金额统一折算为人民币 (CNY) 用于阈值比对
    const amountInCNY = this.currencyService.convertTo(req.amount, req.currencyCode, 'CNY');

    // 匹配最严格的规则（即能够涵盖该金额的最高规则）
    let matchedRule: ApprovalRuleEntity = null;
    for (const rule of rules) {
      // 假设 rule.currency_code 都是 CNY 进行比对
      if (amountInCNY >= rule.amount_min && (rule.amount_max === null || amountInCNY <= rule.amount_max)) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      // 若金额太小无规则匹配，直接通过或由系统预设最底层级审批
      return []; 
    }

    return matchedRule.approver_chain;
  }

  /**
   * 提交单据进入审批流 (生成审批流实例，实际应与专门的工作流引擎状态表绑定，此处简化为打Log)
   */
  async submitForApproval(req: ApprovalRequest): Promise<string[]> {
    const chain = await this.determineApprovalChain(req);
    
    // 记录提交动作
    const log = this.logRepo.create({
      doc_type: req.docType,
      doc_id: req.docId,
      approver_role: 'SYSTEM',
      approver_id: req.submitterId,
      action: 'SUBMIT',
      comment: `System calculated required chain: ${chain.join(' -> ')}`,
    });
    await this.logRepo.save(log);

    return chain;
  }

  /**
   * 执行审批同意动作
   */
  async approveDocument(docType: string, docId: number, approverId: number, roleCode: string, comment?: string) {
    const log = this.logRepo.create({
      doc_type: docType,
      doc_id: docId,
      approver_role: roleCode,
      approver_id: approverId,
      action: 'APPROVED',
      comment: comment || 'Approve',
    });
    await this.logRepo.save(log);
    
    // TODO: 回调业务模块更新状态机状态（如从 PENDING_GM 变为 APPROVED）
    return { success: true, next_step: 'PENDING_NEXT_LEVEL' };
  }
}
