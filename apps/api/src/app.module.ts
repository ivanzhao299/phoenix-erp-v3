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
import { AuthExceptionFilter } from './common/filters/auth-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtStrategy } from './auth/jwt.strategy';
import { AuthModule } from './auth/auth.module';

// P1 Modules
import { FarmModule } from './modules/farm/farm.module';
import { OrderModule } from './modules/order/order.module';
import { StoreModule } from './modules/store/store.module';

// P2 Modules
import { ApprovalModule } from './modules/approval/approval.module';
import { FinanceModule }   from './modules/finance/finance.module';
import { FinanceV2Module } from './modules/finance-v2/finance-v2.module';
import { DebugController } from './debug.controller';
import { HealthController } from './health.controller';
import { WmsModule } from './modules/wms/wms.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
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
import { ProcurementV2Module } from './modules/procurement-v2/procurement-v2.module';
// [RBAC-2] 组织范围 + 数据范围全局模块
import { OrgModule } from './modules/org/org.module';
// [RBAC-4] 动态审批引擎
import { ApprovalEngineModule } from './modules/approval-engine/approval-engine.module';
// [Workflow Phase B] 站内通知中心
import { NotificationModule } from './modules/notification/notification.module';
// [Sales V2 Phase 0] Sales V2 Clean Baseline
import { SalesV2Module } from './modules/sales-v2/sales-v2.module';


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
    }),
    ScheduleModule.forRoot(),
    GenericCrudModule,
    MasterModule,
    FarmModule,
    OrderModule,
    StoreModule,
    ApprovalModule,
    FinanceModule,
    FinanceV2Module,       // Finance V2 Phase 0 Baseline
    WmsModule,
    LogisticsModule,
    ProcurementModule,
    AuthModule,
    TerminalModule,
    IotModule,
    BffModule,
    PermissionsModule,
    QualityModule,
    WorkflowModule,
    UploadModule,
    ProcurementV2Module,
    OrgModule,
    ApprovalEngineModule,
    NotificationModule,
    SalesV2Module,          // Sales V2 Phase 0 Clean Baseline
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
    StoreCodeInterceptor,
    // 统一 401 响应结构（注入 subcode）— 先注册，优先处理 UnauthorizedException
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
    // 全局兜底：屏蔽堆栈、映射 PG 错误码、统一 500 响应
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
