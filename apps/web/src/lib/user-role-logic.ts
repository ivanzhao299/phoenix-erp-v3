export interface RoleSignatureLike { role_code:string; is_primary?:boolean; is_visible?:boolean }
export function roleSignature(roles: RoleSignatureLike[]): string {
  return JSON.stringify(roles.map(r => ({ role_code:r.role_code, is_primary:!!r.is_primary, is_visible:r.is_visible !== false })).sort((a,b)=>a.role_code.localeCompare(b.role_code)));
}
export function userEditable(input: { isAdmin:boolean; status?:string|null }): boolean { return !input.isAdmin && input.status !== 'ARCHIVED'; }
