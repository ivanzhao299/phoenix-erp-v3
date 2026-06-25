import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';

type ExtractPurpose = 'PROCUREMENT_CONTRACT' | 'GENERIC_DOCUMENT';

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

    const suggestions = purpose === 'PROCUREMENT_CONTRACT'
      ? this.procurementContractSuggestions(files, body.fields ?? [])
      : this.genericSuggestions(files, body.fields ?? []);

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
      warnings,
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

  private procurementContractSuggestions(files: FileMetadataEntity[], requestedFields: string[]) {
    const fields = requestedFields.length ? new Set(requestedFields) : new Set(['contractNo', 'contractNote']);
    const suggestions: Array<{ field: string; label: string; value: string; confidence: number; source: string }> = [];
    const names = files.map(f => f.originalName || '').join('；');
    if (fields.has('contractNo')) {
      const match = names.match(/\b(?:HT|CT|PO|PRC)[-_]?[A-Za-z0-9][A-Za-z0-9._-]{3,}\b/i);
      if (match) {
        suggestions.push({
          field: 'contractNo',
          label: '合同号',
          value: match[0].toUpperCase(),
          confidence: 0.42,
          source: 'original_name',
        });
      }
    }
    if (fields.has('contractNote') && files.length) {
      suggestions.push({
        field: 'contractNote',
        label: '合同摘要',
        value: `已上传 ${files.length} 个合同/凭证附件，等待 OCR 引擎抽取供应商、金额、交付、账期等正文信息。`,
        confidence: 0.18,
        source: 'metadata',
      });
    }
    return suggestions;
  }

  private genericSuggestions(files: FileMetadataEntity[], requestedFields: string[]) {
    if (!requestedFields.includes('attachmentSummary')) return [];
    return [{
      field: 'attachmentSummary',
      label: '附件摘要',
      value: `已上传 ${files.length} 个受控附件，等待 OCR/AI 引擎识别正文信息。`,
      confidence: 0.16,
      source: 'metadata',
    }];
  }

  private isImageOrPdf(mimeType: string) {
    const value = String(mimeType || '').toLowerCase();
    return value.includes('pdf') || value.startsWith('image/');
  }

  private currentUsername(user: CurrentUser) {
    return user?.username ?? user?.name ?? user?.realNameZh ?? user?.userId ?? user?.id ?? '';
  }
}
