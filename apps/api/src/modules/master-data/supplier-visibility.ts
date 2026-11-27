export function supplierVisibility(alias: string, companies: string, projects: string): string {
  const field = alias ? `${alias}.` : '';
  return `(${field}shared_scope = 'GROUP' OR (${field}owner_company_code = ANY(${companies}::text[])
     AND (${field}shared_scope = 'COMPANY' OR
       (${field}shared_scope = 'PROJECT' AND ${field}owner_project_code = ANY(${projects}::text[])))))`;
}
