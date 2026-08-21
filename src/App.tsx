import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import ServiceTree from "./components/ServiceTree";
import { findService, serviceTree } from "./data/services";
import { NotificationsProvider } from "./notifications";
import "./App.css";

const InstrumentsPanel = lazy(() => import("./components/InstrumentsPanel"));
const SchedulerPanel = lazy(() => import("./components/SchedulerPanel"));
const HistoricCandlePanel = lazy(() => import("./components/HistoricCandlePanel"));
const DownloadHistoryPanel = lazy(() => import("./components/DownloadHistoryPanel"));
const NatsAdminPanel = lazy(() => import("./components/NatsAdminPanel"));
const UsersPanel = lazy(() => import("./components/UsersPanel"));
const GrpcDebugPanel = lazy(() => import("./components/GrpcDebugPanel"));
const DataApiDebugPanel = lazy(() => import("./components/DataApiDebugPanel"));
const ClickHouseManagerPanel = lazy(() => import("./components/ClickHouseManagerPanel"));

type PanelSpec = {
  id: string;
  eyebrow: string;
  title: string;
  Component: ComponentType;
};

const PANELS: PanelSpec[] = [
  { id: "instruments", eyebrow: "Сервисы", title: "Инструменты", Component: InstrumentsPanel },
  { id: "historicCandle_scheduler", eyebrow: "Сервисы", title: "Планировщик свечей", Component: SchedulerPanel },
  { id: "downloadHistory", eyebrow: "История", title: "История загрузок", Component: DownloadHistoryPanel },
  { id: "historicCandle", eyebrow: "Сервисы", title: "Исторические свечи", Component: HistoricCandlePanel },
  { id: "invest", eyebrow: "Админка / API", title: "Invest", Component: UsersPanel },
  { id: "nats", eyebrow: "Админка / API", title: "Админка NATS", Component: NatsAdminPanel },
  { id: "grpc_debug", eyebrow: "Админка / API", title: "Отладка RPC", Component: GrpcDebugPanel },
  { id: "data", eyebrow: "Админка / API", title: "Data", Component: DataApiDebugPanel },
  { id: "clickhouse", eyebrow: "Админка / API", title: "ClickHouse", Component: ClickHouseManagerPanel },
];

function PanelFallback({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <section className="panel-page">
      <header className="scheduler-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>Загрузка панели…</p>
      </header>
    </section>
  );
}

class PanelErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel-page">
          <header className="scheduler-header">
            <p className="eyebrow">Ошибка</p>
            <h1>Панель не загрузилась</h1>
            <p>{this.state.error.message}</p>
            <p>
              <button type="button" className="btn" onClick={this.props.onRetry}>
                Повторить
              </button>
            </p>
          </header>
        </section>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [selectedId, setSelectedId] = useState<string>("nats");
  const [panelEpoch, setPanelEpoch] = useState(0);
  const selected = findService(serviceTree, selectedId);
  const panel = PANELS.find((item) => item.id === selectedId);
  const ActivePanel = panel?.Component;

  useEffect(() => {
    document.getElementById("boot")?.remove();
  }, []);

  return (
    <NotificationsProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-brand">
            TrB<span>.</span>
          </div>
          <p className="sidebar-caption">Микросервисы</p>
          <ServiceTree nodes={serviceTree} selectedId={selectedId} onSelect={setSelectedId} />
        </aside>

        <main className="content">
          <PanelErrorBoundary
            key={`${selectedId}:${panelEpoch}`}
            onRetry={() => setPanelEpoch((n) => n + 1)}
          >
            {ActivePanel && panel ? (
              <Suspense fallback={<PanelFallback eyebrow={panel.eyebrow} title={panel.title} />}>
                <ActivePanel />
              </Suspense>
            ) : (
              <section className="panel">
                <p className="eyebrow">Сервис</p>
                <h1>{selected?.label ?? "Не выбран"}</h1>
                <p>{selected?.description ?? "Выберите микросервис в дереве слева."}</p>
              </section>
            )}
          </PanelErrorBoundary>
        </main>
      </div>
    </NotificationsProvider>
  );
}
