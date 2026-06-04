import { Injectable } from '@nestjs/common';
import { DataQualityAlertsService } from '../../data-quality/services/data-quality-alerts.service';

/**
 * G6-G — 异常分析中心
 *
 * 直接消费 G5 DataQualityAlertsService 的告警列表，按业务域归类：
 *   - inventory 库存异常
 *   - sales     销售异常（来自 dataquality.master-data 等）
 *   - finance   财务异常
 *   - traceability 追溯异常
 *   - workflow  审批异常
 *   - master-data 主数据异常
 *
 * 不重复实现告警计算，避免双源不一致。
 */
@Injectable()
export class ExceptionAnalyticsService {
  constructor(private readonly alerts: DataQualityAlertsService) {}

  async list() {
    const all = await this.alerts.list();

    // 按业务域分桶
    const grouped: Record<string, any[]> = {
      inventory: [], sales: [], finance: [], traceability: [], workflow: [], 'master-data': [], dict: [], datascope: [],
    };

    for (const a of all) {
      const bucket = grouped[a.source] ?? grouped['master-data'];
      bucket.push(a);
    }

    const summary = {
      total: all.length,
      highCount: all.filter(a => a.severity === 'HIGH').length,
      mediumCount: all.filter(a => a.severity === 'MEDIUM').length,
      lowCount: all.filter(a => a.severity === 'LOW').length,
      bySource: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])),
    };

    return { summary, grouped, asOf: new Date().toISOString() };
  }
}
