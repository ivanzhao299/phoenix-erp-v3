export type HouseInventorySourceMode = {
  companyCode: string;
  siteCode: string | null;
  farmCode: string | null;
  houseCode: string;
  mode: 'TEMP_PRODUCTION_INBOUND' | 'PACKAGING_INBOUND';
  modeScope: { level: 'GROUP' | 'COMPANY' | 'SITE' | 'DEFAULT'; code: string | null };
};

export type ProductionInboundAvailability = HouseInventorySourceMode & {
  state: 'OFF' | 'FENCED' | 'ACTIVE' | 'SUSPENDED';
  firstProductionDate: string | null;
};
