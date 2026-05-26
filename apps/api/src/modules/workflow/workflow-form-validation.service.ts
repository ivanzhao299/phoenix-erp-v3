import { Injectable } from '@nestjs/common';

/**
 * Workflow Form Validation Service
 * 基于 JSON Schema 的服务端表单校验。
 *
 * 支持：required / string maxLength / number minimum-maximum / enum
 * 不引入 eval 或复杂低代码引擎。
 */
@Injectable()
export class WorkflowFormValidationService {
  /**
   * 校验表单数据。
   * @returns errors — key 为字段名，value 为中文错误提示；空对象表示校验通过。
   */
  validate(schema: Record<string, any>, data: Record<string, any>): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!schema || typeof schema !== 'object') return errors;

    const properties: Record<string, any> = schema.properties ?? {};
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];

    // ── 1. required 校验 ──────────────────────────────────────────────────────
    for (const key of required) {
      const val = data[key];
      if (val === undefined || val === null || val === '') {
        const title = properties[key]?.title ?? key;
        errors[key] = `${title} 为必填项`;
      }
    }

    // ── 2. 字段规则校验 ────────────────────────────────────────────────────────
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!propSchema || typeof propSchema !== 'object') continue;
      const val = data[key];

      // 跳过空值（未填写的非必填字段）
      if (val === undefined || val === null || val === '') continue;
      // 已有 required 错误则跳过
      if (errors[key]) continue;

      const title: string = propSchema.title ?? key;
      const type: string  = propSchema.type ?? 'string';

      if (type === 'string') {
        const strVal = String(val);

        if (propSchema.maxLength !== undefined && strVal.length > Number(propSchema.maxLength)) {
          errors[key] = `${title} 长度不能超过 ${propSchema.maxLength} 个字符（当前 ${strVal.length}）`;
          continue;
        }

        if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(strVal)) {
          errors[key] = `${title} 值不在允许的范围内（${propSchema.enum.join(' / ')}）`;
          continue;
        }
      }

      if (type === 'number' || type === 'integer') {
        const num = Number(val);
        if (Number.isNaN(num)) {
          errors[key] = `${title} 必须是有效数字`;
          continue;
        }
        if (type === 'integer' && !Number.isInteger(num)) {
          errors[key] = `${title} 必须是整数`;
          continue;
        }
        if (propSchema.minimum !== undefined && num < Number(propSchema.minimum)) {
          errors[key] = `${title} 不能小于 ${propSchema.minimum}`;
          continue;
        }
        if (propSchema.maximum !== undefined && num > Number(propSchema.maximum)) {
          errors[key] = `${title} 不能大于 ${propSchema.maximum}`;
          continue;
        }
        if (Array.isArray(propSchema.enum)) {
          const allowed = propSchema.enum.map(Number);
          if (!allowed.includes(num)) {
            errors[key] = `${title} 值不在允许的范围内`;
          }
        }
      }

      if (type === 'boolean') {
        if (val !== true && val !== false && val !== 'true' && val !== 'false') {
          errors[key] = `${title} 必须是布尔值`;
        }
      }
    }

    return errors;
  }

  /** 快捷方法：有任何错误则抛出 BadRequest 格式的错误详情 */
  assertValid(schema: Record<string, any>, data: Record<string, any>): void {
    const errors = this.validate(schema, data);
    if (Object.keys(errors).length > 0) {
      // 调用方自行用 BadRequestException 包装
      throw Object.assign(new Error('FORM_VALIDATION_FAILED'), { errors });
    }
  }
}
