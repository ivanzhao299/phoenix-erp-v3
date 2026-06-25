'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileImage, FileText, Settings2, Upload, X } from 'lucide-react';
import { isProtectedFileRef, isUnsafeAttachmentRef } from '@/lib/attachments';

/**
 * AttachmentUploader — 统一多附件上传（基于现有 /api/upload/contract 通道）。
 * value: string[]（受控 fileId 或历史附件引用列表）；onChange 返回新列表。审批后 readOnly 只读。
 */
export interface AttachmentUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  readOnly?: boolean;
  label?: string;
  apiBase?: string;
}

export function AttachmentUploader({ value, onChange, readOnly, label = '上传附件（PDF/图片 ≤15MB）', apiBase }: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [devicePanelOpen, setDevicePanelOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraHint, setCameraHint] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const token = (typeof window !== 'undefined'
    && (sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token'))) || '';
  const base = apiBase ?? (process.env.NEXT_PUBLIC_API_BASE || '');

  useEffect(() => () => stopCamera(), []);

  // G134：支持一次多选 + 多次累加。批量内逐个串行上传，全部成功的 url 一次性合并进 value
  //   （避免并行 onChange 各读到 stale value 互相覆盖，导致"只剩最后一个"）。
  const MAX_MB = 15;   // 与应用层 FileInterceptor(15MB) + nginx(20m) 一致（原 10 与"≤15MB"标签不符）
  const uploadFiles = async (files: File[]) => {
    setErr(''); setUploading(true);
    const added: string[] = [];
    const errs: string[] = [];
    try {
      for (const file of files) {
        if (file.size > MAX_MB * 1024 * 1024) {
          errs.push(`${file.name}：超出 ${MAX_MB}MB（${(file.size / 1024 / 1024).toFixed(1)}MB）`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`${base}/api/upload/contract`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd });
        // G30：5xx 返 text/HTML，不强 JSON.parse（防 "Unexpected token 'I'" 报错）
        const ct = res.headers.get('content-type') || '';
        if (!res.ok) {
          const detail = ct.includes('application/json') ? (await res.json().catch(() => ({})))?.message : await res.text().catch(() => '');
          errs.push(`${file.name}：上传失败 (${res.status})${detail ? '，' + String(detail).slice(0, 80) : ''}`);
          continue;
        }
        const json = ct.includes('application/json') ? await res.json() : {};
        if (json?.fileId) added.push(String(json.fileId));
        else if (json?.url) added.push(String(json.url));
        else errs.push(`${file.name}：服务端未返回受控 fileId`);
      }
      if (added.length) onChange([...value, ...added]);
      if (errs.length) setErr(errs.join('；'));
    } catch (e: any) { setErr(e?.message || '上传失败'); }
    finally { setUploading(false); }
  };

  async function loadVideoDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraHint('当前浏览器不支持摄像头设备枚举');
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cameras = devices.filter(device => device.kind === 'videoinput');
    setVideoDevices(cameras);
    if (!selectedDeviceId && cameras[0]?.deviceId) setSelectedDeviceId(cameras[0].deviceId);
  }

  async function openCamera() {
    setErr('');
    setCameraHint('');
    setDevicePanelOpen(false);
    setCameraOpen(true);
    setCameraBusy(true);
    setCameraReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('当前浏览器不支持直接拍照，请使用“即时拍照”或“选择文件”。');
      }
      stopCamera();
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : { facingMode: { ideal: 'environment' } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
      await loadVideoDevices();
    } catch (e: any) {
      setErr(e?.message || '无法打开摄像头，请检查浏览器权限或改用文件上传');
      setCameraOpen(false);
    } finally {
      setCameraBusy(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
  }

  async function captureFrame() {
    if (!videoRef.current || !cameraReady) {
      setErr('摄像头尚未准备好');
      return;
    }
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErr('当前浏览器无法截取摄像头画面');
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) {
      setErr('拍照失败，请重试');
      return;
    }
    const file = new File([blob], `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
    await uploadFiles([file]);
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: readOnly ? 0 : 8 }}>
          {value.map((u, i) => (
            <AttachmentChip key={i} url={u} index={i} readOnly={readOnly}
              onRemove={() => onChange(value.filter((_, idx) => idx !== i))} />
          ))}
        </div>
      )}
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, position: 'relative' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={uploadButtonStyle(uploading)}
          >
            <Upload size={14} />{uploading ? '上传中…' : label}
          </button>
          <button
            type="button"
            onClick={() => captureInputRef.current?.click()}
            disabled={uploading}
            style={smallButtonStyle(uploading)}
            title="使用手机/平板/电脑当前设备相机拍照上传"
          >
            <Camera size={14} /> 即时拍照
          </button>
          <button
            type="button"
            onClick={async () => {
              const next = !devicePanelOpen;
              setDevicePanelOpen(next);
              if (next) await loadVideoDevices();
            }}
            disabled={uploading}
            style={smallButtonStyle(uploading)}
            title="选择浏览器可访问的摄像头设备"
          >
            <Settings2 size={14} /> 设备
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} disabled={uploading}
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) uploadFiles(fs); e.target.value = ''; }} />
          <input ref={captureInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={uploading}
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) uploadFiles(fs); e.target.value = ''; }} />
          {devicePanelOpen && (
            <div style={{
              flexBasis: '100%',
              display: 'grid',
              gridTemplateColumns: 'minmax(180px, 1fr) auto',
              gap: 8,
              alignItems: 'center',
              padding: 8,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-muted)',
            }}>
              <select
                value={selectedDeviceId}
                onChange={e => setSelectedDeviceId(e.target.value)}
                style={{ height: 32, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', color: 'var(--text-primary)', padding: '0 8px' }}
              >
                {videoDevices.length ? videoDevices.map((device, idx) => (
                  <option key={device.deviceId || idx} value={device.deviceId}>{device.label || `摄像头 ${idx + 1}`}</option>
                )) : <option value="">未发现可用摄像头</option>}
              </select>
              <button type="button" onClick={openCamera} disabled={uploading || cameraBusy} style={smallButtonStyle(uploading || cameraBusy)}>
                <FileImage size={14} /> 打开相机
              </button>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-secondary)' }}>
                外接 USB 摄像头会出现在这里；平板/手机相机请在对应设备打开页面后用“即时拍照”。
              </div>
            </div>
          )}
        </div>
      )}
      {cameraOpen && !readOnly && (
        <div style={{
          marginTop: 8,
          padding: 8,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-muted)',
          display: 'grid',
          gap: 8,
        }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: '100%',
              maxHeight: 260,
              background: '#000',
              borderRadius: 'var(--radius-sm)',
              objectFit: 'contain',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeCamera} style={smallButtonStyle(false)}>关闭</button>
            <button type="button" onClick={captureFrame} disabled={!cameraReady || uploading} style={primaryButtonStyle(!cameraReady || uploading)}>
              <Camera size={14} /> 拍照并上传
            </button>
          </div>
          {cameraHint && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cameraHint}</div>}
        </div>
      )}
      {readOnly && value.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-disabled)' }}>无附件</span>}
      {err && <div style={{ fontSize: 12, color: 'var(--status-danger)', marginTop: 4 }}>{err}</div>}
    </div>
  );
}

function uploadButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
    cursor: disabled ? 'wait' : 'pointer',
    fontSize: 13,
  };
}

function smallButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 32,
    padding: '0 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    ...smallButtonStyle(disabled),
    border: 'none',
    background: disabled ? 'var(--bg-muted)' : 'var(--color-primary)',
    color: disabled ? 'var(--text-disabled)' : 'var(--text-on-dark)',
  };
}

// G169：已上传附件单项。新上传返回受控 fileId；历史裸 URL 只显示为禁用引用，不再渲染可点击裸链接。
function AttachmentChip({ url, index, readOnly, onRemove }: {
  url: string; index: number; readOnly?: boolean; onRemove: () => void;
}) {
  const unsafe = isUnsafeAttachmentRef(url);
  const protectedRef = isProtectedFileRef(url);
  const displayName = protectedRef ? url : `附件${index + 1}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px 5px 5px', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12.5 }}>
      <FileText size={18} style={{ color: unsafe ? 'var(--status-warning)' : 'var(--text-secondary)' }} />
      <span
        title={unsafe ? '历史裸链接已被安全策略禁用' : (protectedRef ? '受控附件引用，需通过模块受控端点访问' : displayName)}
        style={{
          color: unsafe ? 'var(--status-warning)' : 'var(--color-accent)',
          maxWidth: 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {unsafe ? '历史附件链接已禁用' : displayName}
      </span>
      {protectedRef && <span style={{ color: 'var(--text-tertiary)' }}>受控</span>}
      {!readOnly && (
        <button onClick={onRemove} title="移除" style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
