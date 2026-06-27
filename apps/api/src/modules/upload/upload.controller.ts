import {
  Controller, Post, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException, Body, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, readFileSync } from 'fs';
import { Repository } from 'typeorm';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

const ALLOWED_EXTS  = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB（前端已压缩图片；PDF 接受原始大小）
const LEGACY_MODULE_CODE = 'LEGACY_UPLOAD';
const LEGACY_PENDING = 'LEGACY_PENDING';

interface LegacyUploadBody {
  moduleCode?: string;
  module_code?: string;
  ownerType?: string;
  owner_type?: string;
  ownerId?: string | number;
  owner_id?: string | number;
  companyCode?: string;
  company_code?: string;
  storeCode?: string;
  store_code?: string;
}

@Controller('api/upload')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class UploadController {
  constructor(
    @InjectRepository(FileMetadataEntity)
    private readonly fileMetadataRepo: Repository<FileMetadataEntity>,
  ) {}

  /**
   * POST /api/upload/contract
   * 上传采购合同或单据（PDF / 图片）
   * 返回 file_metadata 受控引用；兼容字段 url 返回 fileId，不返回裸文件路径。
   */
  @Post('contract')
  @RequireMenu('MENU_PRC2_ORDER', 'E', [
    'MENU_PRC2_REQUEST',
    'MENU_PRC2_PAYMENT',
    'MENU_FIN2_SHAREHOLDER',
    'MENU_FIN2_EXPENSE',
    'MENU_FIN2_REIMBURSE',
    'MENU_FIN2_AP',
    'MENU_STORE_PAYMENT',
    'MENU_WORKFLOW_FORM',
  ])
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'contracts');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext  = extname(file.originalname).toLowerCase();
          const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTS.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(`不支持的格式，请上传 PDF 或图片（JPG/PNG/WebP）`),
            false,
          );
        }
      },
    }),
  )
  async uploadContract(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: LegacyUploadBody,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('文件上传失败');
    const fileId = this.nextFileId();
    const moduleCode = this.safeCode(body.moduleCode ?? body.module_code, LEGACY_MODULE_CODE, 64);
    const ownerType = this.safeCode(body.ownerType ?? body.owner_type, LEGACY_PENDING, 64);
    const ownerId = this.safeCode(body.ownerId ?? body.owner_id, LEGACY_PENDING, 128);
    const companyCode = this.safeCode(body.companyCode ?? body.company_code, '', 64);
    const storeCode = this.safeCode(body.storeCode ?? body.store_code, '', 64);
    const ownerAssigned = moduleCode !== LEGACY_MODULE_CODE && ownerType !== LEGACY_PENDING && ownerId !== LEGACY_PENDING;
    const metadata = await this.fileMetadataRepo.save(this.fileMetadataRepo.create({
      fileId,
      originalName: this.safeText(file.originalname, 255),
      storedName: this.safeText(file.filename, 255),
      storagePath: file.path,
      mimeType: this.safeText(file.mimetype || 'application/octet-stream', 128),
      sizeBytes: String(file.size),
      checksum: this.sha256(file.path),
      moduleCode,
      ownerType,
      ownerId,
      companyCode,
      storeCode,
      uploadedBy: this.safeCode(this.currentUsername(req), '', 128),
      status: ownerAssigned ? 'ACTIVE' : 'PENDING',
      visibility: 'PROTECTED',
    }));

    return {
      code: 200,
      fileId: metadata.fileId,
      originalName: file.originalname,
      mimeType: metadata.mimeType,
      sizeBytes: Number(metadata.sizeBytes),
      moduleCode: metadata.moduleCode,
      ownerType: metadata.ownerType,
      ownerId: metadata.ownerId,
      companyCode: metadata.companyCode,
      storeCode: metadata.storeCode,
      visibility: metadata.visibility.toLowerCase(),
      status: metadata.status.toLowerCase(),
      rawUrl: null,
      previewUrl: null,
      downloadUrl: null,
      protectedStatusEndpoint: null,
      protectedEndpointStatus: 'generic_protected_file_endpoint_not_available',
      deprecatedLegacyPath: false,
      url: metadata.fileId,
      legacyUrlCompat: true,
      message: 'File uploaded as protected metadata; compatibility url contains fileId, not a raw URL.',
    };
  }

  private nextFileId() {
    return `FILE-LEGACY-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  private sha256(path: string) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  private currentUsername(req: any) {
    const user = req?.user ?? {};
    return user.username ?? user.name ?? user.realNameZh ?? user.userId ?? user.id ?? '';
  }

  private safeCode(value: unknown, fallback: string, maxLength: number) {
    const raw = String(value ?? '').trim();
    if (!raw) return fallback;
    return raw
      .replace(/[^\w:.-]/g, '_')
      .slice(0, maxLength) || fallback;
  }

  private safeText(value: unknown, maxLength: number) {
    return String(value ?? '').trim().slice(0, maxLength);
  }
}
