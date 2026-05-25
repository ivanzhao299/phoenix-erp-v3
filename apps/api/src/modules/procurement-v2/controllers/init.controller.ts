import {
  Controller, Get, Post, Body, Param, Query, Res,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';
import { InitService }       from '../services/init.service';
import { QueryInitBatchDto } from '../dto/query-init-batch.dto';
import { UploadInitFileDto } from '../dto/upload-init-file.dto';

@Controller('api/v2/procurement/init')
@UseGuards(MenuGuard, DataScopeGuard)
export class InitController {
  constructor(private readonly svc: InitService) {}

  // GET /api/v2/procurement/init/templates/:type
  @Get('templates/:type')
  @RequireMenu('MENU_PRC2_INIT', 'V')
  downloadTemplate(@Param('type') type: string, @Res() res: Response) {
    const buf = this.svc.downloadTemplate(type);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="init_template_${type}.xlsx"`,
    });
    res.send(buf);
  }

  // GET /api/v2/procurement/init/batches
  @Get('batches')
  @RequireMenu('MENU_PRC2_INIT', 'V')
  list(@Query() q: QueryInitBatchDto) {
    return this.svc.list(q);
  }

  // GET /api/v2/procurement/init/batches/:id
  @Get('batches/:id')
  @RequireMenu('MENU_PRC2_INIT', 'V')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  // GET /api/v2/procurement/init/batches/:id/errors
  @Get('batches/:id/errors')
  @RequireMenu('MENU_PRC2_INIT', 'V')
  getErrorRows(@Param('id') id: string) {
    return this.svc.getErrorRows(id);
  }

  // POST /api/v2/procurement/init/validate  (multipart: file + batchType + remark)
  @Post('validate')
  @RequireMenu('MENU_PRC2_INIT', 'C')
  @UseInterceptors(FileInterceptor('file'))
  async validateFile(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() dto: UploadInitFileDto,
  ) {
    if (!file) throw new Error('请上传 Excel 文件');
    return this.svc.validateFile(dto.batchType, file.buffer, file.originalname, dto.remark);
  }

  // POST /api/v2/procurement/init/batches/:id/import
  @Post('batches/:id/import')
  @RequireMenu('MENU_PRC2_INIT', 'C')
  importBatch(@Param('id') id: string) {
    return this.svc.importBatch(id);
  }

  // POST /api/v2/procurement/init/batches/:id/cancel
  @Post('batches/:id/cancel')
  @RequireMenu('MENU_PRC2_INIT', 'C')
  cancelBatch(@Param('id') id: string) {
    return this.svc.cancelBatch(id);
  }
}
