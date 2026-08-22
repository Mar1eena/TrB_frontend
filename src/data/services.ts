export type ServiceNode = {
  id: string;
  label: string;
  kind?: "group" | "service";
  description?: string;
  children?: ServiceNode[];
};

export const serviceTree: ServiceNode[] = [
  {
    id: "workers",
    label: "Сервисы",
    kind: "group",
    children: [
      {
        id: "instruments",
        label: "Инструменты",
        kind: "service",
        description: "Справочник акций TrB.sht: реквизиты, версия, обновление из Тинькофф.",
      },
      {
        id: "historicCandle",
        label: "Исторические свечи",
        kind: "service",
        description: "Догрузка исторических свечей по заданиям из NATS.",
      },
      {
        id: "downloadHistory",
        label: "История загрузок",
        kind: "service",
        description: "Последние загрузки исторических свечей по инструментам.",
      },
      {
        id: "historicCandle_scheduler",
        label: "Планировщик свечей",
        kind: "service",
        description: "Оркестратор задач по историческим свечам.",
      },
    ],
  },
  {
    id: "admin",
    label: "Админка / API",
    kind: "group",
    children: [
      {
        id: "invest",
        label: "Invest",
        kind: "service",
        description: "gRPC-прокси T-Invest: счета, инструменты, market data, заявки, песочница.",
      },
      {
        id: "nats",
        label: "Админка NATS",
        kind: "service",
        description: "Администрирование JetStream: стримы, consumer'ы, сообщения.",
      },
      {
        id: "grpc_debug",
        label: "Отладка RPC",
        kind: "service",
        description: "Unary gRPC-запросы ко всем T-Invest прокси через Envoy.",
      },
      {
        id: "data",
        label: "Data",
        kind: "service",
        description: "Доменный API: ClickHouse (инструменты, загрузки) и PostgreSQL (планировщик).",
      },
      {
        id: "clickhouse",
        label: "ClickHouse",
        kind: "service",
        description: "Схема ClickHouse: базы, таблицы, колонки через Envoy.",
      },
    ],
  },
];

export function findService(
  nodes: ServiceNode[],
  id: string,
): ServiceNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findService(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
