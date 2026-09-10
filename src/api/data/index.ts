import { instrumentsClient, instrPb } from "../instruments/client";
import { historicCandleClient, hcPb } from "../historicCandle/client";
import { postgresqlClient, pgPb } from "../postgresql/client";
import { formatTimestamp, quotationToNumber } from "../common/converters";
import type { Share } from "@marleena/trb-proto/api/tinvest/instruments_pb";
import type { SchedulerTarget } from "@marleena/trb-proto/postgresql/postgresql_pb";
import type { LastDownload } from "@marleena/trb-proto/historiccandle/historiccandle_pb";

export {
  DATA_API_GRPC_METHODS,
  DB_API_GRPC_METHODS,
  callDataApiGrpc,
  callDbApiGrpc,
  dataApiServiceName,
  defaultDataApiRequestBody,
  defaultDbApiRequestBody,
  type DataApiGrpcMethod,
  type DbApiGrpcMethod,
} from "./debug";

function grpcError(err: unknown, fallback: string): Error {
  if (err instanceof Error && err.message) {
    return new Error(err.message);
  }
  return new Error(fallback);
}

/** Coalesce identical in-flight RPCs (e.g. React StrictMode double-mount). */
const inflight = new Map<string, Promise<unknown>>();

function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

type FilterLike = { setQ: (v: string) => unknown; setLimit: (v: number) => unknown };

function fillFilter<T extends FilterLike>(filter: T, q: string, limit: number): T {
  if (q.trim()) filter.setQ(q.trim());
  if (limit > 0) filter.setLimit(limit);
  return filter;
}

/** Параметры постраничной выборки для больших таблиц. */
export type ListPageParams = {
  offset: number;
  limit: number;
  q?: string;
  sortBy?: string;
  sortDesc?: boolean;
  fieldFilters?: Record<string, string>;
};

/** Заполняет общие поля ListFilter (q/limit/offset/sort/field_filters). */
function fillPagedFilter<
  F extends {
    setQ(v: string): unknown;
    setLimit(v: number): unknown;
    setOffset(v: number): unknown;
    setSortBy(v: string): unknown;
    setSortDesc(v: boolean): unknown;
  },
  FF extends { setField(v: string): unknown; setValue(v: string): unknown },
>(filter: F, makeFieldFilter: () => FF, addFieldFilter: (ff: FF) => unknown, p: ListPageParams): F {
  if (p.q && p.q.trim()) filter.setQ(p.q.trim());
  if (p.limit > 0) filter.setLimit(p.limit);
  if (p.offset > 0) filter.setOffset(p.offset);
  if (p.sortBy) filter.setSortBy(p.sortBy);
  if (p.sortDesc) filter.setSortDesc(true);
  for (const [field, value] of Object.entries(p.fieldFilters ?? {})) {
    const v = value.trim();
    if (!v) continue;
    const ff = makeFieldFilter();
    ff.setField(field);
    ff.setValue(v);
    addFieldFilter(ff);
  }
  return filter;
}

function filtersKey(p: ListPageParams): string {
  return JSON.stringify([
    p.offset,
    p.limit,
    p.q ?? "",
    p.sortBy ?? "",
    p.sortDesc ?? false,
    p.fieldFilters ?? {},
  ]);
}

export type Instrument = {
  uid: string;
  figi: string;
  ticker: string;
  name: string;
  class_code: string;
  isin: string;
  lot: number;
  currency: string;
  exchange: string;
  sector: string;
  trading_status: number;
  liquidity_flag: boolean;
  short_enabled_flag: boolean;
  api_trade_available_flag: boolean;
  buy_available_flag: boolean;
  sell_available_flag: boolean;
  first_1min_candle_date?: string;
  first_1day_candle_date?: string;
  version?: string;
  version_count?: number;
  klong: number;
  kshort: number;
  dlong: number;
  dshort: number;
  dlong_min: number;
  dshort_min: number;
  ipo_date?: string;
  issue_size: number;
  country_of_risk: string;
  country_of_risk_name: string;
  issue_size_plan: number;
  nominal_currency: string;
  nominal_units: number;
  nominal_nano: number;
  otc_flag: boolean;
  div_yield_flag: boolean;
  share_type: number;
  min_price_increment: number;
  real_exchange: number;
  position_uid: string;
  asset_uid: string;
  instrument_exchange: number;
  required_tests: string[];
  for_iis_flag: boolean;
  for_qual_investor_flag: boolean;
  weekend_flag: boolean;
  blocked_tca_flag: boolean;
  brand_logo_name: string;
  brand_logo_base_color: string;
  brand_text_color: string;
  dlong_client: number;
  dshort_client: number;
};

function mapInstrument(
  item: Share,
  extra?: { version?: string; version_count?: number },
): Instrument {
  const nominal = item.getNominal();
  const brand = item.getBrand();
  return {
    uid: item.getUid(),
    figi: item.getFigi(),
    ticker: item.getTicker(),
    name: item.getName(),
    class_code: item.getClassCode(),
    isin: item.getIsin(),
    lot: item.getLot(),
    currency: item.getCurrency(),
    exchange: item.getExchange(),
    sector: item.getSector(),
    trading_status: item.getTradingStatus(),
    liquidity_flag: item.getLiquidityFlag(),
    short_enabled_flag: item.getShortEnabledFlag(),
    api_trade_available_flag: item.getApiTradeAvailableFlag(),
    buy_available_flag: item.getBuyAvailableFlag(),
    sell_available_flag: item.getSellAvailableFlag(),
    first_1min_candle_date: formatTimestamp(item.getFirst1minCandleDate()) || undefined,
    first_1day_candle_date: formatTimestamp(item.getFirst1dayCandleDate()) || undefined,
    version: extra?.version,
    version_count: extra?.version_count,
    klong: quotationToNumber(item.getKlong()),
    kshort: quotationToNumber(item.getKshort()),
    dlong: quotationToNumber(item.getDlong()),
    dshort: quotationToNumber(item.getDshort()),
    dlong_min: quotationToNumber(item.getDlongMin()),
    dshort_min: quotationToNumber(item.getDshortMin()),
    ipo_date: formatTimestamp(item.getIpoDate()) || undefined,
    issue_size: item.getIssueSize(),
    country_of_risk: item.getCountryOfRisk(),
    country_of_risk_name: item.getCountryOfRiskName(),
    issue_size_plan: item.getIssueSizePlan(),
    nominal_currency: nominal?.getCurrency() || "",
    nominal_units: nominal?.getUnits() || 0,
    nominal_nano: nominal?.getNano() || 0,
    otc_flag: item.getOtcFlag(),
    div_yield_flag: item.getDivYieldFlag(),
    share_type: item.getShareType(),
    min_price_increment: quotationToNumber(item.getMinPriceIncrement()),
    real_exchange: item.getRealExchange(),
    position_uid: item.getPositionUid(),
    asset_uid: item.getAssetUid(),
    instrument_exchange: item.getInstrumentExchange(),
    required_tests: item.getRequiredTestsList() ?? [],
    for_iis_flag: item.getForIisFlag(),
    for_qual_investor_flag: item.getForQualInvestorFlag(),
    weekend_flag: item.getWeekendFlag(),
    blocked_tca_flag: item.getBlockedTcaFlag(),
    brand_logo_name: brand?.getLogoName() || "",
    brand_logo_base_color: brand?.getLogoBaseColor() || "",
    brand_text_color: brand?.getTextColor() || "",
    dlong_client: quotationToNumber(item.getDlongClient()),
    dshort_client: quotationToNumber(item.getDshortClient()),
  };
}

function mapInstrumentRow(row: {
  getShare: () => Share | undefined;
  getVersion: () => Parameters<typeof formatTimestamp>[0];
  getVersionCount: () => number;
}): Instrument[] {
  const share = row.getShare();
  if (!share) return [];
  return [
    mapInstrument(share, {
      version: formatTimestamp(row.getVersion()) || undefined,
      version_count: row.getVersionCount(),
    }),
  ];
}

export async function listInstruments(
  q = "",
  limit = 2000,
  opts?: { lite?: boolean },
): Promise<Instrument[]> {
  const lite = opts?.lite === true;
  const key = `ListInstruments:${q.trim()}:${limit}:${lite ? 1 : 0}`;
  return coalesce(key, async () => {
    const req = new instrPb.ListInstrumentsRequest();
    req.setFilter(fillFilter(new instrPb.ListFilter(), q, limit));
    if (lite) req.setLite(true);
    try {
      const resp = await instrumentsClient.listInstruments(req);
      return resp.getItemsList().flatMap(mapInstrumentRow);
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить инструменты");
    }
  });
}

/** Постраничная выборка инструментов с серверными фильтрами/сортировкой. */
export async function listInstrumentsPage(
  p: ListPageParams & { lite?: boolean },
): Promise<{ items: Instrument[]; total: number }> {
  const key = `ListInstrumentsPage:${p.lite ? 1 : 0}:${filtersKey(p)}`;
  return coalesce(key, async () => {
    const req = new instrPb.ListInstrumentsRequest();
    const filter = new instrPb.ListFilter();
    fillPagedFilter(
      filter,
      () => new instrPb.FieldFilter(),
      (ff) => filter.addFieldFilters(ff),
      p,
    );
    req.setFilter(filter);
    if (p.lite) req.setLite(true);
    try {
      const resp = await instrumentsClient.listInstruments(req);
      return {
        items: resp.getItemsList().flatMap(mapInstrumentRow),
        total: resp.getTotal(),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить инструменты");
    }
  });
}

export async function listInstrumentVersions(uid: string): Promise<Instrument[]> {
  const key = `ListInstrumentVersions:${uid.trim()}`;
  return coalesce(key, async () => {
    const req = new instrPb.ListInstrumentVersionsRequest();
    req.setUid(uid.trim());
    try {
      const resp = await instrumentsClient.listInstrumentVersions(req);
      return resp.getItemsList().flatMap((row) => {
        const share = row.getShare();
        if (!share) return [];
        return [
          mapInstrument(share, {
            version: formatTimestamp(row.getVersion()) || undefined,
          }),
        ];
      });
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить версии инструмента");
    }
  });
}

export async function listSchedulerTargets() {
  return coalesce("ListSchedulerTargets", async () => {
    try {
      const resp = await postgresqlClient.listSchedulerTargets(
        new pgPb.ListSchedulerTargetsRequest(),
      );
      return resp.getItemsList().map((item: SchedulerTarget) => ({
        uid: item.getUid(),
        interval: item.getInterval(),
        enabled: item.getEnabled(),
        created_at: formatTimestamp(item.getCreatedAt()) || undefined,
        updated_at: formatTimestamp(item.getUpdatedAt()) || undefined,
        ticker: item.getTicker() || undefined,
        name: item.getName() || undefined,
        figi: item.getFigi() || undefined,
      }));
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить цели scheduler");
    }
  });
}

export async function syncSchedulerTargets(
  instruments: { uid: string; intervals: number[] }[],
  opts?: { allowEmpty?: boolean },
): Promise<void> {
  const allowEmpty = opts?.allowEmpty === true || instruments.length === 0;
  const req = new pgPb.SyncSchedulerTargetsRequest();
  req.setAllowEmpty(allowEmpty);
  for (const inst of instruments) {
    const row = new pgPb.SchedulerTargetInstrument();
    row.setUid(inst.uid);
    row.setIntervalsList(inst.intervals);
    req.addInstruments(row);
  }
  try {
    await postgresqlClient.syncSchedulerTargets(req);
  } catch (err) {
    throw grpcError(err, "Не удалось сохранить изменения");
  }
}

function mapLastDownload(item: LastDownload) {
  return {
    uid: item.getUid(),
    figi: item.getFigi(),
    ticker: item.getTicker(),
    name: item.getName(),
    interval: item.getInterval() || null,
    last_start: formatTimestamp(item.getLastStart()),
    last_end: formatTimestamp(item.getLastEnd()),
    has_download: item.getHasDownload(),
  };
}

export type LastDownloadRow = ReturnType<typeof mapLastDownload>;

export async function listLastDownloads(
  q = "",
  limit = 500,
) {
  const key = `ListLastDownloads:${q.trim()}:${limit}`;
  return coalesce(key, async () => {
    const req = new hcPb.ListLastDownloadsRequest();
    req.setFilter(fillFilter(new hcPb.ListFilter(), q, limit));
    try {
      const resp = await historicCandleClient.listLastDownloads(req);
      return resp.getItemsList().map(mapLastDownload);
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить последние загрузки");
    }
  });
}

/** Постраничная выборка истории загрузок с серверными фильтрами/сортировкой. */
export async function listLastDownloadsPage(
  p: ListPageParams & { intervalFilter?: number },
): Promise<{ items: LastDownloadRow[]; total: number }> {
  const key = `ListLastDownloadsPage:${p.intervalFilter ?? 0}:${filtersKey(p)}`;
  return coalesce(key, async () => {
    const req = new hcPb.ListLastDownloadsRequest();
    const filter = new hcPb.ListFilter();
    fillPagedFilter(
      filter,
      () => new hcPb.FieldFilter(),
      (ff) => filter.addFieldFilters(ff),
      p,
    );
    if (p.intervalFilter && p.intervalFilter > 0) filter.setIntervalFilter(p.intervalFilter);
    req.setFilter(filter);
    try {
      const resp = await historicCandleClient.listLastDownloads(req);
      return {
        items: resp.getItemsList().map(mapLastDownload),
        total: resp.getTotal(),
      };
    } catch (err) {
      throw grpcError(err, "Не удалось загрузить последние загрузки");
    }
  });
}
