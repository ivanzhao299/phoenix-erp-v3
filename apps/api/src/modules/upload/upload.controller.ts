import {
  Controller, Post, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';

const ALLOWED_EXTS  = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB（前端已压缩图片；PDF 接受原始大小）

@Controller('api/upload')
@UseGuards(AuthGuard('jwt'))
export class UploadController {
  /**
   * POST /api/upload/contract
   * 上传采购合同或单据（PDF / 图片）
   * 返回 { code, url, originalName, size }
   */
  @Post('contract')
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
  uploadContract(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('文件上传失败');
    return {
      code: 200,
      url:          `/uploads/contracts/${file.filename}`,
      originalName: file.originalname,
      size:         file.size,
    };
  }
}
