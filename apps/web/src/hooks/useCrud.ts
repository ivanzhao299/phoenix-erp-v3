'use client';
import { useState, useCallback } from 'react';
import { useDialog } from '../contexts/DialogContext';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '') + '/api/crud';

const HTTP_MSG: Record<number, string> = {
  400: '请求参数有误，请检查表单内容',
  401: '登录已过期，请重新登录',
  403: '您没有权限执行此操作',
  404: '请求的资源不存在',
  409: '数据冲突，请刷新后重试',
  429: '操作过于频繁，请稍后再试',
  500: '服务器内部异常，请联系管理员',
};

export const useCrud = (table: string) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const { showAlert, showConfirm } = useDialog();

  const executeReq = async (url: string, options: RequestInit = {}) => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
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
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.msg || errData.message || (HTTP_MSG as any)[res.status] || `请求失败 (${res.status})`;
        if (process.env.NODE_ENV === 'development') console.error(`[useCrud:${table}] HTTP ${res.status}`, errData);
        throw new Error(msg);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      let msg = err.message;
      if (err.name === 'AbortError') msg = '网络超时，请检查连接后重试';
      console.error(`useCrud [${table}] Error:`, msg);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  };

  const createRecord = useCallback(async (data: any, successMsg = '提交成功') => {
    if (!data || Object.keys(data).length === 0) {
      await showAlert({ icon:'⚠️', type:'warning', title:'数据为空', message:'检测到试图提交全空白的空气建档，已被拒绝。' });
      return false;
    }
    const hasMeaningfulData = Object.entries(data).some(([k, v]) => {
      if (['id','status','created_at','updated_at'].includes(k)) return false;
      return v !== null && v !== undefined && String(v).trim() !== '';
    });
    if (!hasMeaningfulData && Object.keys(data).length > 0) {
      await showAlert({ icon:'⚠️', type:'warning', title:'表单几乎为空', message:'必要字段全部为空，无法创建记录，请填写必要信息。' });
      return false;
    }
    const { success, error: reqErr } = await executeReq(`${API_BASE}/${table}`, { method:'POST', body:JSON.stringify(data) });
    if (success && successMsg) await showAlert({ icon:'✅', type:'success', title:'操作成功', message:successMsg, confirmLabel:'好的' });
    else if (!success) await showAlert({ icon:'❌', type:'danger', title:'提交失败', message:reqErr||'网络连接失败，请检查服务器', confirmLabel:'关闭' });
    return success;
  }, [table, showAlert]);

  const getRecords = useCallback(async (queryParams: Record<string, any> = {}) => {
    const qs = Object.keys(queryParams).length ? `?${new URLSearchParams(queryParams).toString()}` : '';
    const { success, data } = await executeReq(`${API_BASE}/${table}${qs}`, { method:'GET' });
    return success ? (data.data || data) : null;
  }, [table]);

  const updateRecord = useCallback(async (id: any, data: any, idColumn = 'id', successMsg = '更新成功') => {
    const { success, error: reqErr } = await executeReq(`${API_BASE}/${table}/${idColumn}/${id}`, { method:'PUT', body:JSON.stringify(data) });
    if (success && successMsg) await showAlert({ icon:'✅', type:'success', title:'更新成功', message:successMsg, confirmLabel:'好的' });
    if (!success) await showAlert({ icon:'❌', type:'danger', title:'更新失败', message:reqErr||'更新失败，请稍后重试', confirmLabel:'关闭' });
    return success;
  }, [table, showAlert]);

  const deleteRecord = useCallback(async (id: any, idColumn = 'id', successMsg = '删除成功', confirmMsg = '确认删除此记录？删除后无法恢复。') => {
    const _u = (() => { try { return JSON.parse(sessionStorage.getItem('phoenix_user') || '{}'); } catch { return {}; } })();
    if (_u.role !== 'ROLE_ADMIN') {
      await showAlert({ icon:'🚫', type:'danger', title:'无权限', message:'历史记录数据仅系统管理员可删除，如需处理请联系管理员。', confirmLabel:'知道了' });
      return false;
    }
    const ok = await showConfirm({ icon:'🗑️', type:'danger', title:'确认删除', message:confirmMsg, confirmLabel:'确认删除', cancelLabel:'取消' });
    if (!ok) return false;
    const { success, error: reqErr } = await executeReq(`${API_BASE}/${table}/${idColumn}/${id}`, { method:'DELETE' });
    if (success && successMsg) await showAlert({ icon:'✅', type:'success', title:'删除成功', message:successMsg, confirmLabel:'好的' });
    if (!success) await showAlert({ icon:'❌', type:'danger', title:'删除失败', message:reqErr||'删除失败，请稍后重试', confirmLabel:'关闭' });
    return success;
  }, [table, showAlert, showConfirm]);

  return { createRecord, getRecords, fetchRecords: getRecords, updateRecord, deleteRecord, loading, error };
};
