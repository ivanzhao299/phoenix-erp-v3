import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

@Controller('api/document-intelligence')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class DocumentIntelligenceController {
  constructor(private readonly service: DocumentIntelligenceService) {}

  @Post('extract')
  @RequireMenu('MENU_PRC2_ORDER', 'E', [
    'MENU_PRC2_MASTER',
    'MENU_FIN2_AP',
    'MENU_FIN2_EXPENSE',
    'MENU_FIN2_SHAREHOLDER',
  ])
  extract(@Body() body: any, @Req() req: any) {
    return this.service.extract(body, req?.user ?? {});
  }
}
