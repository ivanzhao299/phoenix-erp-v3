/**
 * Phoenix ERP V3 — 高敏感操作日志拦截器
 * RBAC-1 安全加固 2026-05-25
 *
 * 覆盖操作：
 *   - 股东资金（create / modify / import / delete）
 *   - 付款（create / approve / execute / void）
 *   - AP核销（create）
 *   - 历史初始化（所有 POST）
 *   - 用户权限/状态修改
 *   - 系统品牌配置修改
 *
 * 使用 rxjs tap 操作符异步写日志（不阻塞响应链）
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';

/** 需要记录操作日志的路径规则 */
interface LogRule {
  /** 路径正则（匹配 req.path） */
  pathPattern: RegExp;
  /** 允许的 HTTP 方法（空数组=全部） */
  methods: string[];
  /** 业务类型标签 */
  bizType: string;
  /** 操作码推导函数（可选，默认由 method 推导） */
  actionFn?: (method: string, path: string) => string;
}

const LOG_RULES: LogRule[] = [
  // 股东资金
  {
    pathPattern: /^\/api\/v2\/procurement\/funds/,
    methods: ['POST', 'PATCH', 'PUT', 'DELETE'],
    bizType: 'FUND',
  },
  // 付款（含子操作 approve / execute / void）
  {
    pathPattern: /^\/api\/v2\/procurement\/payments/,
    methods: ['POST', 'PATCH', 'PUT', 'DELETE'],
    bizType: 'PAYMENT',
    actionFn: (method, path) => {
      if (path.endsWith('/approve'))  return 'APPROVE';
      if (path.endsWith('/execute'))  return 'EXECUTE';
      if (path.endsWith('/void'))     return 'VOID';
      if (path.endsWith('/submit'))   return 'SUBMIT';
      if (path.endsWith('/reject'))   return 'REJECT';
      if (method === 'POST')          return 'CREATE';
      if (method === 'PATCH' || method === 'PUT') return 'MODIFY';
      if (method === 'DELETE')        return 'DELETE';
      return method;
    },
  },
  // 历史初始化
  {
    pathPattern: /^\/api\/v2\/procurement\/init/,
    methods: ['POST'],
    bizType: 'INIT',
    actionFn: () => 'IMPORT',
  },
  // AP核销
  {
    pathPattern: /^\/api\/v2\/procurement\/ap-ledger/,
    methods: ['POST', 'PATCH'],
    bizType: 'AP',
  },
  // 用户权限/状态修改
  {
    pathPattern: /^\/api\/system\/users\/\d+\/(role|status|password)/,
    methods: ['PUT', 'PATCH'],
    bizType: 'PERMISSION',
    actionFn: (method, path) => {
      if (path.includes('/role'))     return 'MODIFY_ROLE';
      if (path.includes('/status'))   return 'MODIFY_STATUS';
      if (path.includes('/password')) return 'MODIFY_PASSWORD';
      return 'MODIFY';
    },
  },
  // 系统品牌配置
  {
    pathPattern: /^\/api\/system\/brand/,
    methods: ['PUT', 'PATCH'],
    bizType: 'CONFIG',
    actionFn: () => 'MODIFY_BRAND',
  },
  // ── Sales V2 高危操作（Production Stabilization Phase 1 扩展）────────────
  // Sales V2 客户解冻（高风险，需 A 权限）
  {
    pathPattern: /^\/api\/v2\/sales\/customers\/\d+\/unfreeze/,
    methods: ['POST'],
    bizType: 'SAL_CREDIT',
    actionFn: () => 'UNFREEZE_CUSTOMER',
  },
  // Sales V2 信用刷新
  {
    pathPattern: /^\/api\/v2\/sales\/customers\/\d+\/refresh-credit/,
    methods: ['POST'],
    bizType: 'SAL_CREDIT',
    actionFn: () => 'REFRESH_CREDIT',
  },
  // Sales V2 全量信用刷新（管理员触发）
  {
    pathPattern: /^\/api\/v2\/sales\/credit\/trigger-refresh/,
    methods: ['POST'],
    bizType: 'SAL_CREDIT',
    actionFn: () => 'TRIGGER_CREDIT_REFRESH',
  },
  // Sales V2 销售订单状态变更（submit / approve / reject / ship / receive）
  {
    pathPattern: /^\/api\/v2\/sales\/orders\/\d+\/(submit|approve|reject|ship|receive|cancel)/,
    methods: ['POST', 'PATCH'],
    bizType: 'SAL_ORDER',
    actionFn: (_method, path) => {
      if (path.endsWith('/submit'))  return 'SUBMIT';
      if (path.endsWith('/approve')) return 'APPROVE';
      if (path.endsWith('/reject'))  return 'REJECT';
      if (path.endsWith('/ship'))    return 'SHIP';
      if (path.endsWith('/receive')) return 'RECEIVE';
      if (path.endsWith('/cancel'))  return 'CANCEL';
      return 'ORDER_ACTION';
    },
  },
  // Sales V2 配送单签收
  {
    pathPattern: /^\/api\/v2\/sales\/receipts/,
    methods: ['POST'],
    bizType: 'SAL_DELIVERY',
    actionFn: () => 'SIGN_RECEIPT',
  },
  // Sales V2 退货单（创建/审批/拒绝/完成）
  {
    pathPattern: /^\/api\/v2\/sales\/returns/,
    methods: ['POST', 'PATCH'],
    bizType: 'SAL_RETURN',
    actionFn: (method, path) => {
      if (path.includes('/approve'))  return 'APPROVE_RETURN';
      if (path.includes('/reject'))   return 'REJECT_RETURN';
      if (path.includes('/complete')) return 'COMPLETE_RETURN';
      if (method === 'POST')          return 'CREATE_RETURN';
      return 'RETURN_ACTION';
    },
  },
  // Sales V2 价格手动调价（高危：低价审批相关）
  {
    pathPattern: /^\/api\/v2\/sales\/price-books/,
    methods: ['POST', 'PATCH', 'PUT', 'DELETE'],
    bizType: 'SAL_PRICE',
    actionFn: (method) => {
      if (method === 'POST')   return 'CREATE_PRICEBOOK';
      if (method === 'DELETE') return 'DELETE_PRICEBOOK';
      return 'MODIFY_PRICEBOOK';
    },
  },
  // Sales V2 库存调整（FIFO 库存 Batch 手动操作）
  {
    pathPattern: /^\/api\/v2\/sales\/inventory/,
    methods: ['POST', 'PATCH'],
    bizType: 'SAL_INVENTORY',
    actionFn: (_method, path) => {
      if (path.includes('/adjust'))  return 'INVENTORY_ADJUST';
      if (path.includes('/write-off')) return 'INVENTORY_WRITEOFF';
      return 'INVENTORY_OP';
    },
  },
  // 系统配置修改（生产配置治理）
  {
    pathPattern: /^\/api\/system\/configs\//,
    methods: ['PATCH'],
    bizType: 'SYS_CONFIG',
    actionFn: () => 'MODIFY_CONFIG',
  },
];

/** 从 HTTP method 推导默认操作码 */
function defaultAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':   return 'CREATE';
    case 'PUT':
    case 'PATCH':  return 'MODIFY';
    case 'DELETE': return 'DELETE';
    default:       return method.toUpperCase();
  }
}

@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<any>();
    const method: string = req.method?.toUpperCase() ?? '';
    const path: string   = req.path ?? req.url ?? '';

    // 查找匹配规则
    const rule = LOG_RULES.find(
      r =>
        r.pathPattern.test(path) &&
        (r.methods.length === 0 || r.methods.includes(method)),
    );

    if (!rule) {
      return next.handle();
    }

    const user      = this.cls.get('user');
    const userId    = String(user?.userId ?? user?.id ?? '');
    const username  = user?.name ?? user?.username ?? '';
    const roles: string[] = user?.roles ?? (user?.role ? [user.role] : []);
    const roleCode  = roles[0] ?? '';
    const ip        = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                      ?? req.ip
                      ?? '';
    const userAgent = (req.headers['user-agent'] as string) ?? '';

    const actionCode = rule.actionFn
      ? rule.actionFn(method, path)
      : defaultAction(method);

    return next.handle().pipe(
      tap({
        next: (responseBody: any) => {
          // 异步写日志，不等待，不影响响应
          this.writeLog({
            userId,
            username,
            roleCode,
            moduleCode: '',        // MenuGuard 层无法轻松拿到，留空
            actionCode,
            bizType:    rule.bizType,
            bizId:      extractBizId(responseBody),
            bizNo:      extractBizNo(responseBody),
            requestMethod: method,
            requestPath:   path,
            ipAddress:     ip,
            userAgent,
            afterData:  safeSlice(responseBody),
            resultStatus: 'SUCCESS',
          }).catch(err =>
            console.error('[OperationLogInterceptor] write error:', err?.message),
          );
        },
        error: (err: any) => {
          this.writeLog({
            userId,
            username,
            roleCode,
            moduleCode:    '',
            actionCode,
            bizType:       rule.bizType,
            bizId:         null,
            bizNo:         null,
            requestMethod: method,
            requestPath:   path,
            ipAddress:     ip,
            userAgent,
            afterData:     { error: err?.message ?? String(err) },
            resultStatus: 'FAIL',
          }).catch(() => {});
        },
      }),
    );
  }

  private async writeLog(data: {
    userId: string; username: string; roleCode: string;
    moduleCode: string; actionCode: string; bizType: string;
    bizId: string | null; bizNo: string | null;
    requestMethod: string; requestPath: string;
    ipAddress: string; userAgent: string;
    afterData: Record<string, any> | null;
    resultStatus: string;
  }) {
    await this.ds.query(
      `INSERT INTO sys_operation_logs
        (user_id, username, role_code, module_code, action_code, biz_type,
         biz_id, biz_no, request_method, request_path, ip_address, user_agent,
         after_data, result_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        data.userId   || null,
        data.username || null,
        data.roleCode || null,
        data.moduleCode || null,
        data.actionCode,
        data.bizType,
        data.bizId    || null,
        data.bizNo    || null,
        data.requestMethod,
        data.requestPath,
        data.ipAddress || null,
        data.userAgent || null,
        data.afterData ? JSON.stringify(data.afterData) : null,
        data.resultStatus,
      ],
    );
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 从响应体中提取业务 ID */
function extractBizId(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  const id = body.id ?? body.data?.id ?? null;
  return id != null ? String(id) : null;
}

/** 从响应体中提取业务单号 */
function extractBizNo(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  return body.payNo ?? body.fundNo ?? body.poNo ?? body.reqNo
    ?? body.data?.payNo ?? body.data?.fundNo ?? body.data?.poNo
    ?? null;
}

/** 安全截取响应体（最多 10KB，防止 JSONB 爆炸） */
function safeSlice(body: any): Record<string, any> | null {
  if (!body || typeof body !== 'object') return null;
  try {
    const str = JSON.stringify(body);
    if (str.length <= 10_240) return body;
    return { _truncated: true, preview: str.slice(0, 500) };
  } catch {
    return { _serializeError: true };
  }
}
