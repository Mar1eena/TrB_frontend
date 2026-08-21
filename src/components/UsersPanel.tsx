import { useState } from "react";
import {
  AccountStatus,
  AccountType,
  AccessLevel,
  AccountValue,
} from "@marleena/trb-proto/tinvest/users_pb";
import {
  USERS_GRPC_METHODS,
  callUsersGrpc,
  parseMoney,
  type UsersGrpcMethod,
} from "../api/usersGrpc";
import "../styles/tables.css";
import "./UsersPanel.css";
import { useNotify } from "../notifications";

const ACCOUNT_STATUSES = [
  { value: AccountStatus.ACCOUNT_STATUS_ALL, label: "Все" },
  { value: AccountStatus.ACCOUNT_STATUS_OPEN, label: "Открытые" },
  { value: AccountStatus.ACCOUNT_STATUS_NEW, label: "Новые" },
  { value: AccountStatus.ACCOUNT_STATUS_CLOSED, label: "Закрытые" },
];

export default function UsersPanel() {
  const notify = useNotify();
  const [method, setMethod] = useState<UsersGrpcMethod>("GetAccounts");
  const [accountId, setAccountId] = useState("");
  const [accountStatus, setAccountStatus] = useState(AccountStatus.ACCOUNT_STATUS_ALL);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("rub");
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<unknown>(null);
  const [activeMethod, setActiveMethod] = useState<UsersGrpcMethod>("GetAccounts");

  const meta = USERS_GRPC_METHODS.find((item) => item.value === method);

  const onRequest = async () => {
    setPayload(null);
    setActiveMethod(method);
    setBusy(true);
    try {
      const request: Record<string, unknown> = {};
      if (method === "GetAccounts") {
        request.status = accountStatus;
      }
      if (method === "GetMarginAttributes" && accountId.trim()) {
        request.account_id = accountId.trim();
      }
      if (method === "GetAccountValues" && accountId.trim()) {
        request.accounts = [accountId.trim()];
      }
      if (method === "CurrencyTransfer" || method === "PayIn") {
        const money = parseMoney(amount, currency);
        if (!fromAccountId.trim() || !toAccountId.trim() || !money) {
          throw new Error("нужны счета списания/зачисления и сумма");
        }
        request.from_account_id = fromAccountId.trim();
        request.to_account_id = toAccountId.trim();
        request.amount = money;
        if (method === "CurrencyTransfer") {
          request.transaction_id = crypto.randomUUID();
        }
      }
      const data = await callUsersGrpc(method, request);
      setPayload(data);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-page users-panel">
      <header className="scheduler-header">
        <p className="eyebrow">Сервисы</p>
        <h1>Пользователь / счета</h1>
        <p>
          Тестовые unary-запросы в <code>users</code> через Envoy.
          Клиент — gRPC-web стабы из <code>@marleena/trb-proto</code>.
        </p>
      </header>

      <div className="filters-bar">
        <div className="filters-row filters-fields">
          <label className="filter-field">
            <span>RPC</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as UsersGrpcMethod)}
              disabled={busy}
            >
              {USERS_GRPC_METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.write ? `${item.label} (запись)` : item.label}
                </option>
              ))}
            </select>
          </label>
          {method === "GetAccounts" ? (
            <label className="filter-field">
              <span>Статус счетов</span>
              <select
                value={accountStatus}
                onChange={(e) => setAccountStatus(Number(e.target.value))}
                disabled={busy}
              >
                {ACCOUNT_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {method === "GetMarginAttributes" || method === "GetAccountValues" ? (
            <label className="filter-field users-account-field">
              <span>Account ID</span>
              <input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="пусто = INVEST_ACCOUNT_ID"
                disabled={busy}
              />
            </label>
          ) : null}
          {meta?.write ? (
            <>
              <label className="filter-field users-account-field">
                <span>Счёт списания</span>
                <input
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="filter-field users-account-field">
                <span>Счёт зачисления</span>
                <input
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="filter-field">
                <span>Сумма</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100.50"
                  disabled={busy}
                />
              </label>
              <label className="filter-field">
                <span>Валюта</span>
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={busy}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="filters-row filters-actions">
          <button type="button" className="btn primary" onClick={() => void onRequest()} disabled={busy}>
            {busy ? "Запрос…" : "Вызвать RPC"}
          </button>
          <span className="users-conn">gRPC-web → Envoy</span>
          {meta?.write ? (
            <span className="users-error">Реальный перевод, не sandbox-заглушка</span>
          ) : null}
        </div>
      </div>

      <div className="users-result">
        <h2>Результат</h2>
        <ResultView method={activeMethod} payload={payload} />
      </div>
    </section>
  );
}

function ResultView({
  method,
  payload,
}: {
  method: UsersGrpcMethod;
  payload: unknown;
}) {
  if (payload == null) {
    return <p className="users-empty">Ответ ещё не пришёл.</p>;
  }
  if (method === "GetAccounts") return <AccountsTable payload={payload} />;
  if (method === "GetInfo") return <InfoCards payload={payload} />;
  if (method === "GetBankAccounts") return <BankAccountsTable payload={payload} />;
  if (method === "GetUserTariff") return <TariffView payload={payload} />;
  if (method === "GetMarginAttributes") return <MarginCards payload={payload} />;
  if (method === "GetAccountValues") return <AccountValuesTable payload={payload} />;
  return <PreJSON value={payload} />;
}

function AccountsTable({ payload }: { payload: unknown }) {
  const rows = listOf(payload, "accounts");
  if (!rows.length) return <p className="users-empty">Счетов нет.</p>;
  return (
    <div className="table-scroll table-scroll-fill">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя</th>
            <th>Тип</th>
            <th>Статус</th>
            <th>Доступ</th>
            <th>Открыт</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={str(row.id) || i}>
              <td className="mono">{str(row.id)}</td>
              <td>{str(row.name)}</td>
              <td>{humanEnum(lookup(AccountType, row.type))}</td>
              <td>{humanEnum(lookup(AccountStatus, row.status))}</td>
              <td>{humanEnum(lookup(AccessLevel, row.access_level))}</td>
              <td>{formatTime(row.opened_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankAccountsTable({ payload }: { payload: unknown }) {
  const rows = listOf(payload, "bank_accounts");
  if (!rows.length) return <PreJSON value={payload} />;
  return (
    <div className="table-scroll table-scroll-fill">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя</th>
            <th>Тип</th>
            <th>Открыт</th>
            <th>Деньги</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={str(row.id) || i}>
              <td className="mono">{str(row.id)}</td>
              <td>{str(row.name)}</td>
              <td>{humanEnum(lookup(AccountType, row.type))}</td>
              <td>{formatTime(row.opened_date)}</td>
              <td>{formatMoneyList(row.money)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoCards({ payload }: { payload: unknown }) {
  const obj = asRecord(payload);
  if (!obj) return <PreJSON value={payload} />;
  const items: [string, unknown][] = [
    ["User ID", obj.user_id],
    ["Тариф", obj.tariff],
    ["Премиум", obj.prem_status],
    ["Квал", obj.qual_status],
    ["Риск", obj.risk_level_code],
  ];
  const qualified = Array.isArray(obj.qualified_for_work_with)
    ? obj.qualified_for_work_with.map(str)
    : [];
  return (
    <div className="users-cards">
      {items.map(([label, value]) => (
        <div key={label} className="users-card">
          <span>{label}</span>
          <strong>{str(value)}</strong>
        </div>
      ))}
      {qualified.length ? (
        <div className="users-card users-card-wide">
          <span>Доступно после теста</span>
          <strong>{qualified.join(", ")}</strong>
        </div>
      ) : null}
    </div>
  );
}

function MarginCards({ payload }: { payload: unknown }) {
  const obj = asRecord(payload);
  if (!obj) return <PreJSON value={payload} />;
  const items: [string, string][] = [
    ["Ликвидный портфель", formatMoney(obj.liquid_portfolio)],
    ["Начальная маржа", formatMoney(obj.starting_margin)],
    ["Минимальная маржа", formatMoney(obj.minimal_margin)],
    ["Достаточность средств", formatQuotation(obj.funds_sufficiency_level)],
    ["Недостаток средств", formatMoney(obj.amount_of_missing_funds)],
    ["Скорректированная маржа", formatMoney(obj.corrected_margin)],
    ["ГО фьючерсов", formatMoney(obj.guarantee_for_futures)],
  ];
  return (
    <div className="users-cards">
      {items.map(([label, value]) => (
        <div key={label} className="users-card">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TariffView({ payload }: { payload: unknown }) {
  const unary = listOf(payload, "unary_limits");
  const streams = listOf(payload, "stream_limits");
  if (!unary.length && !streams.length) return <PreJSON value={payload} />;
  return (
    <div className="users-cards">
      {unary.map((row, i) => (
        <div key={`u-${i}`} className="users-card users-card-wide">
          <span>Unary {str(row.limit_per_minute)}/мин</span>
          <strong>{Array.isArray(row.methods) ? row.methods.map(str).join(", ") : "—"}</strong>
        </div>
      ))}
      {streams.map((row, i) => (
        <div key={`s-${i}`} className="users-card users-card-wide">
          <span>
            Stream {str(row.open)}/{str(row.limit)}
          </span>
          <strong>{Array.isArray(row.streams) ? row.streams.map(str).join(", ") : "—"}</strong>
        </div>
      ))}
    </div>
  );
}

function AccountValuesTable({ payload }: { payload: unknown }) {
  const rows = listOf(payload, "accounts");
  if (!rows.length) return <PreJSON value={payload} />;
  return (
    <div className="table-scroll table-scroll-fill">
      <table className="data-table">
        <thead>
          <tr>
            <th>Счёт</th>
            <th>Параметр</th>
            <th>Значение</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row, i) => {
            const values = Array.isArray(row.values) ? row.values : [];
            if (!values.length) {
              return [
                <tr key={i}>
                  <td className="mono">{str(row.account_id)}</td>
                  <td colSpan={2}>—</td>
                </tr>,
              ];
            }
            return values.map((item, j) => {
              const rec = asRecord(item) ?? {};
              return (
                <tr key={`${i}-${j}`}>
                  <td className="mono">{str(row.account_id)}</td>
                  <td>{humanEnum(lookup(AccountValue, rec.name))}</td>
                  <td>{formatMoney(rec.value)}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

function PreJSON({ value }: { value: unknown }) {
  return <pre className="users-json">{JSON.stringify(value, null, 2)}</pre>;
}

function listOf(payload: unknown, key: string): Record<string, unknown>[] {
  const obj = asRecord(payload);
  const list = obj?.[key];
  if (!Array.isArray(list)) return [];
  return list.map((item) => asRecord(item)).filter(Boolean) as Record<string, unknown>[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function lookup(table: object, value: unknown): unknown {
  if (typeof value === "number") {
    return (table as Record<number, string>)[value] ?? value;
  }
  return value;
}

function humanEnum(value: unknown): string {
  return str(value)
    .replace(/^ACCOUNT_TYPE_/, "")
    .replace(/^ACCOUNT_STATUS_/, "")
    .replace(/^ACCOUNT_ACCESS_LEVEL_/, "")
    .replace(/^ACCOUNT_VALUE_/, "")
    .split("_")
    .join(" ")
    .toLowerCase();
}

function formatTime(value: unknown): string {
  if (typeof value === "string" && value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("ru-RU");
    return value;
  }
  const obj = asRecord(value);
  if (obj && (typeof obj.seconds === "number" || typeof obj.seconds === "string")) {
    const ms = Number(obj.seconds) * 1000;
    if (Number.isFinite(ms)) return new Date(ms).toLocaleString("ru-RU");
  }
  return "—";
}

function formatMoney(value: unknown): string {
  const obj = asRecord(value);
  if (!obj) return "—";
  const units = Number(obj.units ?? 0);
  const nano = Number(obj.nano ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nano)) return "—";
  const n = units + nano / 1e9;
  const cur = typeof obj.currency === "string" && obj.currency ? obj.currency : "";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 9 })}${cur ? ` ${cur}` : ""}`;
}

function formatQuotation(value: unknown): string {
  const obj = asRecord(value);
  if (!obj) return "—";
  return formatMoney({ units: obj.units, nano: obj.nano });
}

function formatMoneyList(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "—";
  return value.map(formatMoney).join(", ");
}
