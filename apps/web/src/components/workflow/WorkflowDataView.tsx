"use client";

import { useEffect, useMemo, useState } from "react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { workflowApi, type WorkflowFormField, type WorkflowFormSchema } from "@/lib/workflow-api";

type SourceOption = { label: string; value: string | number };

export function WorkflowDataView({
  data,
  schema,
}: {
  data: Record<string, unknown>;
  schema?: WorkflowFormSchema | null;
}) {
  const { t } = useLanguage();
  const fields = useMemo(() => schema?.fields || [], [schema]);
  const fieldMap = useMemo(() => new Map(fields.map(field => [field.key, field])), [fields]);
  const [sourceOptions, setSourceOptions] = useState<Record<string, SourceOption[]>>({});

  useEffect(() => {
    const sources = Array.from(new Set(fields
      .filter(field => field.type === "reference" && field.dataSource)
      .map(field => String(field.dataSource))));
    sources.forEach(source => {
      if (sourceOptions[source]) return;
      workflowApi.previewDataSource({ code: source })
        .then(res => setSourceOptions(prev => ({ ...prev, [source]: (res.data || []) as SourceOption[] })))
        .catch(() => setSourceOptions(prev => ({ ...prev, [source]: [] })));
    });
  }, [fields, sourceOptions]);

  const entries = Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.暂无表单数据。','暂无表单数据。')}</div></div>;

  return (
    <div className={s.infoGrid}>
      {entries.map(([key, value]) => {
        const field = fieldMap.get(key);
        const display = formatDisplayValue(value, field, sourceOptions);
        return (
          <div key={key} className={s.infoItem}>
            <div className={s.infoKey}>{field?.label || fieldLabel(key)}</div>
            <div className={s.infoVal}>{display.primary}</div>
            {display.secondary ? <div style={secondaryStyle}>{display.secondary}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function formatDisplayValue(
  value: unknown,
  field: WorkflowFormField | undefined,
  sourceOptions: Record<string, SourceOption[]>,
) {
  if (Array.isArray(value)) return { primary: value.join("、") };
  if (field?.type === "reference" && field.dataSource) {
    const raw = String(value);
    const matched = (sourceOptions[field.dataSource] || []).find(option => String(option.value) === raw);
    return matched ? { primary: matched.label, secondary: raw } : { primary: raw, secondary: "数据源匹配中或暂无名称" };
  }
  if ((field?.type === "select" || field?.type === "radio") && Array.isArray(field.options)) {
    const raw = String(value);
    const matched = field.options.find(option => String(option.value) === raw);
    return matched ? { primary: matched.label, secondary: raw } : { primary: raw };
  }
  if (typeof value === "object") return { primary: JSON.stringify(value) };
  return { primary: String(value) };
}

function fieldLabel(key: string) {
  const map: Record<string, string> = {
    amount: "金额",
    expense_type: "费用类型",
    store_code: "门店",
    reason: "申请原因",
    product_code: "物料/商品",
    quantity: "数量",
    budget_amount: "预算金额",
    need_date: "期望日期",
    payee: "收款方",
    payment_type: "付款类型",
    counterparty: "合同相对方",
    contract_amount: "合同金额",
    leave_type: "假期类型",
    start_time: "开始时间",
    end_time: "结束时间",
    warehouse: "仓库/门店",
    adjust_qty: "调整数量",
    adjust_type: "调整类型",
    batch_no: "批次号",
    exception_type: "异常类型",
    severity: "严重程度",
    description: "说明",
    proposal: "处理建议",
    shipment_no: "运输单号",
  };
  return map[key] || key;
}

const secondaryStyle: React.CSSProperties = { marginTop: 4, color: "var(--text-secondary)", fontSize: 12 };
