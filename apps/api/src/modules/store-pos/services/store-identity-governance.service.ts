import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class StoreIdentityGovernanceService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  async assertStoreSiteAlias(storeId: string | number, siteCode: string): Promise<void> {
    const [match] = await this.em.query(
      `SELECT 1
         FROM store_master s
         JOIN sys_organizations o ON o.org_code=$2
        WHERE s.id=$1 AND s.status='ACTIVE' AND o.status='ACTIVE'
          AND o.org_type='SITE' AND o.site_business_type='STORE'
          AND o.company_code=s.company_code
        LIMIT 1`,
      [storeId, siteCode],
    );
    if (!match) {
      throw new BadRequestException('门店组织投影必须是同公司 ACTIVE STORE SITE');
    }
  }

  async assertStoreCompanyConsistent(storeId: string | number, companyCode: string): Promise<void> {
    const [conflict] = await this.em.query(
      `SELECT a.alias_code
         FROM store_aliases a
         JOIN sys_organizations o ON o.org_code=a.alias_code
        WHERE a.store_id=$1 AND a.alias_type='STORE_SITE' AND a.status='ACTIVE'
          AND o.company_code<>$2
        LIMIT 1`,
      [storeId, companyCode],
    );
    if (conflict) {
      throw new BadRequestException(`门店公司与 STORE_SITE ${conflict.alias_code} 不一致`);
    }
  }
}
