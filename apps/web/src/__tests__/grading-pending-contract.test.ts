import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const gradingPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/(terminal)/terminal/packaging/grading/page.tsx'),
  'utf8',
);
const sourcePage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/(terminal)/terminal/packaging/source-receive/page.tsx'),
  'utf8',
);
const api = fs.readFileSync(path.join(process.cwd(), 'src/lib/packaging-api.ts'), 'utf8');

describe('班次级分级 pending 契约', () => {
  it('强制以 shiftId 查询 pending，提交 DTO 字段与后端一致', () => {
    expect(gradingPage).toContain('getPendingGradingSourceBatches(shiftId)');
    expect(gradingPage).not.toContain('getTodaySourceBatches()');
    expect(api).toContain('shiftId: number;');
    expect(api).toContain('sourceBatchIds: number[];');
    expect(api).toContain('idempotencyKey: string;');
  });

  it('WIP 按用户、模式、班次隔离，成功清理来源输入并重拉服务端 pending', () => {
    expect(gradingPage).toContain("phoenix_grading_wip4_${identityKey}:${hasOpenShift ? shiftId : 'no-open-shift'}");
    expect(gradingPage).toContain('delete next[activeHouse.batch_key]');
    expect(gradingPage).toContain('await fetchSource.current()');
  });

  it('同舍多次采集展示为独立来源批次且更正精确到批次', () => {
    expect(sourcePage).toContain('batch-${record.batchId}');
    expect(sourcePage).toContain('sourceBatchId: corrTarget.batchId');
    expect(sourcePage).not.toContain('grouped.set(houseCode');
  });
});
