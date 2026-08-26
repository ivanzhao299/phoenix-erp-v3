"use client";
import { useState, useEffect, useCallback, memo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import styles from "./crudForm.module.css";
import { DictSelect } from "@/components/shared-selectors/DictSelect";
import {
  CompanySelector, CustomerSelector, SupplierSelector, ProjectSelector,
  WarehouseSelector, ZoneSelector, LocationSelector, SkuSelector,
  UserSelector, InventoryItemSelector, DepartmentSelector,
  // G4-C：销售域
  StoreSelector, ChannelSelector, DriverSelector, VehicleSelector,
  // G4-E：生产/包装域
  FarmSelector, HouseSelector, FlockSelector, GradeSelector, SpecSelector, ShiftSelector,
  // 库存批次
  BatchSelector,
} from "@/components/shared-selectors/MasterDataSelectors";
import { AttachmentUploader, ManagedAttachmentUploader } from "@/components/design-system";

/**
 * G4-D：CrudForm 新增主数据 / 字典 / 附件类型
 *  · 主数据：company / customer / supplier / project / warehouse / zone / location / sku / user
 *  · 字典：dict（必填 dictType）
 *  · 附件：attachment（统一 AttachmentUploader，禁 URL 文本框）
 *  · 联动：filterBy.companyCode / warehouseCode / zoneCode 支持级联
 *  · 自动带出：onPick(rawField → targetKey) 通过 onPickKeys 配置（如 {"warehouse_name":"warehouse_name"}）
 */
export type FieldType =
  | "text" | "number" | "select" | "date" | "datetime" | "textarea" | "readonly" | "upload"
  | "company" | "customer" | "supplier" | "project"
  | "warehouse" | "zone" | "location" | "sku" | "user"
  | "inventory-item" | "department"
  // G4-C：销售域
  | "store" | "channel" | "driver" | "vehicle"
  // G4-E：生产/包装域
  | "farm" | "house" | "flock" | "grade" | "spec" | "shift"
  // 库存批次（inv_batches）
  | "batch"
  | "dict" | "attachment";

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  span?: 1 | 2;
  defaultValue?: string | number;
  // G4-D 扩展
  dictType?: string;                                                    // type='dict' 必填
  // G17：filterBy 同时支持「字段引用」(*Field) 和「固定值」(直传 siteCode/farmCode/companyCode)
  filterBy?: {
    companyField?: string; warehouseField?: string; zoneField?: string; farmField?: string; houseField?: string;
    siteCode?: string; farmCode?: string; companyCode?: string;
  };
  valueField?: 'code' | 'id' | 'username';                              // user/cashAccount
  onPickKeys?: Record<string, string>;                                   // 主数据自动带出：{ 目标 key: raw 字段名 }
  visibleWhen?: { field: string; values: Array<string | number> };        // 按其它字段值显隐
  allowedValuesByField?: { field: string; values: Record<string, readonly string[]> };
  validate?: (value: unknown, values: Record<string, unknown>) => string | undefined;
}

interface CrudFormProps {
  fields: FormField[];
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
}

function buildInitValues(
  fields: FormField[],
  initialValues: Record<string, unknown>
): Record<string, unknown> {
  const init: Record<string, unknown> = { ...initialValues };
  fields.forEach(f => {
    init[f.key] = initialValues[f.key] ?? f.defaultValue ?? "";
  });
  return init;
}

// ✅ React.memo 防止父组件重渲染时 CrudForm 无意义重渲染
export const CrudForm = memo(function CrudForm({
  fields,
  initialValues = {},
  onSubmit,
  onCancel,
  loading,
  submitLabel: _submitLabel,
}: CrudFormProps) {
  const { t } = useLanguage();
  const submitLabel = _submitLabel ?? t('common.save', '保存');

  const [values, setValues] = useState<Record<string, unknown>>(
    () => buildInitValues(fields, initialValues)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // 修复（编辑表单空白）：原逻辑只在 initialValues.id 变化时重置，但各页传入的
  // initialValues 多为映射后的对象（不含 id），导致 id 恒为 undefined、永不重置，
  // 编辑时带不出原数据。改为按 initialValues 的"内容"（JSON 序列化）判断是否变化：
  //   · 父组件每次渲染虽生成新对象，但内容相同 → 序列化字符串相同 → 不会误重置（保留用户输入）
  //   · 切换记录 / 新建↔编辑 → 内容变化 → 重置为该条原数据
  const initKey = JSON.stringify(initialValues ?? {});
  useEffect(() => {
    setValues(buildInitValues(fields, initialValues));
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  const set = useCallback((key: string, val: unknown) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setErrors(prev => prev[key] ? { ...prev, [key]: "" } : prev);
  }, []);

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    fields.forEach(f => {
      if (f.visibleWhen && !f.visibleWhen.values.includes(values[f.visibleWhen.field] as string | number)) return;
      if (f.required && !values[f.key] && values[f.key] !== 0) {
        errs[f.key] = `${f.label}${t('ui.不能为空', '不能为空')}`;
        return;
      }
      const allowed = f.allowedValuesByField?.values[String(values[f.allowedValuesByField.field] ?? '')];
      if (allowed && values[f.key] && !allowed.includes(String(values[f.key]))) {
        errs[f.key] = `${f.label}${t('ui.与当前业务类型不匹配', '与当前业务类型不匹配')}`;
        return;
      }
      const customError = f.validate?.(values[f.key], values);
      if (customError) errs[f.key] = customError;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [fields, values]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      // ✅ 提交时才做 number 类型转换，避免输入过程中转换破坏中间状态（如小数点）
      const submitValues: Record<string, unknown> = { ...values };
      fields.forEach(f => {
        const val = values[f.key];
        if (f.type === "number" && val !== "" && val !== null && val !== undefined) {
          const n = Number(val);
          submitValues[f.key] = isNaN(n) ? val : n;
        } else {
          submitValues[f.key] = val;
        }
      });
      await onSubmit(submitValues);
    }
    finally { setSubmitting(false); }
  }, [validate, onSubmit, values, fields]);

  const isLoading = loading || submitting;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.grid}>
        {fields.map(field => {
          if (field.visibleWhen && !field.visibleWhen.values.includes(values[field.visibleWhen.field] as string | number)) {
            return null;
          }
          return (
          <div
            key={field.key}
            className={`${styles.fieldGroup} ${field.span === 2 ? styles.fullSpan : ""}`}
          >
            <label className={styles.label}>
              {field.label}
              {field.required && <span className={styles.required}>*</span>}
            </label>

            {field.type === "textarea" ? (
              <textarea
                className={`${styles.input} ${styles.textarea} ${errors[field.key] ? styles.hasError : ""}`}
                value={String(values[field.key] ?? "")}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
              />
            ) : field.type === "select" ? (
              <select
                className={`${styles.input} ${errors[field.key] ? styles.hasError : ""}`}
                value={String(values[field.key] ?? "")}
                onChange={e => set(field.key, e.target.value)}
              >
                <option value="">{t('ui.请选择', '— 请选择 —')}</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.type === "readonly" ? (
              <div className={styles.readonlyValue}>
                {String(values[field.key] ?? "—")}
              </div>
            ) : field.type === "upload" ? (
              <ManagedAttachmentUploader
                value={values[field.key]}
                onChange={v => set(field.key, v)}
                storage="json-string"
                label={t('ui.上传附件（PDF/图片 ≤15MB，可多个）', '上传附件（PDF/图片 ≤15MB，可多个）')}
              />
            ) : field.type === "attachment" ? (
              // G4-D：统一附件上传，禁 URL 文本框
              <AttachmentUploader
                value={(() => { const v = values[field.key]; return Array.isArray(v) ? v as string[] : (v ? [String(v)] : []); })()}
                onChange={urls => set(field.key, urls[urls.length - 1] ?? "")}
              />
            ) : field.type === "dict" ? (
              <DictSelect
                dictType={field.dictType!}
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                placeholder={field.placeholder}
                allowEmpty={!field.required}
                allowedValues={field.allowedValuesByField?.values[String(values[field.allowedValuesByField.field] ?? '')]}
              />
            ) : field.type === "company" ? (
              <CompanySelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "customer" ? (
              <CustomerSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "supplier" ? (
              <SupplierSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "project" ? (
              <ProjectSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "warehouse" ? (
              <WarehouseSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                companyCode={field.filterBy?.companyField ? String(values[field.filterBy.companyField] ?? "") : field.filterBy?.companyCode}
                siteCode={field.filterBy?.siteCode}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "zone" ? (
              <ZoneSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                warehouseCode={field.filterBy?.warehouseField ? String(values[field.filterBy.warehouseField] ?? "") : undefined} />
            ) : field.type === "location" ? (
              <LocationSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                warehouseCode={field.filterBy?.warehouseField ? String(values[field.filterBy.warehouseField] ?? "") : undefined}
                zoneCode={field.filterBy?.zoneField ? String(values[field.filterBy.zoneField] ?? "") : undefined} />
            ) : field.type === "sku" ? (
              <SkuSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "inventory-item" ? (
              <InventoryItemSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "department" ? (
              <DepartmentSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                companyCode={field.filterBy?.companyField ? String(values[field.filterBy.companyField] ?? "") : field.filterBy?.companyCode} />
            ) : field.type === "batch" ? (
              <BatchSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "user" ? (
              <UserSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                valueField={field.valueField === 'id' ? 'id' : 'username'} />
            ) : field.type === "farm" ? (
              <FarmSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "house" ? (
              <HouseSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                farmCode={field.filterBy?.farmField ? String(values[field.filterBy.farmField] ?? "") : field.filterBy?.farmCode}
                siteCode={field.filterBy?.siteCode}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "flock" ? (
              <FlockSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                farmCode={field.filterBy?.farmField ? String(values[field.filterBy.farmField] ?? "") : undefined}
                houseCode={field.filterBy?.houseField ? String(values[field.filterBy.houseField] ?? "") : undefined} />
            ) : field.type === "grade" ? (
              <GradeSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "spec" ? (
              <SpecSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                onPick={o => {
                  Object.entries(field.onPickKeys ?? {}).forEach(([k, rawField]) => {
                    set(k, (o as any)?.raw?.[rawField] ?? o?.label ?? "");
                  });
                }} />
            ) : field.type === "shift" ? (
              <ShiftSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)} />
            ) : field.type === "store" ? (
              <StoreSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                companyCode={field.filterBy?.companyField ? String(values[field.filterBy.companyField] ?? "") : undefined} />
            ) : field.type === "channel" ? (
              <ChannelSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)} />
            ) : field.type === "driver" ? (
              <DriverSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                companyCode={field.filterBy?.companyField ? String(values[field.filterBy.companyField] ?? "") : undefined} />
            ) : field.type === "vehicle" ? (
              <VehicleSelector
                value={String(values[field.key] ?? "")}
                onChange={v => set(field.key, v)}
                companyCode={field.filterBy?.companyField ? String(values[field.filterBy.companyField] ?? "") : undefined} />
            ) : (
              <input
                className={`${styles.input} ${errors[field.key] ? styles.hasError : ""}`}
                type={field.type === "datetime" ? "datetime-local" : field.type}
                value={String(values[field.key] ?? "")}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}

            {errors[field.key] && (
              <span className={styles.errorMsg}>{errors[field.key]}</span>
            )}
          </div>
        );})}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={isLoading}>
          {t('common.cancel', '取消')}
        </button>
        <button type="submit" className={styles.btnSubmit} disabled={isLoading}>
          {isLoading ? t('ui.保存中', '保存中...') : submitLabel}
        </button>
      </div>
    </form>
  );
});
