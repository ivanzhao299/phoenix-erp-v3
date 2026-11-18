import { BadRequestException,CanActivate,ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/** Runs before global pipes can strip unknown fields or implicitly coerce measured quantities. */
export class StrictBodyGuard implements CanActivate {
  constructor(private readonly dto:new()=>object){}
  async canActivate(context:ExecutionContext){
    const body=context.switchToHttp().getRequest().body;
    if(!body||typeof body!=='object'||Array.isArray(body))throw new BadRequestException('业务单据请求须为完整对象');
    const checkKeys=(value:unknown,depth=0):void=>{
      if(depth>32)throw new BadRequestException('业务单据层级过深');
      if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
        if(['__proto__','constructor','prototype'].includes(key))throw new BadRequestException('业务单据包含无效字段');checkKeys(child,depth+1);
      }
    };
    checkKeys(body);
    const errors=await validate(plainToInstance(this.dto,body,{enableImplicitConversion:false}),{whitelist:true,forbidNonWhitelisted:true,forbidUnknownValues:true});
    if(errors.length)throw new BadRequestException('业务单据字段或整数枚数格式无效');return true;
  }
}
