import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';

type ExtractPurpose = 'PROCUREMENT_CONTRACT' | 'GENERIC_DOCUMENT';
const execFileAsync = promisify(execFile);

interface ExtractRequest {
  fileIds?: unknown;
  purpose?: ExtractPurpose;
  fields?: string[];
}

interface CurrentUser {
  username?: string;
  name?: string;
  realNameZh?: string;
  userId?: string;
  id?: string;
}

interface FieldSuggestion {
  field: string;
  label: string;
  value: string;
  displayValue?: string;
  confidence: number;
  source: string;
}

interface ProcurementLineItemSuggestion {
  itemName: string;
  spec?: string;
  qty?: string;
  unit?: string;
  unitPrice?: string;
  amount?: string;
}

@Injectable()
export class DocumentIntelligenceService {
  constructor(
    @InjectRepository(FileMetadataEntity)
    private readonly fileMetadataRepo: Repository<FileMetadataEntity>,
  ) {}

  async extract(body: ExtractRequest, user: CurrentUser) {
    const fileIds = this.normalizeFileIds(body.fileIds);
    const purpose = body.purpose ?? 'GENERIC_DOCUMENT';
    const username = this.currentUsername(user);
    const files = await this.fileMetadataRepo.find({ where: fileIds.map(fileId => ({ fileId })) });
    const found = new Set(files.map(f => f.fileId));
    const missing = fileIds.filter(fileId => !found.has(fileId));
    if (missing.length) throw new NotFoundException(`附件不存在或已失效：${missing.join(', ')}`);

    const unauthorized = files.filter(f => f.status !== 'ACTIVE' && f.uploadedBy && f.uploadedBy !== username);
    if (unauthorized.length) {
      throw new ForbiddenException('只能识别本人上传或已完成业务归属绑定的受控附件');
    }

    const textResult = await this.extractText(files);
    const suggestions = purpose === 'PROCUREMENT_CONTRACT'
      ? this.procurementContractSuggestions(files, body.fields ?? [], textResult.text)
      : this.genericSuggestions(files, body.fields ?? [], textResult.text);

    const extractedFields = Object.fromEntries(suggestions.map(s => [s.field, {
      value: s.value,
      confidence: s.confidence,
      source: s.source,
    }]));
    const needsOcrEngine = files.some(f => this.isImageOrPdf(f.mimeType));
    const warnings = [
      '当前版本只做受控附件校验和文件名/元数据启发式识别，不读取或返回 storage_path/rawUrl。',
      needsOcrEngine ? '图片/PDF 正文识别需要后续接入 OCR/AI 引擎；未接入前不会伪造识别结果。' : '',
      files.some(f => f.status !== 'ACTIVE') ? '存在尚未绑定业务归属的 PENDING 附件，仅允许本人识别，提交后仍需业务记录绑定。' : '',
    ].filter(Boolean);

    return {
      code: 200,
      purpose,
      engine: 'metadata-heuristic-v1',
      status: suggestions.length ? 'PARTIAL_METADATA_EXTRACTED' : 'EXTRACTION_PENDING_OCR_ENGINE',
      canAutofill: suggestions.length > 0,
      fileCount: files.length,
      files: files.map(f => ({
        fileId: f.fileId,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: Number(f.sizeBytes || 0),
        status: String(f.status || '').toLowerCase(),
        moduleCode: f.moduleCode,
        ownerType: f.ownerType,
        ownerId: f.ownerId,
        rawUrl: null,
      })),
      extractedFields,
      fieldSuggestions: suggestions,
      warnings: [...warnings, ...textResult.warnings],
      textExtraction: {
        status: textResult.status,
        engine: textResult.engine,
        extractedChars: textResult.text.length,
      },
      rawUrl: null,
      storagePathExposed: false,
      uploadsPathExposed: false,
    };
  }

  private normalizeFileIds(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [];
    const ids = raw.map(v => String(v ?? '').trim()).filter(Boolean);
    if (!ids.length) throw new BadRequestException('请先上传需要识别的附件');
    if (ids.length > 8) throw new BadRequestException('单次最多识别 8 个附件');
    const invalid = ids.filter(id => !/^FILE-[A-Za-z0-9._:-]+$/.test(id));
    if (invalid.length) throw new BadRequestException(`只支持受控 fileId 附件：${invalid.join(', ')}`);
    return Array.from(new Set(ids));
  }

  private procurementContractSuggestions(files: FileMetadataEntity[], requestedFields: string[], text: string) {
    const fields = requestedFields.length ? new Set(requestedFields) : new Set([
      'subject',
      'supplierName',
      'contractNo',
      'currencyCode',
      'totalAmount',
      'expectedDate',
      'payDeadline',
      'contractNote',
    ]);
    const suggestions: FieldSuggestion[] = [];
    const names = files.map(f => f.originalName || '').join('；');
    const normalizedText = this.normalizeText(text);
    if (fields.has('contractNo')) {
      const textNo = this.findFirst(normalizedText, [
        /(?:合同编号|合同号|协议编号|编号|Contract\s*(?:No\.?|Number)|Agreement\s*(?:No\.?|Number))[:：\s]*([A-Z0-9][A-Z0-9._/-]{3,})/i,
      ]);
      const nameNo = names.match(/\b(?:HT|CT|PO|PRC)[-_]?[A-Za-z0-9][A-Za-z0-9._-]{3,}\b/i)?.[0];
      const value = textNo || nameNo;
      if (value) {
        suggestions.push({
          field: 'contractNo',
          label: '合同号',
          value: value.toUpperCase(),
          confidence: textNo ? 0.78 : 0.42,
          source: textNo ? 'document_text' : 'original_name',
        });
      }
    }
    if (fields.has('supplierName')) {
      const supplier = this.findFirst(normalizedText, [
        /(?:供应商|供方|乙方|卖方|收款方|Supplier|Seller|Party\s*B)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()·.\-\s]{2,48})(?:\s|，|,|。|;|；|$)/i,
      ]);
      if (supplier) {
        suggestions.push({
          field: 'supplierName',
          label: '供应商',
          value: supplier.trim(),
          confidence: 0.68,
          source: 'document_text',
        });
      }
    }
    if (fields.has('currencyCode')) {
      const currency = this.detectCurrency(normalizedText);
      if (currency) {
        suggestions.push({
          field: 'currencyCode',
          label: '币种',
          value: currency,
          confidence: 0.72,
          source: 'document_text',
        });
      }
    }
    if (fields.has('totalAmount')) {
      const amount = this.findFirst(normalizedText, [
        /(?:合同金额|合同总价|总金额|总价|价款|金额|Amount|Total)[:：\s]*(?:人民币|RMB|CNY|¥|￥|USD|\$|LAK|₭)?\s*([0-9][0-9,，]*(?:\.[0-9]{1,2})?)/i,
      ]);
      if (amount) {
        suggestions.push({
          field: 'totalAmount',
          label: '合同金额',
          value: amount.replace(/，/g, ','),
          confidence: 0.66,
          source: 'document_text',
        });
      }
    }
    if (fields.has('expectedDate')) {
      const date = this.findDate(normalizedText, ['交付', '到货', '送达', 'delivery', 'arrival']);
      if (date) {
        suggestions.push({
          field: 'expectedDate',
          label: '期望到货日',
          value: date,
          confidence: 0.58,
          source: 'document_text',
        });
      }
    }
    if (fields.has('payDeadline')) {
      const date = this.findDate(normalizedText, ['付款', '支付', '结算', 'payment']);
      if (date) {
        suggestions.push({
          field: 'payDeadline',
          label: '付款截止日',
          value: date,
          confidence: 0.55,
          source: 'document_text',
        });
      }
    }
    if (fields.has('subject')) {
      const subject = this.findFirst(normalizedText, [
        /(?:合同名称|采购名称|项目名称|Subject|Title)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()·.\-\s]{4,60})(?:\s|，|,|。|;|；|$)/i,
      ]);
      if (subject) {
        suggestions.push({
          field: 'subject',
          label: '采购主题',
          value: subject.trim(),
          confidence: 0.54,
          source: 'document_text',
        });
      }
    }
    if (fields.has('contractNote') && files.length) {
      const parts = suggestions
        .filter(s => ['supplierName', 'currencyCode', 'totalAmount', 'expectedDate', 'payDeadline'].includes(s.field))
        .map(s => `${s.label}：${s.value}`);
      suggestions.push({
        field: 'contractNote',
        label: '合同摘要',
        value: parts.length
          ? parts.join('；')
          : `已上传 ${files.length} 个合同/凭证附件，等待 OCR 引擎抽取供应商、金额、交付、账期等正文信息。`,
        confidence: parts.length ? 0.45 : 0.18,
        source: parts.length ? 'document_text_summary' : 'metadata',
      });
    }
    if (fields.has('lineItems')) {
      const lineItems = this.extractProcurementLineItems(normalizedText);
      if (lineItems.length) {
        suggestions.push({
          field: 'lineItems',
          label: '采购明细',
          value: JSON.stringify(lineItems.slice(0, 20)),
          displayValue: lineItems.slice(0, 5).map((it, idx) => {
            const spec = it.spec ? ` · ${it.spec}` : '';
            const qty = it.qty ? ` · ${it.qty}${it.unit ?? ''}` : '';
            const price = it.unitPrice ? ` · 单价${it.unitPrice}` : '';
            return `${idx + 1}. ${it.itemName}${spec}${qty}${price}`;
          }).join('；'),
          confidence: 0.5,
          source: 'document_text_line_items',
        });
      }
    }
    return suggestions;
  }

  private extractProcurementLineItems(text: string): ProcurementLineItemSuggestion[] {
    if (!text) return [];
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length >= 3 && line.length <= 160)
      .filter(line => !/(合同|甲方|乙方|供应商|采购方|地址|电话|开户|账号|签字|盖章|合计|总计|金额大写)/.test(line));

    const items: ProcurementLineItemSuggestion[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const compact = line.replace(/\s+/g, ' ');
      const nameSpec = compact.match(/^([A-Za-z0-9\u4e00-\u9fa5·（）()\-]{2,40})[（(]([^）)]{2,40})[）)]/);
      const tableLike = compact.match(/^([A-Za-z0-9\u4e00-\u9fa5·（）()\-]{2,40})\s+([A-Za-z0-9\u4e00-\u9fa5./\-]{1,40})?\s*([0-9]+(?:\.[0-9]+)?)?\s*([A-Za-z\u4e00-\u9fa5]{1,8})?\s*([0-9]+(?:\.[0-9]+)?)?/);
      const match = nameSpec || tableLike;
      if (!match) continue;

      const itemName = String(match[1] || '').trim();
      if (!itemName || itemName.length < 2) continue;
      if (/^(编号|序号|品名|名称|规格|单位|数量|单价|备注|项目)$/.test(itemName)) continue;

      const spec = nameSpec ? String(match[2] || '').trim() : String(match[2] || '').trim();
      const tail = compact.slice(match[0].length);
      const qtyUnit = compact.match(/([0-9]+(?:\.[0-9]+)?)\s*(公斤|千克|kg|KG|吨|桶|袋|箱|盒|瓶|支|件|套|批|个|包)/);
      const hasMoneySignal = /￥|¥|RMB|CNY|LAK|USD|人民币|基普|美元|金额|总价|单价|小计|合计/i.test(compact);
      const moneyValues = hasMoneySignal
        ? Array.from(compact.matchAll(/(?:￥|¥|RMB|CNY|LAK|USD)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)).map(m => m[1].replace(/,/g, ''))
        : [];
      const qty = qtyUnit?.[1] || (!nameSpec && match[3] ? String(match[3]) : '');
      const unit = qtyUnit?.[2] || (!nameSpec && match[4] ? String(match[4]) : this.inferUnit(spec));
      const unitPrice = moneyValues.length >= 2 ? moneyValues[moneyValues.length - 2] : '';
      const amount = moneyValues.length >= 1 ? moneyValues[moneyValues.length - 1] : '';
      const key = `${itemName}|${spec}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Avoid turning ordinary prose into rows. Require either a spec, a quantity/unit, or obvious amount tail.
      if (!spec && !qty && !/[0-9]/.test(tail)) continue;

      items.push({
        itemName,
        spec: spec || undefined,
        qty: qty || undefined,
        unit: unit || undefined,
        unitPrice: unitPrice || undefined,
        amount: amount || undefined,
      });
      if (items.length >= 20) break;
    }
    return items;
  }

  private inferUnit(spec: string) {
    const value = String(spec || '');
    const match = value.match(/(公斤|千克|kg|KG|吨|桶|袋|箱|盒|瓶|支|件|套|批|个|包)/);
    return match?.[1] || '';
  }

  private genericSuggestions(files: FileMetadataEntity[], requestedFields: string[], text: string) {
    if (!requestedFields.includes('attachmentSummary')) return [];
    return [{
      field: 'attachmentSummary',
      label: '附件摘要',
      value: text ? this.normalizeText(text).slice(0, 200) : `已上传 ${files.length} 个受控附件，等待 OCR/AI 引擎识别正文信息。`,
      confidence: text ? 0.5 : 0.16,
      source: text ? 'document_text' : 'metadata',
    }];
  }

  private isImageOrPdf(mimeType: string) {
    const value = String(mimeType || '').toLowerCase();
    return value.includes('pdf') || value.startsWith('image/');
  }

  private currentUsername(user: CurrentUser) {
    return user?.username ?? user?.name ?? user?.realNameZh ?? user?.userId ?? user?.id ?? '';
  }

  private async extractText(files: FileMetadataEntity[]) {
    const warnings: string[] = [];
    const chunks: string[] = [];
    const engines = new Set<string>();
    for (const file of files) {
      const storagePath = this.safeStoragePath(file.storagePath);
      if (!storagePath) {
        warnings.push(`${file.fileId}：附件路径不在受控 uploads 目录内，已跳过正文识别。`);
        continue;
      }
      if (!existsSync(storagePath)) {
        warnings.push(`${file.fileId}：服务器文件不存在，已跳过正文识别。`);
        continue;
      }
      const mime = String(file.mimeType || '').toLowerCase();
      if (mime.includes('pdf')) {
        const text = await this.runTextTool('pdftotext', ['-layout', storagePath, '-'], file.fileId, warnings);
        if (text) {
          engines.add('pdftotext');
          chunks.push(text);
        }
        continue;
      }
      if (mime.startsWith('image/')) {
        const text = await this.runTextTool('tesseract', [storagePath, 'stdout', '-l', process.env.DOCUMENT_OCR_LANG || 'chi_sim+eng'], file.fileId, warnings);
        if (text) {
          engines.add('tesseract');
          chunks.push(text);
        }
      }
    }
    const text = chunks.join('\n\n').slice(0, 16000);
    return {
      text,
      warnings,
      engine: Array.from(engines).join('+') || 'none',
      status: text ? 'TEXT_EXTRACTED' : 'NO_TEXT_EXTRACTED',
    };
  }

  private safeStoragePath(rawPath: string) {
    const uploadRoot = resolve(process.cwd(), 'uploads');
    const candidate = resolve(String(rawPath || ''));
    if (!candidate.startsWith(`${uploadRoot}/`) && candidate !== uploadRoot) return '';
    return candidate;
  }

  private async runTextTool(command: string, args: string[], fileId: string, warnings: string[]) {
    try {
      const { stdout } = await execFileAsync(command, args, {
        timeout: 8000,
        maxBuffer: 1024 * 1024 * 2,
      });
      return String(stdout || '').trim();
    } catch {
      warnings.push(`${fileId}：本机未启用 ${command} 或正文不可提取，已安全降级。`);
      return '';
    }
  }

  private normalizeText(text: string) {
    return String(text || '').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  }

  private findFirst(text: string, patterns: RegExp[]) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  }

  private detectCurrency(text: string) {
    if (/美元|USD|\$/i.test(text)) return 'USD';
    if (/老挝基普|基普|LAK|₭/i.test(text)) return 'LAK';
    if (/人民币|RMB|CNY|￥|¥/i.test(text)) return 'CNY';
    return '';
  }

  private findDate(text: string, contextWords: string[]) {
    const context = contextWords.join('|');
    const contextual = new RegExp(`(?:${context})[^\\n]{0,40}?(20\\d{2})[年\\-/\\.](\\d{1,2})[月\\-/\\.](\\d{1,2})`, 'i');
    const contextMatch = text.match(contextual);
    if (contextMatch) return this.toIsoDate(contextMatch[1], contextMatch[2], contextMatch[3]);
    const any = text.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    return any ? this.toIsoDate(any[1], any[2], any[3]) : '';
  }

  private toIsoDate(year: string, month: string, day: string) {
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
}
