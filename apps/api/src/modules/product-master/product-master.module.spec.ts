import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getEntityManagerToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { ProductMasterModule } from './product-master.module';
import { ProductMasterService } from './services/product-master.service';
import { MasterDataRuntimeService } from '../master-data/master-data-runtime.service';
import { ApprovalEngineModule } from '../approval-engine/approval-engine.module';
import { ApprovalEngineService } from '../approval-engine/approval-engine.service';
import { DataScopeService } from '../org/services/data-scope.service';

@Module({})
class EmptyApprovalModule {}

@Global()
@Module({
  providers: [
    { provide: getDataSourceToken(), useValue: { query: jest.fn(), manager: { query: jest.fn() } } },
    { provide: getEntityManagerToken(), useValue: { query: jest.fn() } },
    { provide: ClsService, useValue: { get: jest.fn(), set: jest.fn() } },
    { provide: ApprovalEngineService, useValue: {} },
    { provide: DataScopeService, useValue: {} },
  ],
  exports: [getDataSourceToken(), getEntityManagerToken(), ClsService, ApprovalEngineService, DataScopeService],
})
class IsolatedTestContext {}

it('compiles the real product-master/master-data module graph without a database connection', async () => {
  const module = await Test.createTestingModule({ imports: [IsolatedTestContext, ProductMasterModule] })
    .overrideModule(ApprovalEngineModule).useModule(EmptyApprovalModule).compile();
  expect(module.get(ProductMasterService)).toBeInstanceOf(ProductMasterService);
  expect(module.get(MasterDataRuntimeService)).toBeInstanceOf(MasterDataRuntimeService);
  await module.close();
});
