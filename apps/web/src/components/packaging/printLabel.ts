/**
 * iframe 静默打印工具
 * 兼容 Chrome --kiosk-printing：无打印对话框，直接送默认打印机
 * 用法：
 *   await printLabel({ html, css, copies, title })
 */

export interface PrintLabelArgs {
  /** 单张标签 HTML（不含 <html>/<body>，纯内容；多份会自动复制 copies 次 + break-after */
  singleLabelHtml: string;
  /** CSS 字符串，外部传入完整 @page + 标签样式 */
  css: string;
  /** 份数；至少 1 */
  copies: number;
  /** 浏览器打印任务标题 */
  title?: string;
}

export interface PrintLabelResult {
  /** 已发送的份数（与 copies 一致） */
  copies: number;
}

/**
 * 触发静默打印；返回 Promise，在 iframe 已发送 window.print() 调用后 resolve。
 * 注意：window.print 本身在 Chromium 下是同步的，无法精确知道用户是否真的点了打印（除非配合 afterprint 事件）。
 */
export function printLabel({ singleLabelHtml, css, copies, title }: PrintLabelArgs): Promise<PrintLabelResult> {
  const safeCopies = Math.max(1, Math.floor(copies));
  const body = Array(safeCopies).fill(singleLabelHtml).join('\n');
  const fullHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${title || 'Label'} ×${safeCopies}</title><style>${css}</style></head><body>${body}</body></html>`;

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none;visibility:hidden';
    document.body.appendChild(iframe);

    const iDoc = iframe.contentDocument || iframe.contentWindow!.document;
    iDoc.open();
    iDoc.write(fullHtml);
    iDoc.close();

    iframe.contentWindow?.focus();
    // 延迟一帧让浏览器排版资源；350ms 足够热敏打印机 SVG 模式渲染完成
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch {
        // 弹错不影响主流程
      }
      // 2 秒后回收 iframe
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch { /* noop */ }
      }, 2000);
      resolve({ copies: safeCopies });
    }, 350);
  });
}

/**
 * 构造一段 Code128 标签的标准 CSS（与 V2 PackagingTerminal 对齐，40×30mm 默认值）
 * @param widthMm  毫米
 * @param heightMm 毫米
 */
export function buildLabelCss(widthMm: number, heightMm: number): string {
  return (
    `@page{size:${widthMm}mm ${heightMm}mm;margin:0}` +
    `*{box-sizing:border-box}` +
    `body{margin:0;padding:0;font-family:"Noto Sans SC","Noto Sans Lao",Arial,sans-serif;font-size:5pt;color:#000}` +
    `.label{width:${widthMm}mm;height:${heightMm}mm;overflow:hidden;display:flex;flex-direction:column;break-after:page;page-break-after:always}` +
    `.label:last-child{break-after:auto;page-break-after:auto}` +
    `.hdr{height:4.5mm;display:flex;align-items:center;justify-content:space-between;padding:0 2mm;border-bottom:1px solid #000;flex-shrink:0;background:#fff}` +
    `.brand{display:flex;align-items:center;gap:1mm;font-size:5.5pt;font-weight:800;white-space:nowrap;overflow:hidden}` +
    `.badge{font-size:4.5pt;color:#fff;background:#000;padding:.3mm 1.2mm;border-radius:.8mm;font-weight:700;flex-shrink:0;white-space:nowrap}` +
    `.bar{height:7.5mm;padding:1mm 0 0;flex-shrink:0;overflow:hidden;display:flex;justify-content:center}` +
    `.bar svg{height:100%;display:block}` +
    `.bar-text{text-align:center;font-family:Arial,sans-serif;font-size:5pt;font-weight:700;letter-spacing:0;border-bottom:1px solid #000;padding-bottom:.5mm;flex-shrink:0}` +
    `.info{flex:1;padding:1.5mm 2mm;display:flex;flex-direction:column;gap:1mm;font-size:5.5pt;overflow:hidden}` +
    `.row{display:flex;gap:1mm;align-items:baseline;white-space:nowrap;overflow:hidden}` +
    `.row2{display:flex;gap:1.5mm;align-items:baseline;white-space:nowrap}` +
    `.l{color:#000;font-weight:700;flex-shrink:0}` +
    `.gap{margin-left:1.5mm}` +
    `.v{font-weight:800}` +
    `.ell{overflow:hidden;text-overflow:ellipsis}` +
    `.qr{position:absolute;right:1.5mm;bottom:1.5mm;width:8mm;height:8mm;background:#fff;padding:0;line-height:0}` +
    `.qr svg{width:100%;height:100%;display:block}` +
    `.label{position:relative}` +
    `@media print{html,body{width:${widthMm}mm!important;height:${heightMm}mm!important}}`
  );
}
