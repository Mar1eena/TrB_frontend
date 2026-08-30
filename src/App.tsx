import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import ServiceTree from "./components/ServiceTree/ServiceTree";
import { findService, serviceTree } from "./data/services";
import { NotificationsProvider } from "./notifications";
import "./App.css";

const InstrumentsPanel = lazy(() => import("./components/InstrumentsPanel/InstrumentsPanel"));
const CandlesPanel = lazy(() => import("./components/CandlesPanel/CandlesPanel"));
const SchedulerPanel = lazy(() => import("./components/SchedulerPanel/SchedulerPanel"));
const DownloadHistoryPanel = lazy(() => import("./components/DownloadHistoryPanel/DownloadHistoryPanel"));
const NatsAdminPanel = lazy(() => import("./components/NatsAdminPanel/NatsAdminPanel"));
const ClickHouseManagerPanel = lazy(() => import("./components/ClickHouseManagerPanel/ClickHouseManagerPanel"));
const PostgresManagerPanel = lazy(() => import("./components/PostgresManagerPanel/PostgresManagerPanel"));

type PanelSpec = {
  id: string;
  eyebrow: string;
  title: string;
  Component: ComponentType;
};

const PANELS: PanelSpec[] = [
  { id: "instruments", eyebrow: "Сервисы", title: "Инструменты", Component: InstrumentsPanel },
  { id: "candles", eyebrow: "Сервисы", title: "Свечи", Component: CandlesPanel },
  { id: "historicCandle_scheduler", eyebrow: "Сервисы", title: "Планировщик свечей", Component: SchedulerPanel },
  { id: "downloadHistory", eyebrow: "История", title: "История загрузок", Component: DownloadHistoryPanel },
  { id: "nats", eyebrow: "Админка / API", title: "Админка NATS", Component: NatsAdminPanel },
  { id: "clickhouse", eyebrow: "Админка / API", title: "ClickHouse", Component: ClickHouseManagerPanel },
  { id: "postgresql", eyebrow: "Админка / API", title: "PostgreSQL", Component: PostgresManagerPanel },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("trb.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const selected = findService(serviceTree, selectedId);
  const panel = PANELS.find((item) => item.id === selectedId);
  const ActivePanel = panel?.Component;

  useEffect(() => {
    document.getElementById("boot")?.remove();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("trb.sidebar.collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  return (
    <NotificationsProvider>
      <div className={`layout${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
        <aside className={`sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}>
          <div className="sidebar-top">
            <div className="sidebar-brand">
              {sidebarCollapsed ? (
                <>
                  T<span>.</span>
                </>
              ) : (
                <>
                  TrB<span>.</span>
                </>
              )}
            </div>
            <button
              type="button"
              className="sidebar-toggle"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Показать панель" : "Скрыть панель"}
              title={sidebarCollapsed ? "Показать названия" : "Скрыть названия"}
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
          {sidebarCollapsed ? null : <p className="sidebar-caption">Микросервисы</p>}
          <ServiceTree
            nodes={serviceTree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            collapsed={sidebarCollapsed}
          />
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
