"use client";

import { useEffect, useState, useMemo } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

// ✅ V3 表: ord_prices（合同价格表）
// 价格执行复盘 = 对比 ord_prices（合同价）与 ord_order_items（实际成交价）
// 字段: price_code, customer_code, sku_code, sku_name, unit_price, floor_price
import u from "@/styles/uix-utils.module.css";
interface PriceRecord {
  id: number;
  price_code: string;
  customer_code: string;
  sku_code: string;
  sku_name: string;
  unit_price: number;
  floor_price: number;
}
interface OrderItem {
  id: number;
  order_no: string;
  product_code: string;
  unit_price: number;
  qty: number;
  amount: number;
}
export default function PriceReviewPage() {
  const {
    t
  } = useLanguage();
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([crudApi.list<PriceRecord>("ord_prices", {
      limit: 200
    }), crudApi.list<OrderItem>("ord_order_items", {
      limit: 500
    })]).then(([pRes, iRes]) => {
      setPrices(pRes.data ?? []);
      setItems(iRes.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // 对比：实际成交价 vs 合同价 / 底价
  const review = useMemo(() => {
    return items.map(item => {
      const contract = prices.find(p => p.sku_code === item.product_code);
      if (!contract) return null;
      const diff = item.unit_price - contract.unit_price;
      const belowFloor = item.unit_price < contract.floor_price;
      return {
        ...item,
        contract_price: contract.unit_price,
        floor_price: contract.floor_price,
        diff,
        belowFloor
      };
    }).filter(Boolean);
  }, [prices, items]);
  const belowFloorCount = review.filter(r => r!.belowFloor).length;
  return <div>
      <PageHeader title={t('ui.价格执行复盘', '价格执行复盘')} subtitle={t('ui.对比实际成交价与合同价', '对比实际成交价与合同价，识别低于底价的风险订单')} />

      {/* KPI 摘要 */}
      <div style={{
      display: "flex",
      gap: 16,
      marginBottom: 24
    }}>
        {[{
        label: t('ui.合同价档位', '合同价档位'),
        value: prices.length,
        color: "var(--status-info)"
      }, {
        label: t('ui.分析订单行', '分析订单行'),
        value: review.length,
        color: "var(--status-success)"
      }, {
        label: t('ui.低于底价', '低于底价'),
        value: belowFloorCount,
        color: belowFloorCount > 0 ? "var(--status-danger)" : "var(--status-success)"
      }].map(k => <div key={k.label} style={{
        background: "var(--bg-card)",
        border: "1px solid var(--bg-card)",
        borderRadius: 12,
        padding: "16px 24px",
        flex: 1,
        textAlign: "center"
      }}>
            <div style={{
          fontSize: "1.8rem",
          fontWeight: 800,
          color: k.color
        }}>{loading ? "—" : k.value}</div>
            <div style={{
          fontSize: "0.8rem",
          color: "var(--text-secondary)",
          marginTop: 4
        }}>{k.label}</div>
          </div>)}
      </div>

      {/* 明细表 */}
      <div style={{
      background: "var(--bg-card)",
      borderRadius: 12,
      border: "1px solid var(--bg-card)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('ui.订单号', '订单号'), t('ui.品级编码', '品级编码'), t('ui.实际单价', '实际单价'), t('ui.合同单价', '合同单价'), t('ui.底价', '底价'), t('ui.差额', '差额'), t('common.status', '状态')].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className={u.emptyPad40}>{t('common.loading', '加载中...')}</td></tr> : review.length === 0 ? <tr><td colSpan={7} className={u.emptyPad40}>{t('ui.暂无可对比数据', '暂无可对比数据（需先维护合同价档位）')}</td></tr> : review.map((r, i) => <tr key={i} style={{
            background: r!.belowFloor ? "var(--status-danger-bg-faint)" : "transparent"
          }}>
                <td>{r!.order_no}</td>
                <td>{r!.product_code}</td>
                <td style={{
              fontWeight: 700,
              color: r!.belowFloor ? "var(--status-danger)" : "var(--text-primary)"
            }}>{Number(r!.unit_price).toFixed(2)}</td>
                <td className={u.muted}>{Number(r!.contract_price).toFixed(2)}</td>
                <td className={u.muted}>{Number(r!.floor_price).toFixed(2)}</td>
                <td style={{
              fontWeight: 700,
              color: r!.diff >= 0 ? "var(--status-success)" : "var(--status-danger)"
            }}>
                  {r!.diff >= 0 ? <TrendingUp size={12} style={{
                marginRight: 4
              }} /> : <TrendingDown size={12} style={{
                marginRight: 4
              }} />}
                  {Number(r!.diff).toFixed(2)}
                </td>
                <td>
                  {r!.belowFloor ? <span style={{
                fontSize: "0.72rem",
                background: "var(--status-danger)",
                color: "var(--bg-card)",
                padding: "2px 8px",
                borderRadius: 4,
                fontWeight: 700
              }}>{t('ui.低于底价', '低于底价')}</span> : <span style={{
                fontSize: "0.72rem",
                color: "var(--status-success)"
              }}>{t('status.normal', '正常')}</span>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}