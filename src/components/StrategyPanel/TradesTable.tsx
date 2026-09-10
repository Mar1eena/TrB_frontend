import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as api from "../../api/strategy";
import type { TradeRecord } from "../../api/strategy";

const ROW_HEIGHT = 31;

/**
 * Таблица сделок бэктеста с виртуализацией строк: в DOM только видимое окно,
 * поэтому открытие результата с десятками тысяч сделок не тормозит.
 */
export default function TradesTable({ trades }: { trades: TradeRecord[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items.length > 0 ? items[0].start : 0;
  const paddingBottom =
    items.length > 0 ? totalSize - items[items.length - 1].end : 0;

  return (
    <div className="table-scroll strategy-trades-scroll" ref={scrollRef}>
      <table className="strategy-table compact strategy-trades-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Напр.</th>
            <th>Вход</th>
            <th className="num">Цена</th>
            <th className="num" title="Цена входа × размер позиции">Сумма входа</th>
            <th>Выход</th>
            <th className="num">Цена</th>
            <th className="num" title="Цена выхода × размер позиции">Сумма выхода</th>
            <th className="num">Размер</th>
            <th className="num">P/L</th>
            <th className="num" title="Доходность сделки: P/L ÷ сумма входа">P/L %</th>
            <th className="num">Баров</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={12} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {items.map((vItem) => {
            const t = trades[vItem.index];
            const entryValue = t.entryPrice * t.size;
            const exitValue = t.exitPrice * t.size;
            const plPct =
              Number.isFinite(t.pnlPct) && Math.abs(t.pnlPct) <= 20
                ? t.pnlPct
                : entryValue
                  ? t.pnl / Math.abs(entryValue)
                  : NaN;
            return (
              <tr
                key={t.tradeId}
                className={`${t.pnl >= 0 ? "trade-win" : "trade-loss"} ${
                  vItem.index % 2 === 1 ? "is-alt" : ""
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                <td>{t.tradeId}</td>
                <td>{t.isLong ? "long" : "short"}</td>
                <td className="table-datetime">{api.fmtDateTime(t.entryTime)}</td>
                <td className="num">{api.num(t.entryPrice, 4)}</td>
                <td className="num">{api.num(entryValue)}</td>
                <td className="table-datetime">{api.fmtDateTime(t.exitTime)}</td>
                <td className="num">{api.num(t.exitPrice, 4)}</td>
                <td className="num">{api.num(exitValue)}</td>
                <td className="num">{api.num(t.size, 0)}</td>
                <td className="num">{api.num(t.pnl)}</td>
                <td className="num">{api.pct(plPct)}</td>
                <td className="num">{t.barsHeld}</td>
              </tr>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={12} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
