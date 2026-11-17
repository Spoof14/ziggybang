import { type AppUrlState, parseAppUrl } from "./url-state";

/** Fields `MapApp` can seed from a parsed share URL or saved search. */
export type AppUrlPatch = {
  searchInput: string;
  viewMode: NonNullable<AppUrlState["viewMode"]>;
  sources?: AppUrlState["sources"];
  propertyTypes?: AppUrlState["propertyTypes"];
  salesTypes?: AppUrlState["salesTypes"];
  areaBucketIds?: AppUrlState["areaBucketIds"];
  radiusM?: number;
  circleCenter?: AppUrlState["circleCenter"];
  view?: AppUrlState["view"];
  listSort?: AppUrlState["listSort"];
  foreignerOk?: boolean;
  hasPhotos?: boolean;
  floorFilter?: AppUrlState["floorFilter"];
  ageFilter?: AppUrlState["ageFilter"];
  maxBuildingAge?: number;
  minDeposit?: number;
  maxDeposit?: number;
  minRent?: number;
  maxRent?: number;
};

export function parseAppUrlPatch(search: string): AppUrlPatch {
  const url = parseAppUrl(search);
  return {
    searchInput: url.searchInput ?? "",
    viewMode: url.viewMode ?? "map",
    sources: url.sources,
    propertyTypes: url.propertyTypes,
    salesTypes: url.salesTypes,
    areaBucketIds: url.areaBucketIds,
    radiusM: url.radiusM,
    circleCenter: url.circleCenter,
    view: url.view,
    listSort: url.listSort,
    foreignerOk: url.foreignerOk,
    hasPhotos: url.hasPhotos,
    floorFilter: url.floorFilter,
    ageFilter: url.ageFilter,
    maxBuildingAge: url.maxBuildingAge,
    minDeposit: url.minDeposit,
    maxDeposit: url.maxDeposit,
    minRent: url.minRent,
    maxRent: url.maxRent,
  };
}