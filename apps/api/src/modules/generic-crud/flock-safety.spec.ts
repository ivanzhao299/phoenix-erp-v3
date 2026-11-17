import { ForbiddenException } from '@nestjs/common';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';
import { writeFlock } from './flock-write-policy';
import { FarmController } from '../farm/farm.controller';

const scoped = { isGlobal:false,allowedFarmCodes:['A'],allowedSiteCodes:['SA'],allowedCompanyCodes:['CA'],
  allowedBreedingFarmCodes:['A'],allowedBreedingSiteCodes:['SA'],allowedBreedingCompanyCodes:[] };
const request = { user:{userId:'1',username:'operator',roles:[],permissions:['*']} };
describe('flock and house mutation boundaries',()=>{
  const fixture=()=>{
    const service={findOneByColumn:jest.fn().mockResolvedValue({flock_no:'FA',house_code:'HA',farm_code:'A'}),
      findAllBreedingScoped:jest.fn().mockResolvedValue([]),create:jest.fn(),update:jest.fn(),remove:jest.fn()};
    const controller=new GenericCrudController(service as never,{resolve:jest.fn().mockResolvedValue(scoped)} as never,{} as never,{} as never);
    return {service,controller};
  };
  it('blocks raw daily mutations and destructive master deletion even for wildcard permissions',async()=>{
    const {controller,service}=fixture();
    await expect(controller.create('brd_daily_logs',{},request)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.update('brd_daily_logs','1',{},request)).rejects.toBeInstanceOf(ForbiddenException);
    for (const table of ['brd_daily_logs','brd_flocks','brd_houses']) await expect(controller.remove(table,'1',request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.remove).not.toHaveBeenCalled();expect(service.update).not.toHaveBeenCalled();
  });
  it('guards old and destination ownership separately',async()=>{
    const {controller,service}=fixture();
    await expect(controller.updateWithColumn('brd_flocks','flock_no','FA',{farm_code:'B'},request)).rejects.toThrow('无权修改');
    service.findAllBreedingScoped.mockResolvedValueOnce([{flock_no:'FA'}]);
    await expect(controller.updateWithColumn('brd_flocks','flock_no','FA',{farm_code:'B'},request)).rejects.toThrow('目标农场');
    expect(service.update).not.toHaveBeenCalled();
    expect(service.findAllBreedingScoped).toHaveBeenLastCalledWith('brd_farms',{farm_code:'B'},
      {farmCodes:['A'],siteCodes:['SA'],companyCodes:[]});
  });
  it('allows a scoped edit when old and new authoritative records are accessible',async()=>{
    const {controller,service}=fixture();service.findAllBreedingScoped.mockResolvedValue([{farm_code:'A'}]);
    service.update.mockResolvedValue({msg:'ok'});
    await expect(controller.updateWithColumn('brd_flocks','flock_no','FA',{source_farm:'SUP'},request)).resolves.toEqual({code:200,msg:'ok'});
  });
  it('has service-level guards even when the HTTP controller is bypassed',async()=>{
    const query=jest.fn();const service=new GenericCrudService({query} as never);
    await expect(service.create('brd_daily_logs',{})).rejects.toThrow('专用日报');
    await expect(service.update('brd_daily_logs','id',1,{})).rejects.toThrow('专用日报');
    for(const table of ['brd_flocks','brd_houses']) await expect(service.remove(table,'id',1)).rejects.toThrow('物理删除');
    expect(query).not.toHaveBeenCalled();
  });
  it('passes resolved scope to daily PUT',async()=>{
    const update=jest.fn().mockResolvedValue({code:200});
    const controller=new FarmController({updateBreedingDailyLog:update} as never,{} as never);
    await controller.updateBreedingDailyLog(7,{mortality_qty:2},{user:{},dataScope:scoped});
    expect(update).toHaveBeenCalledWith(7,{mortality_qty:2},expect.objectContaining({companyCodes:[],farmCodes:['A']}));
  });
  it('forbids direct population edits, unknown exit states, premature close and reopening',async()=>{
    for(const [current,body,message] of [
      [{status:'LAYING',current_qty:10},{current_qty:9},'禁止直接修改'],
      [{status:'LAYING',current_qty:10},{initial_qty:20},'禁止直接修改'],
      [{status:'LAYING',current_qty:10},{status:'ELIMINATED'},'状态无效'],
      [{status:'LAYING',current_qty:10},{status:'RETIRED'},'未归零'],
      [{status:'RETIRED',current_qty:0},{status:'LAYING'},'不可重新启用'],
    ] as const){
      const query=jest.fn(async(sql:string)=>sql.includes('FROM brd_flocks') ? [{flock_no:'FA',house_code:'HA',...current}] : []);
      await expect(writeFlock({transaction:async(run:any)=>run({query})} as never,body,{pkName:'flock_no',id:'FA'})).rejects.toThrow(message);
      expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
    }
  });
});
