import { describe, expect, it } from 'vitest';
import { roleSignature, userEditable } from './user-role-logic';
describe('settings user page logic',()=>{
  it('is insensitive to role order',()=>expect(roleSignature([{role_code:'B'},{role_code:'A'}])).toBe(roleSignature([{role_code:'A'},{role_code:'B'}])));
  it('normalizes role flags',()=>expect(roleSignature([{role_code:'A'}])).toContain('"is_visible":true'));
  it('detects primary changes',()=>expect(roleSignature([{role_code:'A'}])).not.toBe(roleSignature([{role_code:'A',is_primary:true}])));
  it.each([[false,'ACTIVE',true],[true,'ACTIVE',false],[false,'ARCHIVED',false]] as const)('editable %#',(isAdmin,status,expected)=>expect(userEditable({isAdmin,status})).toBe(expected));
});
