import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataScopeService } from '../org/services/data-scope.service';

export interface ScopedNotificationRecipient {
  userId: string;
  menuCode: string;
}

@Injectable()
export class ScopedNotificationRecipientService {
  private readonly logger = new Logger(ScopedNotificationRecipientService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly dataScope: DataScopeService,
  ) {}

  async resolve(companyCode: string, menuCodes: string[]): Promise<string[]> {
    if (!companyCode || menuCodes.length === 0) return [];
    const rows: Array<{ user_id: string; menu_code: string; role_codes: string[] | null }> = await this.ds.query(
      `WITH grants AS (
         SELECT ur.user_id, m.menu_code, rmp.perm_codes
           FROM sys_user_role ur
           JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
           JOIN sys_menu m ON m.menu_id = rmp.menu_id
          WHERE m.menu_code = ANY($1)
         UNION ALL
         SELECT ur.user_id, m.menu_code, psi.perm_codes
           FROM sys_user_role ur
           JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
           JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
           JOIN sys_menu m ON m.menu_id = psi.menu_id
          WHERE m.menu_code = ANY($1)
         UNION ALL
         SELECT ups.user_id, m.menu_code, psi.perm_codes
           FROM sys_user_permission_set ups
           JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
           JOIN sys_menu m ON m.menu_id = psi.menu_id
          WHERE m.menu_code = ANY($1)
       ), denied AS (
         SELECT ur.user_id, m.menu_code, rmp.deny_codes
           FROM sys_user_role ur
           JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
           JOIN sys_menu m ON m.menu_id = rmp.menu_id
          WHERE m.menu_code = ANY($1)
         UNION ALL
         SELECT ur.user_id, m.menu_code, psi.deny_codes
           FROM sys_user_role ur
           JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
           JOIN sys_permission_set_item psi ON psi.set_id = rps.set_id
           JOIN sys_menu m ON m.menu_id = psi.menu_id
          WHERE m.menu_code = ANY($1)
         UNION ALL
         SELECT ups.user_id, m.menu_code, psi.deny_codes
           FROM sys_user_permission_set ups
           JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
           JOIN sys_menu m ON m.menu_id = psi.menu_id
          WHERE m.menu_code = ANY($1)
       )
       SELECT DISTINCT u.user_id::text, g.menu_code,
              COALESCE(array_agg(DISTINCT r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS role_codes
         FROM sys_user u
         JOIN grants g ON g.user_id = u.user_id
         LEFT JOIN sys_user_role ur ON ur.user_id = u.user_id
         LEFT JOIN sys_role r ON r.role_id = ur.role_id
        WHERE u.status = 1
          AND (g.perm_codes = '*' OR 'V' = ANY(string_to_array(COALESCE(g.perm_codes, ''), ',')))
          AND NOT EXISTS (
            SELECT 1 FROM denied d
             WHERE d.user_id = u.user_id AND d.menu_code = g.menu_code
               AND (d.deny_codes = '*' OR 'V' = ANY(string_to_array(COALESCE(d.deny_codes, ''), ',')))
          )
        GROUP BY u.user_id, g.menu_code`,
      [menuCodes],
    );

    const recipients = new Set<string>();
    for (const row of rows) {
      const scope = await this.dataScope.resolve(row.user_id, row.role_codes ?? [], row.menu_code);
      if (scope.isGlobal || scope.allowedCompanyCodes.includes(companyCode)) recipients.add(row.user_id);
    }
    if (recipients.size === 0) {
      this.logger.warn(`预警跳过：公司 ${companyCode} 在菜单 [${menuCodes.join(',')}] 下无可见收件人`);
    }
    return [...recipients];
  }
}
