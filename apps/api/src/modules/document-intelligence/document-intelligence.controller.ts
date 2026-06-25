import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DocumentIntelligenceService } from './document-intelligence.service';

@Controller('api/document-intelligence')
@UseGuards(AuthGuard('jwt'))
export class DocumentIntelligenceController {
  constructor(private readonly service: DocumentIntelligenceService) {}

  @Post('extract')
  extract(@Body() body: any, @Req() req: any) {
    return this.service.extract(body, req?.user ?? {});
  }
}
