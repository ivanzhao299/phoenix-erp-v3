function text(value) {
  return value == null ? '' : String(value).trim();
}

function first(record, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], record);
    if (value != null && text(value)) return text(value);
  }
  return '';
}

function normalize(value) {
  return text(value).toLowerCase().replace(/[\s_\-—–·()（）]/g, '');
}

export function statusOf(record) {
  const rawData = record.rawData || {};
  for (const key of ['isStop', 'isStopped', 'disabled', 'isDisabled', 'isDelete', 'isDeleted']) {
    if (typeof rawData[key] === 'boolean') {
      return { raw: `${key}=${rawData[key]}`, productionState: rawData[key] ? 'INACTIVE' : 'ACTIVE' };
    }
  }
  for (const key of ['enabled', 'isEnabled', 'active', 'isActive', 'valid', 'isValid']) {
    if (typeof rawData[key] === 'boolean') {
      return { raw: `${key}=${rawData[key]}`, productionState: rawData[key] ? 'ACTIVE' : 'INACTIVE' };
    }
  }
  const raw = first(record, [
    'status',
    'rawData.status',
    'rawData.state',
    'rawData.statusEnum.value',
    'rawData.statusEnum.code',
    'rawData.statusEnum',
  ]);
  const normalized = normalize(raw);
  const active = ['a', 'active', 'enabled', 'enable', '1', 'true', '启用', '正常', '使用中'].includes(normalized);
  const inactive = ['i', 'inactive', 'disabled', 'disable', '0', 'false', '停用', '禁用', '已停用'].includes(normalized);
  return { raw: raw || 'UNKNOWN', productionState: active ? 'ACTIVE' : inactive ? 'INACTIVE' : 'UNKNOWN' };
}
