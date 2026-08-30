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
        id: "candles",
        label: "Свечи",
        kind: "service",
        description: "График свечей: выбор инструмента, подгрузка по масштабу, стрим.",
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
      {
        id: "indicators",
        label: "Индикаторы",
        kind: "service",
        description: "Тестовый расчёт индикаторов по свечам из ClickHouse.",
      },
    ],
  },
  {
    id: "admin",
    label: "Админка / API",
    kind: "group",
    children: [
      {
        id: "nats",
        label: "Админка NATS",
        kind: "service",
        description: "Администрирование JetStream: стримы, consumer'ы, сообщения.",
      },
      {
        id: "clickhouse",
        label: "ClickHouse",
        kind: "service",
        description: "Схема ClickHouse: базы, таблицы, колонки через Envoy.",
      },
      {
        id: "postgresql",
        label: "PostgreSQL",
        kind: "service",
        description: "Схема PostgreSQL: базы, схемы, таблицы, индексы, процессы через Envoy.",
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
