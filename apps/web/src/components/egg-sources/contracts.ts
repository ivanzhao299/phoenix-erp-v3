export const root = '/master-data/egg-sources';
export const colors = ['STANDARD','RED','PINK'] as const;
export const states = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','REVOKE_REQUESTED','REVOKED'] as const;
export type Shell = typeof colors[number];
export type Action = 'submit'|'approve'|'reject'|'cancel'|'request-revoke'|'revoke'|'decline-revoke';
export type Requirement = { gradeCode:string;specCode:string };
export type Input = { houseCode:string;effectiveDate:string;targetClass:Shell;warehouseCode:string;
  reason:string;requirements:Requirement[];planDocument:string|null };
export type Profile = { profileCode:string;shellClass:Shell|null;effectiveDate:string;expireDate:string|null;status:string };
export type Owner = { houseCode:string;houseName:string;companyCode:string;companyName?:string|null;farmCode:string;farmName:string;siteCode:string;siteName?:string|null };
export type House = Owner & {houseStatus:string;houseType:string};
export type Option = {code:string;name:string;nameEn?:string;nameLo?:string};
export type Options = {grades:Option[];specs:Option[]};
export type Workspace = {owner:Owner;businessDay:string|null;zone:string|null;profiles:Profile[];
  pending:{submitted:number;revokeRequested:number};createBlocker:string|null};
export type Change = {id:string;version:number;state:string;effectiveDate:string;targetClass:Shell;createdBy:string;createdByName?:string|null;
  createdAt:string;warehouseCode:string;warehouseName:string|null};
export type Changes = { items:Change[];nextCursor:string|null };
export type PlanOption = {id:string;flock_no:string;kind:'ADMIT'|'TRANSFER';status:string;version:number;business_date:string};
export type Detail = Change & {owner:Owner;businessDay:string|null;zone:string|null;reason:string;requirements:Requirement[];
  linkedPlan:boolean;plan?:(PlanOption&{frozenVersion:number|null})|null;originalApproval:{previousProfileCode:string|null;newProfileCode:string|null;
    previousClass:Shell|null;newExpiry:string|null}|null;previousClass:Shell|null;currentProfiles:Profile[];planDigest:string|null;
  frozenItems:Array<Requirement & {skuCode:string;productCode:string;domainVerified:boolean}>;
  events:Array<{action:Action;actor:string;actorName?:string|null;at:string;reason:string|null;version:number|null;state:string|null}>;
  allowedActions:Action[];canPrecheck:boolean};
export type Precheck = { status:'READY'|'BLOCKED';targetClass:Shell;effectiveDate:string;houseCode:string;warehouseCode:string;problems:string[];
  rows:Array<Requirement & {status:'PASSED'|'BLOCKED'|'NOT_CHECKED';skuCode?:string;productCode?:string;domainVerified?:boolean;
    issues:Array<{layer:string;code:string;effectiveDate?:string;expireDate?:string;group?:number}>}> };

export function query(values: Record<string,string|undefined|null>) {
  const result = new URLSearchParams();
  Object.entries(values).forEach(([key,value]) => { if (value) result.set(key,value); });
  const encoded = result.toString();
  return encoded ? '?'+encoded : '';
}
