import { DataScopeService } from '../org/services/data-scope.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { deriveOrgScope } from '../farm/farm.service';
import { hasPerm } from '../../auth/permissions.util';
import {
  Controller, Post, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException, Body, Req, Optional,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, readFileSync, unlinkSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import sharp = require('sharp');
import { Repository } from 'typeorm';
import { FileMetadataEntity } from '../file/entities/file-metadata.entity';
import { MenuGuard, RequireAnyMenu } from '../../common/guards/menu.guard';

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
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class UploadController {
  constructor(
    @InjectRepository(FileMetadataEntity)
    private readonly fileMetadataRepo: Repository<FileMetadataEntity>,
    @Optional() private readonly dataScopes?: DataScopeService,
  ) {}

  /**
   * POST /api/upload/contract
   * 上传采购合同或单据（PDF / 图片）
   * 返回 file_metadata 受控引用；兼容字段 url 返回 fileId，不返回裸文件路径。
   */
  @Post('contract')
  @RequireAnyMenu([
    ...['MENU_PRC2_ORDER','MENU_PRC2_REQUEST','MENU_PRC2_PAYMENT','MENU_FIN2_SHAREHOLDER','MENU_FIN2_EXPENSE',
      'MENU_FIN2_REIMBURSE','MENU_FIN2_AP','MENU_STORE_PAYMENT','MENU_WORKFLOW_FORM','MENU_FLOCK_CREATE',
      'MENU_FIN2_AR_LEDGER','MENU_PROD_INBOUND'].map(menu=>({menu,perm:'E' as const})),
    {menu:'MENU_PROD_INBOUND',perm:'C'},{menu:'MENU_PROD_INBOUND',perm:'A'},{menu:'MENU_INV_BATCH',perm:'E'},
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
    let canonicalMime=file.mimetype||'application/octet-stream';
    let retained=false,metadataAttempted=false;
    try{
    const ownerType = this.safeCode(body.ownerType ?? body.owner_type, LEGACY_PENDING, 64);
    const ownerId = this.safeCode(body.ownerId ?? body.owner_id, LEGACY_PENDING, 128);
    let companyCode = this.safeCode(body.companyCode ?? body.company_code, '', 64);
    let storeCode = this.safeCode(body.storeCode ?? body.store_code, '', 64);
    const isAdmin=req.user?.roles?.includes('ROLE_ADMIN') || req.user?.role==='ROLE_ADMIN' || req.user?.permissions?.includes('*');
    const originalMenus=['MENU_PRC2_ORDER','MENU_PRC2_REQUEST','MENU_PRC2_PAYMENT','MENU_FIN2_SHAREHOLDER','MENU_FIN2_EXPENSE','MENU_FIN2_REIMBURSE','MENU_FIN2_AP','MENU_STORE_PAYMENT','MENU_WORKFLOW_FORM'];
    if(!['FLOCK_LIFECYCLE','PRODUCTION_INBOUND','PRODUCTION_CUTOVER','PRODUCTION_CONVERSION','INVENTORY_SOURCE_CONTROL'].includes(moduleCode) && !isAdmin && !originalMenus.some(menu=>hasPerm(req.user?.permissions,menu,'E'))) throw new BadRequestException('养殖或生产交库上传权限仅可用于对应业务附件');
    if(['PRODUCTION_CUTOVER','PRODUCTION_CONVERSION','INVENTORY_SOURCE_CONTROL'].includes(moduleCode)) {
      if(!this.dataScopes)throw new BadRequestException('缺少有效盘点或来源附件数据范围');
      const requirements=moduleCode==='INVENTORY_SOURCE_CONTROL'
        ? [{menu:'MENU_INV_BATCH',perm:'E' as const}]
        : [{menu:'MENU_PROD_INBOUND',perm:'C' as const},{menu:'MENU_PROD_INBOUND',perm:'E' as const},
          {menu:'MENU_PROD_INBOUND',perm:'A' as const},...(moduleCode==='PRODUCTION_CUTOVER'?[{menu:'MENU_FIN2_AR_LEDGER',perm:'E' as const}]:[])];
      const allowed=requirements.filter(r=>isAdmin||hasPerm(req.user?.permissions,r.menu,r.perm));
      if(!allowed.length)throw new BadRequestException('缺少对应盘点或库存来源附件权限');
      let canonicalCompany:string,canonicalWarehouse:string;
      if(moduleCode==='PRODUCTION_CUTOVER'||moduleCode==='PRODUCTION_CONVERSION') {
        if(ownerType!=='WAREHOUSE')throw new BadRequestException('盘点附件须绑定实际仓库');
        const [warehouse]=await this.fileMetadataRepo.manager.query("SELECT company_code,warehouse_code FROM wms_warehouses WHERE warehouse_code=$1 AND status='ACTIVE' AND domain='OPERATIONAL'",[ownerId]);
        if(!warehouse)throw new BadRequestException('盘点仓库不是启用的实际作业仓');
        canonicalCompany=warehouse.company_code;canonicalWarehouse=warehouse.warehouse_code;
      }else{
        if(ownerType!=='BATCH')throw new BadRequestException('来源控制附件须绑定实际原始批次');
        const [root]=await this.fileMetadataRepo.manager.query(`SELECT q.company_code,COALESCE(q.source_warehouse_code,b.warehouse_code) AS warehouse_code
          FROM production_batch_qualifications q JOIN inv_batches b ON b.batch_no=q.batch_no
          WHERE q.batch_no=$1 AND q.disposition='QUALIFIED' AND q.origin_kind<>'DERIVED'`,[ownerId]);
        if(!root)throw new BadRequestException('附件批次不是具有实际来源的原始批次');
        canonicalCompany=root.company_code;canonicalWarehouse=root.warehouse_code;
      }
      if(!canonicalCompany||companyCode!==canonicalCompany)throw new BadRequestException('附件公司与实物权威归属不一致');
      const [warehouse]=await this.fileMetadataRepo.manager.query('SELECT company_code,site_code FROM wms_warehouses WHERE warehouse_code=$1',[canonicalWarehouse]);
      if(!warehouse||warehouse.company_code!==canonicalCompany||storeCode&&storeCode!==(warehouse.site_code??''))throw new BadRequestException('附件仓库及场站权威归属不一致');
      const user=req.user,roles=user?.roles??(user?.role?[user.role]:[]);
      const scopes=await Promise.all([...new Set(allowed.map(r=>r.menu))].map(menu=>this.dataScopes!.resolve(String(user?.userId??user?.id??''),roles,menu,user?.perms_version)));
      if(!scopes.some(s=>s.isGlobal||s.allowedCompanyCodes.includes(canonicalCompany)&&s.allowedWarehouseCodes.includes(canonicalWarehouse)))
        throw new BadRequestException('附件不在实际公司及仓库业务授权范围内');
      companyCode=canonicalCompany;storeCode=warehouse.site_code??'';
    }
    if(['FLOCK_LIFECYCLE','PRODUCTION_INBOUND'].includes(moduleCode)) {
      const allowed=moduleCode==='PRODUCTION_INBOUND'
        ? hasPerm(req.user?.permissions,'MENU_PROD_INBOUND','C')||hasPerm(req.user?.permissions,'MENU_PROD_INBOUND','E')||hasPerm(req.user?.permissions,'MENU_FIN2_AR_LEDGER','E')
        : hasPerm(req.user?.permissions,'MENU_FLOCK_CREATE','E');
      if(!isAdmin && !allowed) throw new BadRequestException('缺少对应业务附件上传权限');
      const owner=await new OrgOwnershipService(this.fileMetadataRepo.manager).resolveHouseIdentity(ownerId);
      const house={farm_code:owner.farmCode,company_code:owner.companyCode,site_code:owner.siteCode??''};
      let scope=deriveOrgScope(req);
      if(moduleCode==='PRODUCTION_INBOUND') {
        if(!this.dataScopes)throw new BadRequestException('缺少有效附件数据范围');
        const user=req.user;const roles=user?.roles??(user?.role?[user.role]:[]);
        const menus=['MENU_PROD_INBOUND','MENU_FIN2_AR_LEDGER'].filter(menu=>isAdmin||hasPerm(user?.permissions,menu,'E')
          ||menu==='MENU_PROD_INBOUND'&&hasPerm(user?.permissions,menu,'C'));
        const candidates=await Promise.all(menus.map(menu=>this.dataScopes!.resolve(String(user?.userId??user?.id??''),roles,menu,user?.perms_version)));
        const matched=candidates.find(s=>s.isGlobal||s.allowedCompanyCodes.includes(house.company_code)
          ||s.allowedFarmCodes.includes(house.farm_code)||s.allowedSiteCodes.includes(house.site_code));
        if(!matched)throw new BadRequestException('附件鸡舍不在实际业务授权范围内');
        scope={isGlobal:matched.isGlobal,farmCode:'',siteCode:'',farmCodes:matched.allowedFarmCodes,siteCodes:matched.allowedSiteCodes,companyCodes:matched.allowedCompanyCodes};
      }
      if(!house || ownerType!=='HOUSE' || house.company_code!==companyCode || house.site_code!==storeCode || !scope.isGlobal && !(
        (scope.farmCodes??[]).includes(house.farm_code) || (scope.siteCodes??[]).includes(house.site_code) || (scope.companyCodes??[]).includes(house.company_code))) throw new BadRequestException('附件鸡舍权威归属或数据范围不匹配');
      companyCode=house.company_code;storeCode=house.site_code;
    }
    if(moduleCode==='PRODUCTION_CONVERSION'){
      const bytes=readFileSync(file.path),hex=bytes.subarray(0,8).toString('hex');
      canonicalMime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf'
        :hex==='89504e470d0a1a0a'?'image/png':bytes.subarray(0,3).toString('hex')==='ffd8ff'?'image/jpeg'
          :bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':'';
      try{
        if(!canonicalMime)throw new Error('Unsupported evidence content');
        if(canonicalMime==='application/pdf'){
          const pdf=await PDFDocument.load(bytes,{throwOnInvalidObject:true,updateMetadata:false});
          if(!pdf.getPageCount()||pdf.getPages().some(page=>!Number.isFinite(page.getWidth())||!Number.isFinite(page.getHeight())||page.getWidth()<=0||page.getHeight()<=0))
            throw new Error('Evidence has no readable pages');
        }else await sharp(bytes,{failOn:'warning',limitInputPixels:40000000}).raw().toBuffer();
      }catch{
        throw new BadRequestException('加工证据须为可解码的 PDF、JPEG、PNG 或 WebP；损坏、加密或过大图片请重新导出');
      }
    }
    const ownerAssigned = moduleCode !== LEGACY_MODULE_CODE && ownerType !== LEGACY_PENDING && ownerId !== LEGACY_PENDING;
    metadataAttempted=true;
    const metadata = await this.fileMetadataRepo.save(this.fileMetadataRepo.create({
      fileId,
      originalName: this.safeText(file.originalname, 255),
      storedName: this.safeText(file.filename, 255),
      storagePath: file.path,
      mimeType: this.safeText(canonicalMime, 128),
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

    retained=true;
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
    }catch(error){
      // Once save was attempted, a disconnected original transaction may still commit.
      // Even a fresh SELECT returning no row cannot prove it is safe to remove these bytes.
      if(moduleCode==='PRODUCTION_CONVERSION'&&!retained&&!metadataAttempted)unlinkSync(file.path);
      throw error;
    }
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
