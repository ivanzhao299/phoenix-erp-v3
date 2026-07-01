import type { MdField } from "@/components/master-data/MasterDataRuntimePanel";

// g200p-3c:11 字段分 4 组。Page 文件不能导出非页面字段，避免 Next 构建失败。
export const PRODUCT_FIELDS: MdField[] = [
  { key: "product_name",      label: "产品名称",        required: true, group: "基本信息" },
  { key: "product_name_zh",   label: "产品名称(中文)",  group: "基本信息" },
  { key: "product_name_lo",   label: "产品名称(老挝语)", group: "基本信息" },
  { key: "category_code",     label: "品类",            type: "select", group: "基本信息",
    options: [
      { value: "EGG_FRESH", label: "鲜鸡蛋" }, { value: "EGG_SALTED", label: "咸蛋" },
      { value: "EGG_PRESERVED", label: "皮蛋" }, { value: "EGG_PROCESSED", label: "深加工蛋品" },
      { value: "PACK_MATERIAL", label: "包材" }, { value: "FEED", label: "饲料" },
      { value: "PACKAGING", label: "包装物" }, { value: "FUEL", label: "燃料" },
      { value: "MEDICINE", label: "兽药" }, { value: "FINISHED_GOODS", label: "成品" },
      { value: "OTHER", label: "其他" },
    ] },
  { key: "unit_zh",           label: "计量单位(中文)",  group: "规格与保质" },
  { key: "unit_lo",           label: "计量单位(老挝语)", group: "规格与保质" },
  { key: "shelf_life_days",   label: "保质期(天)",      type: "number", group: "规格与保质" },
  { key: "specs",             label: "规格说明",        group: "规格与保质" },
  { key: "price_retail",      label: "零售价",          type: "number", group: "价格与图片" },
  { key: "price_wholesale",   label: "批发价",          type: "number", group: "价格与图片" },
  { key: "image_url",         label: "图片 URL",        group: "价格与图片" },
];
