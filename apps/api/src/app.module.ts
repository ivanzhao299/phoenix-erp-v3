import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { MenuGuard } from './common/guards/menu.guard';
import { StoreCodeInterceptor } from './common/interceptors/store-code.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { OperationLogInterceptor } from './common/interceptors/operation-log.interceptor';
import { ApprovalHintInterceptor } from './common/interceptors/approval-hint.interceptor';
import { AuthExceptionFilter } from './common/filters/auth-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtStrategy } from './auth/jwt.strategy';
import { AuthModule } from './auth/auth.module';

// P1 Modules
// [Phase E] OrderModule 已删除 — Sales V2 完全替代旧 ord_orders 链路；
//           ord_* 表保留为只读历史数据（见 docs/legacy-ord-tables-archive.md）
import { FarmModule } from './modules/farm/farm.module';
import { StoreModule } from './modules/store/store.module';

// P2 Modules
// [Phase 2C] ApprovalModule 已删除 — 旧规则审批引擎，已被 ApprovalEngineModule 替代
import { FinanceV2Module } from './modules/finance-v2/finance-v2.module';
import { DebugController } from './debug.controller';
import { HealthController } from './health.controller';
import { WmsModule } from './modules/wms/wms.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { GenericCrudModule } from './modules/generic-crud/generic-crud.module';
import { MasterModule } from './modules/master/master.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { IotModule } from './modules/iot/iot.module';
import { BffModule } from './modules/bff/bff.module';
// [V3 RBAC 完善] 角色权限矩阵专用模块
import { PermissionsModule } from './modules/permissions/permissions.module';
import { QualityModule } from './modules/quality/quality.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { UploadModule } from './modules/upload/upload.module';
import { FileModule } from './modules/file/file.module';
import { ProcurementV2Module } from './modules/procurement-v2/procurement-v2.module';
// [Shareholder Runtime Phase 1] 股东权益与出资台账
import { ShareholderModule } from './modules/shareholder/shareholder.module';
// [RBAC-2] 组织范围 + 数据范围全局模块
import { OrgModule } from './modules/org/org.module';
// [RBAC-4] 动态审批引擎
import { ApprovalEngineModule } from './modules/approval-engine/approval-engine.module';
// [Workflow Phase B] 站内通知中心
import { NotificationModule } from './modules/notification/notification.module';
// [Sales V2 Phase 0] Sales V2 Clean Baseline
import { SalesV2Module } from './modules/sales-v2/sales-v2.module';
// [Production Stabilization Phase 1] 系统监控 + 配置治理 + 错误追踪
import { SystemMonitorModule } from './modules/system-monitor/system-monitor.module';
// [G126] 全局 cron 心跳自监控（评分补强 P6）
import { CronMonitorModule } from './modules/system-monitor/cron-monitor.module';
// [Phase E] UAT & Pilot Run Runtime
import { UatModule } from './modules/uat/uat.module';
// [Sales V2 Phase 9] 直营店收银作业台
import { StorePosModule } from './modules/store-pos/store-pos.module';
// [Product Master Phase H2] 产品主数据基础层（等级/规格/SKU）
import { ProductMasterModule } from './modules/product-master/product-master.module';
import { TraceabilityModule } from './modules/traceability/traceability.module';
import { MasterDataCenterModule } from './modules/master-data/master-data-center.module';
// [G5] Data Quality Center
import { DataQualityModule } from './modules/data-quality/data-quality.module';
// [G6] Business Analytics Center
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BusinessUnitModule } from './modules/business-unit/business-unit.module';
import { PermissionSetsModule } from './modules/permission-sets/permission-sets.module';
// [Chanjet] 畅捷通好业财开放平台对接（webhook + token + API）
import { ChanjetModule } from './modules/chanjet/chanjet.module';
import { StorePaymentModule } from './modules/store-payment/store-payment.module';
import { DocumentIntelligenceModule } from './modules/document-intelligence/document-intelligence.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 速率限制：仅在生产环境启用；开发环境 skipIf 直接放行，避免 React Strict Mode
    // 双重挂载 + 多标签页并发把 127.0.0.1 同一 bucket 打满触发 blockDuration 死锁
    ThrottlerModule.forRoot({
      skipIf: () => process.env.NODE_ENV !== 'production',
      throttlers: [
        // 只保留 login 限流；全局 limit 已移除：
        // API 跑在 Docker 里，Next.js 以同一内网 IP 代理所有请求，
        // 全局 bucket 共享会误伤所有用户触发 429
        { name: 'login', ttl: 900_000, limit: 10 },
      ],
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'mac',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'phoenix_erp',
      autoLoadEntities: true,
      synchronize: false, // 严格使用 DDL，禁用同步
      // G89 性能：连接池扩容 + 连接获取超时。默认 max=10，BFF 驾驶舱一次 11 个
      //   并行查询即打满导致排队；提到 20 给并行聚合留余量（PG 默认 max_connections=100）。
      extra: {
        max: parseInt(process.env.DB_POOL_MAX || '20', 10),
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    }),
    ScheduleModule.forRoot(),
    GenericCrudModule,
    MasterModule,
    FarmModule,
    StoreModule,
    FinanceV2Module,       // Finance V2 Phase 0 Baseline
    WmsModule,
    ProcurementModule,
    AuthModule,
    TerminalModule,
    IotModule,
    BffModule,
    PermissionsModule,
    QualityModule,
    WorkflowModule,
    UploadModule,
    FileModule,
    ProcurementV2Module,
    ShareholderModule,     // Shareholder Runtime Phase 1
    OrgModule,
    ApprovalEngineModule,
    NotificationModule,
    SalesV2Module,          // Sales V2 Phase 0 Clean Baseline
    SystemMonitorModule,    // Production Stabilization Phase 1
    CronMonitorModule,      // G126 全局 cron 心跳自监控

    UatModule,              // Phase E: UAT & Pilot Run Runtime
    StorePosModule,         // Sales V2 Phase 9: 直营店收银作业台
    ProductMasterModule,    // Product Master Phase H2: 等级/规格/SKU 主数据
    TraceabilityModule,     // R5: 统一追溯 Runtime（鸡舍→…→库存→销售→客户→财务）
    MasterDataCenterModule, // G1: 主数据中心（编码生成/审计/数据质量）
    DataQualityModule,      // G5: 数据质量中心（7 维度健康评分 + 告警聚合）
    AnalyticsModule,        // G6: 经营分析中心（8 个分析子中心聚合层）
    BusinessUnitModule,     // G110/S5: 事业群业务维度（法人树⟂事业群解耦）
    PermissionSetsModule,   // G118: 权限集（PBAC 两层模型）CRUD
    ChanjetModule,          // 畅捷通好业财对接（webhook 回调 + token 管理 + API 代理）
    StorePaymentModule,     // Store Payment: 直营店缴款 runtime endpoints
    DocumentIntelligenceModule, // 受控附件文档识别/表单回填标准入口
  ],
  controllers: [DebugController, HealthController],
  providers: [
    JwtStrategy,
    // ThrottlerGuard 不全局挂载——仅在 auth.controller login 端点单独 @UseGuards
    // 全局挂载拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    // 高敏感操作日志（RBAC-1）
    {
      provide: APP_INTERCEPTOR,
      useClass: OperationLogInterceptor,
    },
    // 审批提交后注入「下一审批人」摘要到响应，前端统一提示"提交给谁审批"
    {
      provide: APP_INTERCEPTOR,
      useClass: ApprovalHintInterceptor,
    },
    StoreCodeInterceptor,
    // 统一 401 响应结构（注入 subcode）— 先注册，优先处理 UnauthorizedException
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
    // 全局兜底：屏蔽堆栈、映射 PG 错误码、统一 500 响应
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
