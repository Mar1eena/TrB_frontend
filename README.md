# TrB_frontend

Веб-интерфейс платформы TrB: админка NATS, справочник инструментов, scheduler, ClickHouse manager и отладка gRPC API.

Бэкенд и инфраструктура: [`TrB_backend`](../TrB_backend). Контракты: [`TrB_proto`](../TrB_proto).

## Требования

- Node.js 22+
- Рядом с этим репозиторием должен лежать `F:\Git\TrB_proto` (локальная зависимость `@marleena/trb-proto`)
- Для работы UI нужны Envoy (`:8081`) и gateway (`:9092`) из `TrB_backend`

## Быстрый старт

```bash
npm install
npm run dev
```

Dev-сервер: http://localhost:3002

Прокси Vite:

| Путь | Куда |
|---|---|
| gRPC-Web / JSON (`/trb.*`, `/tinkoff.*`, `/v1/test`) | Envoy `http://127.0.0.1:8081` |
| WebSocket `/ws` | Gateway `http://127.0.0.1:9092` |

## Скрипты

```bash
npm run dev       # Vite, порт 3002
npm run build     # production-сборка в dist/
npm run preview   # превью собранного UI на порту 3002
```
