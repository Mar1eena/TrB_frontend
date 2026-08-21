import {
  INSTRUMENTS_GRPC_METHODS,
  callInstrumentsGrpc,
  type InstrumentsGrpcMethod,
} from "./instruments";
import {
  MARKETDATA_GRPC_METHODS,
  callMarketDataGrpc,
  type MarketDataGrpcMethod,
} from "./marketdata";
import {
  OPERATIONS_GRPC_METHODS,
  callOperationsGrpc,
  type OperationsGrpcMethod,
} from "./operations";
import {
  ORDERS_GRPC_METHODS,
  callOrdersGrpc,
  type OrdersGrpcMethod,
} from "./orders";
import {
  SANDBOX_GRPC_METHODS,
  callSandboxGrpc,
  type SandboxGrpcMethod,
} from "./sandbox";
import {
  SIGNALS_GRPC_METHODS,
  callSignalsGrpc,
  type SignalsGrpcMethod,
} from "./signals";
import {
  STOPORDERS_GRPC_METHODS,
  callStopOrdersGrpc,
  type StopOrdersGrpcMethod,
} from "./stoporders";
import {
  USERS_GRPC_METHODS,
  callUsersGrpc,
  type UsersGrpcMethod,
} from "./users";

export type DebugMethodMeta = {
  value: string;
  label: string;
  write: boolean;
};

export type DebugServiceId =
  | "users"
  | "instruments"
  | "marketdata"
  | "operations"
  | "orders"
  | "sandbox"
  | "signals"
  | "stoporders";

export type DebugService = {
  id: DebugServiceId;
  label: string;
  rpc: string;
  methods: readonly DebugMethodMeta[];
  call: (method: string, request: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export const DEBUG_SERVICES: readonly DebugService[] = [
  {
    id: "users",
    label: "Users",
    rpc: "UsersService",
    methods: USERS_GRPC_METHODS,
    call: (method, request) => callUsersGrpc(method as UsersGrpcMethod, request),
  },
  {
    id: "instruments",
    label: "Instruments",
    rpc: "InstrumentsService",
    methods: INSTRUMENTS_GRPC_METHODS,
    call: (method, request) => callInstrumentsGrpc(method as InstrumentsGrpcMethod, request),
  },
  {
    id: "marketdata",
    label: "MarketData",
    rpc: "MarketDataService",
    methods: MARKETDATA_GRPC_METHODS,
    call: (method, request) => callMarketDataGrpc(method as MarketDataGrpcMethod, request),
  },
  {
    id: "operations",
    label: "Operations",
    rpc: "OperationsService",
    methods: OPERATIONS_GRPC_METHODS,
    call: (method, request) => callOperationsGrpc(method as OperationsGrpcMethod, request),
  },
  {
    id: "orders",
    label: "Orders",
    rpc: "OrdersService",
    methods: ORDERS_GRPC_METHODS,
    call: (method, request) => callOrdersGrpc(method as OrdersGrpcMethod, request),
  },
  {
    id: "sandbox",
    label: "Sandbox",
    rpc: "SandboxService",
    methods: SANDBOX_GRPC_METHODS,
    call: (method, request) => callSandboxGrpc(method as SandboxGrpcMethod, request),
  },
  {
    id: "signals",
    label: "Signals",
    rpc: "SignalService",
    methods: SIGNALS_GRPC_METHODS,
    call: (method, request) => callSignalsGrpc(method as SignalsGrpcMethod, request),
  },
  {
    id: "stoporders",
    label: "StopOrders",
    rpc: "StopOrdersService",
    methods: STOPORDERS_GRPC_METHODS,
    call: (method, request) => callStopOrdersGrpc(method as StopOrdersGrpcMethod, request),
  },
];

export function findDebugService(id: string): DebugService {
  return DEBUG_SERVICES.find((item) => item.id === id) ?? DEBUG_SERVICES[0];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function range(days = 7): { from: string; to: string } {
  return { from: isoDaysAgo(days), to: new Date().toISOString() };
}

const BY_ID = { id: "", id_type: 3 };
const LIST_STATUS = { status: 1 };
const ACCOUNT = { account_id: "" };
const INSTRUMENT = { instrument_id: "" };

export function defaultRequestBody(serviceId: string, method: string): Record<string, unknown> {
  const dates = range();
  if (serviceId === "users") {
    if (method === "GetAccounts") return { status: 0 };
    if (method === "GetMarginAttributes" || method === "GetAccountValues") {
      return method === "GetAccountValues" ? { accounts: [""] } : ACCOUNT;
    }
    if (method === "CurrencyTransfer" || method === "PayIn") {
      return {
        from_account_id: "",
        to_account_id: "",
        amount: { currency: "rub", units: "100", nano: 0 },
      };
    }
    return {};
  }
  if (serviceId === "instruments") {
    if (method.endsWith("By") || method === "GetInstrumentBy" || method === "GetBrandBy" || method === "GetAssetBy") {
      return { ...BY_ID };
    }
    if (
      method === "Shares" ||
      method === "Bonds" ||
      method === "Currencies" ||
      method === "Etfs" ||
      method === "Futures" ||
      method === "Options" ||
      method === "Dfas" ||
      method === "Indicatives"
    ) {
      return { ...LIST_STATUS };
    }
    if (method === "FindInstrument") {
      return { query: "SBER", api_trade_available_flag: true };
    }
    if (method === "TradingSchedules" || method === "GetDividends" || method === "GetBondCoupons") {
      return { instrument_id: "", ...dates };
    }
    if (method === "GetInsiderDeals") return { instrument_id: "", limit: 50 };
    if (method === "News") return { limit: 20 };
    if (method === "GetForecastBy" || method === "GetRiskRates") return { ...INSTRUMENT };
    if (method === "GetAssets") return { instrument_type: 0 };
    return {};
  }
  if (serviceId === "marketdata") {
    if (method === "GetCandles") {
      return { instrument_id: "", interval: 4, ...dates };
    }
    if (method === "GetLastPrices" || method === "GetTradingStatuses" || method === "GetMarketValues") {
      return { instrument_id: [""] };
    }
    if (method === "GetOrderBook") return { instrument_id: "", depth: 10 };
    if (method === "GetTradingStatus") return { ...INSTRUMENT };
    if (method === "GetLastTrades") return { instrument_id: "", ...dates };
    if (method === "GetClosePrices") return { instruments: [""] };
    if (method === "GetTechAnalysis") {
      return {
        indicator_type: 2,
        instrument_uid: "",
        interval: 4,
        type_of_price: 1,
        length: 20,
        ...dates,
      };
    }
    return {};
  }
  if (serviceId === "operations") {
    if (method === "GetOperations" || method === "GetOperationsByCursor") {
      return { account_id: "", state: 1, limit: 100, ...dates };
    }
    if (method === "GetPortfolio") return { account_id: "", currency: 0 };
    if (method === "GetBrokerReport" || method === "GetDividendsForeignIssuer") {
      return { account_id: "", ...dates };
    }
    return { ...ACCOUNT };
  }
  if (serviceId === "orders") {
    if (method === "GetOrders") return { ...ACCOUNT };
    if (method === "GetOrderState" || method === "CancelOrder") {
      return { account_id: "", order_id: "", order_id_type: 1 };
    }
    if (method === "PostOrder" || method === "PostOrderAsync") {
      return {
        account_id: "",
        instrument_id: "",
        quantity: 1,
        direction: 1,
        order_type: 2,
        order_id: "",
      };
    }
    if (method === "ReplaceOrder") {
      return { account_id: "", order_id: "", quantity: 1, price: { units: "0", nano: 0 } };
    }
    if (method === "GetMaxLots") return { account_id: "", instrument_id: "" };
    if (method === "GetOrderPrice") {
      return {
        account_id: "",
        instrument_id: "",
        quantity: 1,
        direction: 1,
        price: { units: "0", nano: 0 },
      };
    }
    return { ...ACCOUNT };
  }
  if (serviceId === "sandbox") {
    if (method === "OpenSandboxAccount") return { name: "sandbox" };
    if (method === "GetSandboxAccounts") return { status: 0 };
    if (method === "CloseSandboxAccount") return { ...ACCOUNT };
    if (method === "PostSandboxOrder" || method === "PostSandboxOrderAsync") {
      return {
        account_id: "",
        instrument_id: "",
        quantity: 1,
        direction: 1,
        order_type: 2,
        order_id: "",
      };
    }
    if (method === "ReplaceSandboxOrder") {
      return { account_id: "", order_id: "", quantity: 1 };
    }
    if (method === "CancelSandboxOrder" || method === "GetSandboxOrderState") {
      return { account_id: "", order_id: "" };
    }
    if (method === "GetSandboxOrderPrice") {
      return {
        account_id: "",
        instrument_id: "",
        quantity: 1,
        direction: 1,
        price: { units: "0", nano: 0 },
      };
    }
    if (method === "GetSandboxOperations" || method === "GetSandboxOperationsByCursor") {
      return { account_id: "", ...dates, limit: 100 };
    }
    if (method === "GetSandboxPortfolio") return { account_id: "" };
    if (method === "SandboxPayIn") {
      return { account_id: "", amount: { currency: "rub", units: "100000", nano: 0 } };
    }
    if (method === "GetSandboxMaxLots") return { account_id: "", instrument_id: "" };
    if (method === "PostSandboxStopOrder") {
      return {
        account_id: "",
        instrument_id: "",
        quantity: 1,
        direction: 1,
        expiration_type: 1,
        stop_order_type: 1,
        stop_price: { units: "0", nano: 0 },
        price: { units: "0", nano: 0 },
      };
    }
    if (method === "CancelSandboxStopOrder") return { account_id: "", stop_order_id: "" };
    return { ...ACCOUNT };
  }
  if (serviceId === "signals") {
    if (method === "GetStrategies") return { strategy_id: "" };
    return { instrument_uid: "", ...dates };
  }
  if (serviceId === "stoporders") {
    if (method === "GetStopOrders") return { account_id: "", status: 1 };
    if (method === "PostStopOrder") {
      return {
        account_id: "",
        instrument_id: "",
        quantity: 1,
        direction: 1,
        expiration_type: 1,
        stop_order_type: 1,
        stop_price: { units: "0", nano: 0 },
        price: { units: "0", nano: 0 },
      };
    }
    if (method === "CancelStopOrder") return { account_id: "", stop_order_id: "" };
  }
  return {};
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
