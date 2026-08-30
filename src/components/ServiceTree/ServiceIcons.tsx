import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function InstrumentsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

function CandlesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 4v3M6 17v3M12 3v4M12 16v5M18 6v3M18 18v2" />
      <rect x="4" y="7" width="4" height="10" rx="0.6" />
      <rect x="10" y="7" width="4" height="9" rx="0.6" />
      <rect x="16" y="9" width="4" height="9" rx="0.6" />
    </Svg>
  );
}

function HistoryIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

function SchedulerIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </Svg>
  );
}

function NatsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 12h4l2-6 4 12 2-6h4" />
    </Svg>
  );
}

function ClickHouseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </Svg>
  );
}

function PostgresIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 20c4.4 0 7-2.2 7-6.5 0-5-3-9.5-7-9.5S5 8.5 5 13.5C5 17.8 7.6 20 12 20Z" />
      <path d="M9 13.5c.4 2 1.4 3.5 3 3.5s2.6-1.5 3-3.5" />
    </Svg>
  );
}

function GroupIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="5" width="7" height="6" rx="1.2" />
      <rect x="13" y="5" width="7" height="6" rx="1.2" />
      <rect x="8.5" y="13" width="7" height="6" rx="1.2" />
    </Svg>
  );
}

const ICONS: Record<string, (props: IconProps) => ReactNode> = {
  instruments: InstrumentsIcon,
  candles: CandlesIcon,
  downloadHistory: HistoryIcon,
  historicCandle_scheduler: SchedulerIcon,
  nats: NatsIcon,
  clickhouse: ClickHouseIcon,
  postgresql: PostgresIcon,
  workers: GroupIcon,
  admin: GroupIcon,
};

export function ServiceIcon({ id, className }: { id: string; className?: string }) {
  const Icon = ICONS[id] ?? GroupIcon;
  return <Icon className={className} />;
}
