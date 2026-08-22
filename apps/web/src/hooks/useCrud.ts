'use client';
/**
 * @deprecated G21-3 — 新业务页一律使用 crudApi (lib/api-client.ts) + CrudPage 模板，
 *   不再用 useCrud hook。本 hook 暂保留兼容 daily/flock/medicine/immune/henhouse 5 个
 *   遗留页面，G23 阶段全部迁移完后整 hook 删除。
 *
 * 迁移指引：
 *   旧：const { fetchRecords, createRecord, updateRecord } = useCrud('brd_xxx')
 *       await createRecord(payload)
 *   新：import { crudApi } from '@/lib/api-client'
 *       await crudApi.create('brd_xxx', payload)
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useDialog } from '../contexts/DialogContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LatestRequestRunner } from '../lib/latest-request';

export const useCrud = (table: string) => {
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '') + '/api/crud';
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const { showAlert, showConfirm } = useDialog();
  const { t } = useLanguage();
  const requestGeneration = useRef(0);
  const listRequests = useRef(new LatestRequestRunner<any>());

  useEffect(() => () => listRequests.current.abort(), []);

  const httpMsg = (status: number): string => ({
    400: t('crud.err.400', '请求参数有误，请检查表单内容'),
    401: t('crud.err.401', '登录已过期，请重新登录'),
    403: t('crud.err.403', '您没有权限执行此操作'),
    404: t('crud.err.404', '请求的资源不存在'),
    409: t('crud.err.409', '数据冲突，请刷新后重试'),
    429: t('crud.err.429', '操作过于频繁，请稍后再试'),
    500: t('crud.err.500', '服务器内部异常，请联系管理员'),
  } as Record<number, string>)[status] ?? `${t('crud.err.unknown', '请求失败')} (${status})`;

  const executeReq = async (url: string, options: RequestInit = {}) => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_token') : null;
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Lang': (typeof window !== 'undefined' ? sessionStorage.getItem('phoenix_lang') : null) || 'zh',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return { success: true, data: await res.json().catch(() => ({})) };
      } else if (res.status === 401) {
        // 401 由全局 AuthFetchInterceptor 统一拦截并跳转登录，此处静默返回
        // 避免多个并发请求同时弹出"登录已过期"弹窗
        return { success: false, error: '__401__' };
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.msg || errData.message || httpMsg(res.status);
        if (process.env.NODE_ENV === 'development') console.error(`[useCrud:${table}] HTTP ${res.status}`, errData);
        throw new Error(msg);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' && options.signal?.aborted) {
        return { success: false, error: '__STALE__' };
      }
      let msg = err.message;
      if (err.name === 'AbortError') msg = t('crud.err.timeout', '网络超时，请检查连接后重试');
      console.error(`useCrud [${table}] Error:`, msg);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      options.signal?.removeEventListener('abort', abortFromCaller);
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const createRecord = useCallback(async (data: Record<string, unknown>, successMsg?: string) => {
    if (!data || Object.keys(data).length === 0) {
      await showAlert({ icon:'⚠️', type:'warning', title:t('crud.err.emptyTitle', '数据为空'), message:t('crud.err.empty', '检测到试图提交全空白的空气建档，已被拒绝。') });
      return false;
    }
    const hasMeaningfulData = Object.entries(data).some(([k, v]) => {
      if (['id','status','created_at','updated_at'].includes(k)) return false;
      return v !== null && v !== undefined && String(v).trim() !== '';
    });
    if (!hasMeaningfulData && Object.keys(data).length > 0) {
      await showAlert({ icon:'⚠️', type:'warning', title:t('crud.err.nearEmptyTitle', '表单几乎为空'), message:t('crud.err.nearEmpty', '必要字段全部为空，无法创建记录，请填写必要信息。') });
      return false;
    }
    const { success, error: reqErr } = await executeReq(`${API_BASE}/${table}`, { method:'POST', body:JSON.stringify(data) });
    if (success && successMsg) await showAlert({ icon:'✅', type:'success', title:t('common.success', '操作成功'), message:successMsg, confirmLabel:t('common.ok', '好的') });
    else if (!success && reqErr !== '__401__') await showAlert({ icon:'❌', type:'danger', title:t('crud.err.submitFailTitle', '提交失败'), message:reqErr||t('crud.err.submitFail', '网络连接失败，请检查服务器'), confirmLabel:t('common.close', '关闭') });
    return success;
  }, [table, showAlert, t]);

  const getRecords = useCallback(async (queryParams: Record<string, string | number> = {}) => {
    const qs = Object.keys(queryParams).length ? `?${new URLSearchParams(Object.fromEntries(Object.entries(queryParams).map(([k, v]) => [k, String(v)]))).toString()}` : '';
    // CRUD list reads are commonly issued immediately after a successful mutation.
    // Do not let the browser reuse a stale HTTP response for that refresh.
    return listRequests.current.run(async signal => {
      const { success, data } = await executeReq(`${API_BASE}/${table}${qs}`, { method:'GET', cache:'no-store', signal });
      return success ? (data.data || data) : null;
    });
  }, [table]);

  const updateRecord = useCallback(async (id: string | number, data: Record<string, unknown>, idColumn = 'id', successMsg?: string) => {
    const { success, error: reqErr } = await executeReq(`${API_BASE}/${table}/${idColumn}/${id}`, { method:'PUT', body:JSON.stringify(data) });
    if (success && successMsg) await showAlert({ icon:'✅', type:'success', title:t('common.success', '操作成功'), message:successMsg, confirmLabel:t('common.ok', '好的') });
    if (!success && reqErr !== '__401__') await showAlert({ icon:'❌', type:'danger', title:t('crud.err.updateFailTitle', '更新失败'), message:reqErr||t('crud.err.updateFail', '更新失败，请稍后重试'), confirmLabel:t('common.close', '关闭') });
    return success;
  }, [table, showAlert, t]);

  const deleteRecord = useCallback(async (id: string | number, idColumn = 'id', successMsg?: string, confirmMsg?: string) => {
    const _u = (() => { try { return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}'); } catch { return {}; } })();
    if (_u.role !== 'ROLE_ADMIN') {
      await showAlert({ icon:'🚫', type:'danger', title:t('crud.err.noPermTitle', '无权限'), message:t('crud.err.noPermission', '历史记录数据仅系统管理员可删除，如需处理请联系管理员。'), confirmLabel:t('common.understood', '知道了') });
      return false;
    }
    const ok = await showConfirm({ icon:'🗑️', type:'danger', title:t('crud.err.deleteConfirmTitle', '确认删除'), message:confirmMsg??t('crud.err.deleteConfirm', '确认删除此记录？删除后无法恢复。'), confirmLabel:t('crud.err.deleteConfirmBtn', '确认删除'), cancelLabel:t('common.cancel', '取消') });
    if (!ok) return false;
    const { success, error: reqErr } = await executeReq(`${API_BASE}/${table}/${idColumn}/${id}`, { method:'DELETE' });
    if (success && successMsg) await showAlert({ icon:'✅', type:'success', title:t('common.success', '操作成功'), message:successMsg, confirmLabel:t('common.ok', '好的') });
    if (!success && reqErr !== '__401__') await showAlert({ icon:'❌', type:'danger', title:t('crud.err.deleteFailTitle', '删除失败'), message:reqErr||t('crud.err.deleteFail', '删除失败，请稍后重试'), confirmLabel:t('common.close', '关闭') });
    return success;
  }, [table, showAlert, showConfirm, t]);

  return { createRecord, getRecords, fetchRecords: getRecords, updateRecord, deleteRecord, loading, error };
};
