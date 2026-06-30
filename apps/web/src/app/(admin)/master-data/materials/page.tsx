"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MaterialRuntimePage() {
  const { t } = useLanguage();
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader
        title={t('md.materialArchive', '物料档案')}
        subtitle={t('md.materialArchiveSub', '采购申请/订单的物品来源——饲料/兽药/包材/配件/建材等生产物资')}
        breadcrumb={[t('md.center', '主数据中心'), t('md.materialArchive', '物料档案')]}
      />
      <MasterDataRuntimePanel
        type="material"
        title={t('md.purchaseMaterial', '采购物料')}
        codeKey="material_code"
        nameKey="material_name"
        fields={[
          { key: "material_name", label: t('md.materialName', '物料名称'), required: true },
          { key: "material_type", label: t('md.materialType', '物料类型'), dictType: "PRC_MATERIAL_TYPE" },
          { key: "spec", label: t('md.specModel', '规格型号') },
          { key: "unit", label: t('md.measureUnit', '计量单位') },
          { key: "default_currency", label: t('md.commonCurrency', '常用币种'), dictType: "SYS_CURRENCY" },
          { key: "remark", label: t('md.remark', '备注') },
        ]}
        columns={[
          { key: "material_name", label: t('md.materialName', '物料名称') },
          { key: "material_type", label: t('md.type', '类型') },
          { key: "spec", label: t('md.spec', '规格') },
          { key: "unit", label: t('md.unit', '单位') },
        ]}
      />
    </div>
  );
}
