export interface PackingFlowItem { grade:string; spec:string; specId:string; boxes:number; eggs:number }
export function packedByGrade(items: PackingFlowItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((out, item) => { out[item.grade] = (out[item.grade] || 0) + item.eggs; return out; }, {});
}
export function remainingByGrade(codes: string[], server: Record<string, number>, items: PackingFlowItem[]): Record<string, number> {
  const local = packedByGrade(items);
  return Object.fromEntries(codes.map(code => [code, Math.max(0, (server[code] ?? 0) - (local[code] || 0))]));
}
export function addPackingItem(items: PackingFlowItem[], next: PackingFlowItem): PackingFlowItem[] {
  if (next.boxes <= 0 || next.eggs <= 0) return items;
  const index = items.findIndex(item => item.grade === next.grade && item.specId === next.specId);
  return index < 0 ? [...items, next] : items.map((item, i) => i === index ? { ...item, boxes:item.boxes + next.boxes, eggs:item.eggs + next.eggs } : item);
}
export function canAddPacking(input: { grade?:string|null; specQty?:number|null; boxes:number; available:number }): boolean {
  const eggs = input.boxes * (input.specQty || 0);
  return !!input.grade && !!input.specQty && input.boxes > 0 && eggs > 0 && eggs <= input.available;
}
