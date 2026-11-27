export const root = '/master-data/egg-sources';
export const colors = ['STANDARD','RED','PINK'] as const;
export const states = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','REVOKE_REQUESTED','REVOKED'] as const;
export type Shell = typeof colors[number];
export type Action = 'submit'|'approve'|'reject'|'cancel'|'request-revoke'|'revoke'|'decline-revoke';
export type Requirement = { gradeCode:string;specCode:string };
export type Input = { houseCode:string;effectiveDate:string;targetClass:Shell;warehouseCode?:string|null;contractVersion?:1|2;continuationProfileCode?:string;
  reason:string;requirements:Requirement[];planDocument:string|null };
export type Profile = { profileCode:string;shellClass:Shell|null;effectiveDate:string;expireDate:string|null;status:string };
export type Owner = { houseCode:string;houseName:string;companyCode:string;companyName?:string|null;farmCode:string;farmName:string;siteCode:string;siteName?:string|null };
export type House = Owner & {houseStatus:string;houseType:string};
export type Option = {code:string;name:string;nameEn?:string;nameLo?:string};
export type Options = {grades:Option[];specs:Option[]};
export type Readiness = {status:'READY'|'BLOCKED'|'NOT_CUT_OVER';code?:string;warehouseCode?:string|null;digest?:string|null};
export type Workspace = {owner:Owner;businessDay:string|null;zone:string|null;profiles:Profile[];
  pending:{submitted:number;expired?:number;revokeRequested:number};createBlocker?:string|null;createReason?:string|null;createContractVersion?:1|2;
  continuation?:{profileCode:string;targetClass:Shell;requirements:Requirement[]}|null};
const creationReasons=new Set(['NO_EDIT','NO_CREATE_PERMISSION','NO_V1_WAREHOUSE','PERMS_CHANGED','IMPERSONATION',
  'NON_LAYER','INACTIVE_HOUSE','NO_CALENDAR','NOT_ENROLLED','HOUSE_NOT_OPEN','HOUSE_PAUSED','WRITES_PAUSED']);

export function creationStatus(workspace:Pick<Workspace,'createContractVersion'|'createBlocker'|'createReason'|'businessDay'>) {
  const version=workspace.createContractVersion;
  const blocker=workspace.createBlocker;
  const reason=workspace.createReason;
  const known=(version===1||version===2) && (blocker===null||creationReasons.has(blocker??''))
    && (reason===undefined||(blocker===null ? reason===null : creationReasons.has(reason??'') && (blocker==='NO_EDIT'||reason===blocker)))
    && (blocker!==null || !!workspace.businessDay);
  return {version:version===1||version===2 ? version : null,allowed:known&&blocker===null,
    reason:known ? reason??blocker??null : 'CREATION_STATUS_UNKNOWN'};
}
export type Change = {id:string;overdue?:boolean;version:number;state:string;effectiveDate:string;targetClass:Shell;createdBy:string;createdByName?:string|null;
  createdAt:string;warehouseCode:string|null;warehouseName:string|null;contractVersion?:1|2};
export type Changes = { items:Change[];nextCursor:string|null };
export type PlanOption = {id:string;flock_no:string;kind:'ADMIT'|'TRANSFER';status:string;version:number;business_date:string};
export type Detail = Change & {writesPaused?:boolean;readiness?:Readiness;owner:Owner;businessDay:string|null;zone:string|null;reason:string;requirements:Requirement[];
  linkedPlan:boolean;plan?:(PlanOption&{frozenVersion:number|null})|null;originalApproval:{previousProfileCode:string|null;newProfileCode:string|null;
    previousClass:Shell|null;newExpiry:string|null}|null;previousClass:Shell|null;currentProfiles:Profile[];planDigest:string|null;
  frozenItems:Array<Requirement & {skuCode:string;productCode:string;domainVerified:boolean}>;
  events:Array<{action:Action;actor:string;actorName?:string|null;at:string;reason:string|null;version:number|null;state:string|null}>;
  allowedActions:Action[];canPrecheck:boolean};
export type Precheck = { status:'READY'|'BLOCKED';targetClass:Shell;effectiveDate:string;houseCode:string;warehouseCode:string|null;readiness?:Readiness;problems:string[];
  rows:Array<Requirement & {status:'PASSED'|'BLOCKED'|'NOT_CHECKED';skuCode?:string;productCode?:string;domainVerified?:boolean;
    issues:Array<{layer:string;code:string;effectiveDate?:string;expireDate?:string;group?:number}>}> };

export function query(values: Record<string,string|undefined|null>) {
  const result = new URLSearchParams();
  Object.entries(values).forEach(([key,value]) => { if (value) result.set(key,value); });
  const encoded = result.toString();
  return encoded ? '?'+encoded : '';
}

export const listOf = <T,>(value:unknown,check:(row:T)=>boolean):value is T[] =>
  Array.isArray(value) && value.every(row=>row && typeof row==='object' && check(row));

const dateValue = (value:unknown):value is string => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const hasOwner = (value:Owner|undefined) => !!value && typeof value.houseCode==='string' && typeof value.companyCode==='string'
  && typeof value.farmCode==='string' && typeof value.siteCode==='string';
export const isProfile = (row:Profile) => typeof row.profileCode==='string' && dateValue(row.effectiveDate)
  && typeof row.status==='string' && (row.expireDate===null || dateValue(row.expireDate));
export const isRequirement = (row:Requirement) => typeof row.gradeCode==='string' && typeof row.specCode==='string';
export const isHouseList = (value:House[]) => listOf<House>(value,hasOwner);
export const isOptionList = (value:Option[]) => listOf<Option>(value,row=>typeof row.code==='string' && typeof row.name==='string');
export const isPlanList = (value:PlanOption[]) => listOf<PlanOption>(value,row=>typeof row.id==='string' && ['ADMIT','TRANSFER'].includes(row.kind));
export const isWorkspace = (value:Workspace) => hasOwner(value.owner) && (value.businessDay===null || dateValue(value.businessDay))
  && listOf(value.profiles,isProfile) && Number.isInteger(value.pending?.submitted) && Number.isInteger(value.pending?.revokeRequested);
export const isChange = (value:Change) => typeof value.id==='string' && dateValue(value.effectiveDate)
  && typeof value.createdBy==='string' && (value.contractVersion===2 ? value.warehouseCode===null : typeof value.warehouseCode==='string')
  && typeof value.state==='string';
export const isDetail = (value:Detail) => isChange(value) && Number.isInteger(value.version) && hasOwner(value.owner)
  && listOf(value.currentProfiles,isProfile) && listOf(value.requirements,isRequirement)
  && listOf(value.frozenItems,isRequirement) && Array.isArray(value.allowedActions)
  && listOf<Detail['events'][number]>(value.events,row=>typeof row.actor==='string' && typeof row.action==='string');
