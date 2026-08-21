import { UsersServiceClient } from "@marleena/trb-proto/tinvest/UsersServiceClientPb";
import {
  AccountStatus,
  CurrencyTransferRequest,
  GetAccountValuesRequest,
  GetAccountsRequest,
  GetBankAccountsRequest,
  GetInfoRequest,
  GetMarginAttributesRequest,
  GetUserTariffRequest,
  PayInRequest,
  type Account,
  type GetAccountsResponse,
  type GetMarginAttributesResponse,
  type GetUserTariffResponse,
  type GetInfoResponse,
  type GetBankAccountsResponse,
  type CurrencyTransferResponse,
  type PayInResponse,
  type GetAccountValuesResponse,
} from "@marleena/trb-proto/tinvest/users_pb";
import { MoneyValue } from "@marleena/trb-proto/tinvest/common_pb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache, type CacheOptions } from "../common/cache";
import { toPlain, parseMoney, str, toMoneyValue } from "../common/converters";

export const usersClient = new UsersServiceClient(getGrpcBaseUrl());

export const USERS_GRPC_METHODS = [
  { value: "GetAccounts", label: "GetAccounts", write: false },
  { value: "GetInfo", label: "GetInfo", write: false },
  { value: "GetUserTariff", label: "GetUserTariff", write: false },
  { value: "GetMarginAttributes", label: "GetMarginAttributes", write: false },
  { value: "GetBankAccounts", label: "GetBankAccounts", write: false },
  { value: "GetAccountValues", label: "GetAccountValues", write: false },
  { value: "CurrencyTransfer", label: "CurrencyTransfer", write: true },
  { value: "PayIn", label: "PayIn", write: true },
] as const;

export type UsersGrpcMethod = (typeof USERS_GRPC_METHODS)[number]["value"];

export function toAccountStatus(raw: unknown): AccountStatus {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw as AccountStatus;
  if (raw === "ACCOUNT_STATUS_NEW" || raw === "NEW") return AccountStatus.ACCOUNT_STATUS_NEW;
  if (raw === "ACCOUNT_STATUS_OPEN" || raw === "OPEN") return AccountStatus.ACCOUNT_STATUS_OPEN;
  if (raw === "ACCOUNT_STATUS_CLOSED" || raw === "CLOSED") return AccountStatus.ACCOUNT_STATUS_CLOSED;
  return AccountStatus.ACCOUNT_STATUS_ALL;
}

export async function getAccounts(
  status?: AccountStatus | string | number,
  opts?: CacheOptions,
): Promise<GetAccountsResponse> {
  const statusEnum = status != null ? toAccountStatus(status) : AccountStatus.ACCOUNT_STATUS_ALL;
  return globalApiCache.read(
    `users:getAccounts:${statusEnum}`,
    async () => {
      const req = new GetAccountsRequest();
      if (status != null) {
        req.setStatus(statusEnum);
      }
      return usersClient.getAccounts(req);
    },
    opts,
  );
}

export async function getMarginAttributes(
  accountId?: string,
  opts?: CacheOptions,
): Promise<GetMarginAttributesResponse> {
  const id = accountId?.trim() ?? "";
  return globalApiCache.read(
    `users:getMarginAttributes:${id}`,
    async () => {
      const req = new GetMarginAttributesRequest();
      if (id) {
        req.setAccountId(id);
      }
      return usersClient.getMarginAttributes(req);
    },
    opts,
  );
}

export async function getUserTariff(opts?: CacheOptions): Promise<GetUserTariffResponse> {
  return globalApiCache.read("users:getUserTariff", async () => usersClient.getUserTariff(new GetUserTariffRequest()), opts);
}

export async function getInfo(opts?: CacheOptions): Promise<GetInfoResponse> {
  return globalApiCache.read("users:getInfo", async () => usersClient.getInfo(new GetInfoRequest()), opts);
}

export async function getBankAccounts(opts?: CacheOptions): Promise<GetBankAccountsResponse> {
  return globalApiCache.read("users:getBankAccounts", async () => usersClient.getBankAccounts(new GetBankAccountsRequest()), opts);
}

export async function getAccountValues(
  accounts?: string[],
  opts?: CacheOptions,
): Promise<GetAccountValuesResponse> {
  const list = accounts ?? [];
  const key = `users:getAccountValues:${list.join(",")}`;
  return globalApiCache.read(
    key,
    async () => {
      const req = new GetAccountValuesRequest();
      if (list.length > 0) {
        req.setAccountsList(list);
      }
      return usersClient.getAccountValues(req);
    },
    opts,
  );
}

export async function currencyTransfer(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: MoneyValue | number | string;
  transactionId?: string;
}): Promise<CurrencyTransferResponse> {
  return globalApiCache.write(async () => {
    const req = new CurrencyTransferRequest();
    req.setFromAccountId(params.fromAccountId);
    req.setToAccountId(params.toAccountId);
    req.setAmount(toMoneyValue(params.amount));
    req.setTransactionId(params.transactionId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tx-${Date.now()}`));
    return usersClient.currencyTransfer(req);
  });
}

export async function payIn(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: MoneyValue | number | string;
}): Promise<PayInResponse> {
  return globalApiCache.write(async () => {
    const req = new PayInRequest();
    req.setFromAccountId(params.fromAccountId);
    req.setToAccountId(params.toAccountId);
    req.setAmount(toMoneyValue(params.amount));
    return usersClient.payIn(req);
  });
}

export async function callUsersGrpc(
  method: UsersGrpcMethod,
  request: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  switch (method) {
    case "GetAccounts": {
      const res = await getAccounts(request.status as AccountStatus | string | number, { fresh: true });
      return toPlain(res);
    }
    case "GetMarginAttributes": {
      const res = await getMarginAttributes(str(request.account_id), { fresh: true });
      return toPlain(res);
    }
    case "GetUserTariff": {
      const res = await getUserTariff({ fresh: true });
      return toPlain(res);
    }
    case "GetInfo": {
      const res = await getInfo({ fresh: true });
      return toPlain(res);
    }
    case "GetBankAccounts": {
      const res = await getBankAccounts({ fresh: true });
      return toPlain(res);
    }
    case "GetAccountValues": {
      const accounts = Array.isArray(request.accounts)
        ? request.accounts.map((item) => String(item))
        : undefined;
      const res = await getAccountValues(accounts, { fresh: true });
      return toPlain(res);
    }
    case "CurrencyTransfer": {
      const res = await currencyTransfer({
        fromAccountId: str(request.from_account_id),
        toAccountId: str(request.to_account_id),
        amount: request.amount as MoneyValue,
        transactionId: str(request.transaction_id),
      });
      return toPlain(res);
    }
    case "PayIn": {
      const res = await payIn({
        fromAccountId: str(request.from_account_id),
        toAccountId: str(request.to_account_id),
        amount: request.amount as MoneyValue,
      });
      return toPlain(res);
    }
    default: {
      const exhaustiveCheck: never = method;
      throw new Error(`Неизвестный метод UsersService: ${exhaustiveCheck}`);
    }
  }
}

export { parseMoney, type Account };
