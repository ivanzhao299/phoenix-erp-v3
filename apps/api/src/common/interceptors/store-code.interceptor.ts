import { Injectable } from '@nestjs/common';
import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { ClsService } from 'nestjs-cls';

/**
 * 全局数据隔离拦截器 (TypeORM Subscriber)
 * 作用:
 * 1. 拦截所有的 INSERT 操作，如果实体包含 `created_store_code` 字段，
 *    则自动注入当前用户的 `store_code`。
 * 2. 拦截所有的 UPDATE 操作，如果需要，可校验越权修改 (基于业务需要可扩展)。
 * 
 * 依赖: nestjs-cls (Context Local Storage) 获取请求上下文中的 User 信息。
 */
@Injectable()
@EventSubscriber()
export class StoreCodeInterceptor implements EntitySubscriberInterface<any> {
  constructor(private readonly cls: ClsService) {}

  /**
   * 监听所有的实体插入事件
   */
  beforeInsert(event: InsertEvent<any>) {
    // 从 CLS (请求上下文) 中获取当前经过 JwtStrategy 校验的用户信息
    const user = this.cls.get('user');
    
    // V3.0 规范: INSERT 时强制写入 created_store_code = user.store_code
    if (user && event.entity) {
      // 检查实体中是否定义了 created_store_code 字段
      if ('created_store_code' in event.entity) {
        // 如果用户具备多个 store_code（逗号分隔），插入记录时通常以主机构为准，
        // 或者直接写入该字符串由业务层进一步解析。此处直接赋原始值。
        event.entity.created_store_code = user.storeCode;
      }
      
      // 顺便处理标准审计字段 (如果有)
      if ('created_by' in event.entity && !event.entity.created_by) {
        event.entity.created_by = user.userId;
      }
      if ('updated_by' in event.entity && !event.entity.updated_by) {
        event.entity.updated_by = user.userId;
      }
    }
  }

  /**
   * 监听所有的实体更新事件
   */
  beforeUpdate(event: UpdateEvent<any>) {
    const user = this.cls.get('user');
    
    if (user && event.entity) {
      // 自动维护 updated_by 审计字段
      if ('updated_by' in event.entity) {
        event.entity.updated_by = user.userId;
      }
    }
  }
}
