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
 * 构造标签 CSS — 按实际尺寸自动缩放各区块高度/字号
 * 经过 40×30mm 精确标定，其他尺寸等比缩放。
 */
export function buildLabelCss(widthMm: number, heightMm: number): string {
  const h = heightMm;
  // 各区块高度（mm）
  const hdrH  = (6.0).toFixed(1);                          // 品牌栏放高
  const barH  = Math.min(11.0, h * 0.33).toFixed(1);       // 30mm→9.9mm，条码适度缩小
  // 字号（pt）
  const bfs   = Math.min(9.5, h * 0.29).toFixed(1);        // 信息区字号
  const lfs   = Math.max(7.0, h * 0.23).toFixed(1);        // 标签字号
  const btfs  = Math.min(9.5, h * 0.28).toFixed(1);        // 箱码编号字号（独立放大）

  return (
    `@page{size:${widthMm}mm ${heightMm}mm;margin:0}` +
    `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `body{margin:0;padding:0;font-family:"Noto Sans SC","Noto Sans Lao",Arial,sans-serif;font-size:${bfs}pt;color:#000}` +
    `.label{width:${widthMm}mm;height:${heightMm}mm;overflow:hidden;display:flex;flex-direction:column;` +
      `break-after:page;page-break-after:always;position:relative}` +
    `.label:last-child{break-after:auto;page-break-after:auto}` +
    // 顶部品牌栏
    `.hdr{height:${hdrH}mm;display:flex;align-items:center;justify-content:space-between;` +
      `padding:0 1.5mm;flex-shrink:0}` +
    `.brand{font-size:${bfs}pt;font-weight:800;display:flex;align-items:center;gap:0.8mm;overflow:hidden;min-width:0}` +
    `.logo{height:${(parseFloat(hdrH) - 1.2).toFixed(1)}mm;width:auto;object-fit:contain;flex-shrink:0}` +
    `.badge{font-size:${lfs}pt;color:#fff;background:#000;` +
      `padding:0.3mm 1.2mm;border-radius:0.5mm;font-weight:700;flex-shrink:0;white-space:nowrap}` +
    // 条形码区
    `.bar{height:${barH}mm;flex-shrink:0;overflow:hidden}` +
    `.bar svg{height:100%;width:100%;display:block}` +
    // 箱码编号（放大）
    `.bar-text{text-align:center;font-family:"Courier New",Courier,monospace;` +
      `font-size:${btfs}pt;font-weight:700;letter-spacing:0.5pt;` +
      `padding:0.3mm 0;flex-shrink:0}` +
    // 信息区 — 两列网格（字号放大）
    `.info{flex:1;padding:0.5mm 1.5mm;display:grid;grid-template-columns:1fr 1fr;` +
      `align-content:space-evenly;overflow:hidden;gap:0 1mm}` +
    `.row{display:flex;align-items:baseline;white-space:nowrap;overflow:hidden;line-height:1.4}` +
    `.l{font-size:${lfs}pt;color:#444;font-weight:600;flex-shrink:0;min-width:5mm}` +
    `.v{font-size:${bfs}pt;font-weight:800;overflow:hidden;text-overflow:ellipsis}` +
    `@media print{html,body{width:${widthMm}mm!important;height:${heightMm}mm!important}}`
  );
}
