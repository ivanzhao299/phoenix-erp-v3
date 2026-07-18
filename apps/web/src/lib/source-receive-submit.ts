export interface SourceReceiveShift {
  id?: string | number | null;
  status?: string | null;
}

/** 集蛋录入必须归属一个已开班且有服务端 ID 的班次。 */
export function getOpenShiftId(shift: SourceReceiveShift | null | undefined): string | number | null {
  if (shift?.status !== 'OPEN' || shift.id == null) return null;
  return shift.id;
}

