import { lazy, Suspense, useEffect, type ComponentType } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useParams,
  useRouteError,
} from "react-router-dom";
import ServiceTree from "./components/ServiceTree/ServiceTree";
import { findService, serviceTree } from "./data/services";
import { NotificationsProvider } from "./notifications";
import { useUiStore } from "./stores/ui";
import "./App.css";

const InstrumentsPanel = lazy(() => import("./components/InstrumentsPanel/InstrumentsPanel"));
const CandlesPanel = lazy(() => import("./components/CandlesPanel/CandlesPanel"));
const SchedulerPanel = lazy(() => import("./components/SchedulerPanel/SchedulerPanel"));
const DownloadHistoryPanel = lazy(() => import("./components/DownloadHistoryPanel/DownloadHistoryPanel"));
const NatsAdminPanel = lazy(() => import("./components/NatsAdminPanel/NatsAdminPanel"));
const ClickHouseManagerPanel = lazy(() => import("./components/ClickHouseManagerPanel/ClickHouseManagerPanel"));
const PostgresManagerPanel = lazy(() => import("./components/PostgresManagerPanel/PostgresManagerPanel"));
const StrategyPanel = lazy(() => import("./components/StrategyPanel/StrategyPanel"));

type PanelSpec = { eyebrow: string; title: string; Component: ComponentType };

const PANELS: Record<string, PanelSpec> = {
  instruments: { eyebrow: "Сервисы", title: "Инструменты", Component: InstrumentsPanel },
  candles: { eyebrow: "Сервисы", title: "Свечи", Component: CandlesPanel },
  historicCandle_scheduler: { eyebrow: "Сервисы", title: "Планировщик свечей", Component: SchedulerPanel },
  strategy: { eyebrow: "Сервисы", title: "Стратегии", Component: StrategyPanel },
  downloadHistory: { eyebrow: "История", title: "История загрузок", Component: DownloadHistoryPanel },
  nats: { eyebrow: "Админка / API", title: "Админка NATS", Component: NatsAdminPanel },
  clickhouse: { eyebrow: "Админка / API", title: "ClickHouse", Component: ClickHouseManagerPanel },
  postgresql: { eyebrow: "Админка / API", title: "PostgreSQL", Component: PostgresManagerPanel },
};

const DEFAULT_PANEL = "nats";

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

function PanelRoute() {
  const { panelId = "" } = useParams();
  const panel = PANELS[panelId];
  const service = findService(serviceTree, panelId);

  if (!panel) {
    return (
      <section className="panel">
        <p className="eyebrow">Сервис</p>
        <h1>{service?.label ?? "Не выбран"}</h1>
        <p>{service?.description ?? "Выберите микросервис в дереве слева."}</p>
      </section>
    );
  }

  const { Component, eyebrow, title } = panel;
  return (
    <Suspense fallback={<PanelFallback eyebrow={eyebrow} title={title} />}>
      <Component />
    </Suspense>
  );
}

function PanelErrorRoute() {
  const error = useRouteError() as Error | undefined;
  return (
    <section className="panel-page">
      <header className="scheduler-header">
        <p className="eyebrow">Ошибка</p>
        <h1>Панель не загрузилась</h1>
        <p>{error?.message ?? "Неизвестная ошибка"}</p>
        <p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </p>
      </header>
    </section>
  );
}

function Layout() {
  const { panelId } = useParams();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  useEffect(() => {
    document.getElementById("boot")?.remove();
  }, []);

  return (
    <div className={`layout${collapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${collapsed ? " is-collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            {collapsed ? (
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
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Показать панель" : "Скрыть панель"}
            title={collapsed ? "Показать названия" : "Скрыть названия"}
            onClick={toggleSidebar}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        {collapsed ? null : <p className="sidebar-caption">Микросервисы</p>}
        <ServiceTree nodes={serviceTree} selectedId={panelId ?? null} collapsed={collapsed} />
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to={`/${DEFAULT_PANEL}`} replace /> },
      { path: ":panelId", element: <PanelRoute />, errorElement: <PanelErrorRoute /> },
    ],
  },
  { path: "*", element: <Navigate to={`/${DEFAULT_PANEL}`} replace /> },
]);

export default function App() {
  return (
    <NotificationsProvider>
      <RouterProvider router={router} />
    </NotificationsProvider>
  );
}
