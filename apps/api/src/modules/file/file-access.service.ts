import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, statSync } from 'fs';
import { basename, isAbsolute, resolve } from 'path';
import { ClsService } from 'nestjs-cls';
import { Repository } from 'typeorm';
import { hasPerm } from '../../auth/permissions.util';
import { DataScopeContext } from '../org/services/data-scope.service';
import { FileMetadataEntity } from './entities/file-metadata.entity';

export type ProtectedFileMode = 'preview' | 'download';

export interface FileAccessPolicy {
  moduleCode: string;
  ownerType: string;
  ownerId: string;
  companyCode?: string;
  storeCode?: string;
  requiredMenu: string;
}

export interface ProtectedFileResult {
  stream: StreamableFile;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  disposition: string;
}

const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class FileAccessService {
  private readonly logger = new Logger(FileAccessService.name);

  constructor(
    @InjectRepository(FileMetadataEntity)
    private readonly fileRepo: Repository<FileMetadataEntity>,
    private readonly cls: ClsService,
  ) {}

  async getProtectedFileStatus(fileId: string, policy: FileAccessPolicy) {
    const file = await this.findAndAuthorize(fileId, policy, 'preview');
    return {
      fileId: file.fileId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      status: file.status,
      visibility: file.visibility,
      moduleCode: file.moduleCode,
      ownerType: file.ownerType,
      ownerId: file.ownerId,
      previewAvailable: this.isPreviewMime(file.mimeType),
      downloadAvailable: true,
      accessStatus: 'allowed',
      rawUrl: null,
    };
  }

  async openProtectedFile(fileId: string, policy: FileAccessPolicy, mode: ProtectedFileMode): Promise<ProtectedFileResult> {
    const file = await this.findAndAuthorize(fileId, policy, mode);
    if (mode === 'preview' && !this.isPreviewMime(file.mimeType)) {
      this.logDenied(file, policy, mode, 'FILE_PREVIEW_MIME_NOT_ALLOWED');
      throw new ForbiddenException('FILE_PREVIEW_MIME_NOT_ALLOWED');
    }

    const path = this.resolveSafeStoragePath(file);
    if (!existsSync(path)) {
      this.logDenied(file, policy, mode, 'FILE_BINARY_NOT_FOUND');
      throw new NotFoundException('FILE_BINARY_NOT_FOUND');
    }
    const stat = statSync(path);
    if (!stat.isFile()) {
      this.logDenied(file, policy, mode, 'FILE_BINARY_NOT_FILE');
      throw new NotFoundException('FILE_BINARY_NOT_FOUND');
    }

    return {
      stream: new StreamableFile(createReadStream(path)),
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      disposition: mode === 'download'
        ? `attachment; filename="${encodeURIComponent(file.originalName)}"`
        : `inline; filename="${encodeURIComponent(file.originalName)}"`,
    };
  }

  private async findAndAuthorize(fileId: string, policy: FileAccessPolicy, mode: ProtectedFileMode) {
    const safeFileId = this.validateFileId(fileId);
    const file = await this.fileRepo.findOne({ where: { fileId: safeFileId } });
    if (!file || file.deletedAt) throw new NotFoundException('FILE_METADATA_NOT_FOUND');

    if (file.status !== 'ACTIVE') {
      this.logDenied(file, policy, mode, 'FILE_STATUS_NOT_ACTIVE');
      throw new ForbiddenException('FILE_STATUS_NOT_ACTIVE');
    }
    if (!['PROTECTED', 'PRIVATE'].includes(file.visibility)) {
      this.logDenied(file, policy, mode, 'FILE_VISIBILITY_INVALID');
      throw new ForbiddenException('FILE_VISIBILITY_INVALID');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      this.logDenied(file, policy, mode, 'FILE_MIME_NOT_ALLOWED');
      throw new ForbiddenException('FILE_MIME_NOT_ALLOWED');
    }
    if (
      file.moduleCode !== policy.moduleCode ||
      file.ownerType !== policy.ownerType ||
      file.ownerId !== policy.ownerId ||
      (policy.companyCode && file.companyCode && file.companyCode !== policy.companyCode) ||
      (policy.storeCode && file.storeCode && file.storeCode !== policy.storeCode)
    ) {
      this.logDenied(file, policy, mode, 'FILE_OWNERSHIP_MISMATCH');
      throw new ForbiddenException('FILE_OWNERSHIP_MISMATCH');
    }
    this.assertRbac(file, policy, mode);
    this.assertDataScope(file, policy, mode);
    return file;
  }

  private validateFileId(fileId: string) {
    const normalized = fileId.trim();
    if (!FILE_ID_PATTERN.test(normalized)) throw new ForbiddenException('FILE_ID_UNSAFE');
    const lowered = normalized.toLowerCase();
    if (
      normalized.includes('..') ||
      normalized.includes('/') ||
      normalized.includes('\\') ||
      lowered.startsWith('http:') ||
      lowered.startsWith('https:') ||
      lowered.startsWith('uploads') ||
      lowered.startsWith('/uploads')
    ) {
      throw new ForbiddenException('FILE_ID_UNSAFE');
    }
    return normalized;
  }

  private assertRbac(file: FileMetadataEntity, policy: FileAccessPolicy, mode: ProtectedFileMode) {
    const user = this.user();
    if (this.isAdmin()) return;
    if (hasPerm(user.permissions, policy.requiredMenu, 'V')) return;
    this.logDenied(file, policy, mode, 'FILE_RBAC_DENIED');
    throw new ForbiddenException('FILE_RBAC_DENIED');
  }

  private assertDataScope(file: FileMetadataEntity, policy: FileAccessPolicy, mode: ProtectedFileMode) {
    if (this.isAdmin()) return;
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope?.isGlobal) return;

    const allowedStores = new Set([
      ...this.splitCodes(this.user().storeCode),
      ...(scope?.allowedSiteCodes ?? []),
    ].filter(Boolean));
    if (file.storeCode && allowedStores.size > 0 && allowedStores.has(file.storeCode)) return;
    if (!file.storeCode && policy.storeCode && allowedStores.size > 0 && allowedStores.has(policy.storeCode)) return;

    const allowedCompanies = new Set(scope?.allowedCompanyCodes ?? []);
    if (file.companyCode && allowedCompanies.size > 0 && allowedCompanies.has(file.companyCode)) return;
    // Store Payment service performs canonical/legacy alias scope checks before
    // calling FileAccessService. Keep this bridge narrow to avoid duplicating
    // module-specific alias rules in the generic file layer.
    if (file.moduleCode === 'STORE_PAYMENT' && file.storeCode && file.storeCode === policy.storeCode) return;

    this.logDenied(file, policy, mode, 'FILE_DATASCOPE_DENIED');
    throw new ForbiddenException('FILE_DATASCOPE_DENIED');
  }

  private resolveSafeStoragePath(file: FileMetadataEntity) {
    const uploadRoot = resolve(process.cwd(), 'uploads');
    const storagePath = isAbsolute(file.storagePath)
      ? resolve(file.storagePath)
      : resolve(process.cwd(), file.storagePath);
    if (!storagePath.startsWith(`${uploadRoot}/`) && storagePath !== uploadRoot) {
      this.logDenied(file, {
        moduleCode: file.moduleCode,
        ownerType: file.ownerType,
        ownerId: file.ownerId,
        companyCode: file.companyCode,
        storeCode: file.storeCode,
        requiredMenu: 'UNKNOWN',
      }, 'download', 'FILE_STORAGE_PATH_OUTSIDE_UPLOAD_ROOT');
      throw new ForbiddenException('FILE_STORAGE_PATH_UNSAFE');
    }
    if (basename(storagePath) !== file.storedName) {
      throw new ForbiddenException('FILE_STORAGE_NAME_MISMATCH');
    }
    return storagePath;
  }

  private isPreviewMime(mimeType: string) {
    return mimeType === 'application/pdf' || mimeType.startsWith('image/');
  }

  private logDenied(file: FileMetadataEntity, policy: FileAccessPolicy, mode: ProtectedFileMode, reason: string) {
    this.logger.warn({
      event: 'PROTECTED_FILE_ACCESS_DENIED',
      reason,
      mode,
      fileId: file.fileId,
      moduleCode: file.moduleCode,
      ownerType: file.ownerType,
      ownerId: file.ownerId,
      policyModuleCode: policy.moduleCode,
      policyOwnerType: policy.ownerType,
      policyOwnerId: policy.ownerId,
      companyCode: file.companyCode,
      storeCode: file.storeCode,
      username: this.username(),
      userId: this.userId(),
      rawUrl: null,
    });
  }

  private user(): {
    userId?: string | number;
    id?: string | number;
    username?: string;
    name?: string;
    realNameZh?: string;
    role?: string;
    roles?: string[];
    permissions?: string[];
    storeCode?: string;
  } {
    return this.cls.get('user') ?? {};
  }

  private roles(): string[] {
    const user = this.user();
    return Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
  }

  private isAdmin() {
    const user = this.user();
    return this.roles().includes('ROLE_ADMIN') || user.role === 'ROLE_ADMIN' || user.permissions?.includes('*') === true;
  }

  private userId() {
    const user = this.user();
    return String(user.userId ?? user.id ?? '');
  }

  private username() {
    const user = this.user();
    return String(user.username ?? user.name ?? user.realNameZh ?? 'system');
  }

  private splitCodes(value: string | undefined): string[] {
    return String(value ?? '')
      .split(',')
      .map(code => code.trim())
      .filter(Boolean);
  }
}
