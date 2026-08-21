import { describe, expect, it } from 'vitest';
import { getSystemAlertId, isSystemAlertNotification, resolveNotificationHref, summarizeNotificationContent } from './notification-routing';

describe('notification routing', () => {
  it.each([
    [{ notificationType: 'SYSTEM_ALERT' }, true],
    [{ notification_type: 'SYSTEM_ALERT' }, true],
    [{ linkType: 'SYSTEM_ALERT' }, true],
    [{ biz_type: 'SYS_ALERT' }, true],
    [{ notificationType: 'OTHER' }, false],
  ])('detects system alerts %#', (input, expected) => expect(isSystemAlertNotification(input)).toBe(expected));

  it.each([
    [{ notificationType: 'SYSTEM_ALERT', linkId: ' 12 ' }, '12'],
    [{ notificationType: 'SYSTEM_ALERT', biz_id: '9' }, '9'],
    [{ notificationType: 'SYSTEM_ALERT', bizNo: 'A9' }, null],
    [{ notificationType: 'OTHER', linkId: '1' }, null],
    [{ notificationType: 'SYSTEM_ALERT' }, null],
  ])('extracts valid alert ids %#', (input, expected) => expect(getSystemAlertId(input)).toBe(expected));

  it.each([
    [{ linkType: 'PAGE', linkId: '/finance2/ar' }, {}, '/finance2/ar'],
    [{ linkType: 'PAGE', linkId: 'https://evil.test' }, {}, '/notifications'],
    [{ linkType: '//evil.test' }, {}, '/notifications'],
    [{ linkType: '/warehouse/query' }, {}, '/warehouse/query'],
    [{ linkType: 'APPROVAL_INSTANCE', linkId: 'A 1' }, {}, '/workflow/todos?instanceId=A%201'],
    [{ linkType: 'APPROVAL_INSTANCE' }, { mobile: true }, '/mobile/workflow'],
    [{}, { mobile: true }, '/mobile/notifications'],
    [{ notificationType: 'SYSTEM_ALERT', linkId: '8' }, {}, '/system/alerts?alertId=8'],
    [{ notificationType: 'SYSTEM_ALERT', linkId: '8', content: '路径：/breeding/device?house=H1' }, { mobile: true }, '/mobile/device?house=H1&alertId=8'],
    [{ notificationType: 'SYSTEM_ALERT', content: '设备告警' }, { mobile: true }, '/mobile/device'],
  ])('resolves href %#', (input, options, expected) => expect(resolveNotificationHref(input, options)).toBe(expected));

  it('summarizes structured alert content', () => {
    expect(summarizeNotificationContent({ notificationType: 'SYSTEM_ALERT', content: '详情：{"houseCode":"H1","currentValue":31,"thresholdValue":30,"unit":"℃"}' }))
      .toContain('鸡舍 H1 · 当前 31℃ / 阈值 30℃');
  });
  it('keeps ordinary content', () => expect(summarizeNotificationContent({ content: 'hello' })).toBe('hello'));
});
