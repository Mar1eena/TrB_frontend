import {
  fetchHistoricCandles,
  intervalMeta,
  MAX_RENDERED_CANDLES,
  pageSizeForVisible,
  prefetchForVisible,
  type CandleBar,
} from "../../api/tinvest/candles";

export type HistoryMeta = {
  firstLoad: boolean;
  /** Сдвиг видимого логического диапазона в барах (может быть отрицательным). */
  prepended: number;
  visibleCount: number;
};

export type LogicalRangeLike = {
  from: number;
  to: number;
};

type StoreCallbacks = {
  onHistory: (bars: CandleBar[], meta: HistoryMeta) => void;
  onLoading: (loading: boolean) => void;
  onError: (err: Error) => void;
};

const DEBOUNCE_MS = 80;
const FAIL_COOLDOWN_MS = 15_000;
/** Игнор авто-prefetch после первой отрисовки: график сам двигает range (setData / setVisibleLogicalRange). */
const INITIAL_SETTLE_MS = 400;
export const HISTORY_FROM_SEC = Date.UTC(1971, 0, 2) / 1000;

type PageDir = "left" | "right";

/** Границы окна истории: по умолчанию — вся история до «сейчас» (живой график). */
export type ViewportBounds = {
  /** Нижняя граница (сек, unix). По умолчанию HISTORY_FROM_SEC. */
  fromSec?: number;
  /** Верхняя граница (сек, unix). По умолчанию «сейчас». Нужна бэктесту, где
   * график не должен догружаться правее конца выбранного периода. */
  toSec?: number;
};

export class CandleViewportStore {
  private bars = new Map<number, CandleBar>();
  private instrumentId = "";
  private interval = 1;
  private boundsMin: number | null = null;
  private boundsMax: number | null = null;
  private gen = 0;
  private visibleCount = 80;
  private timer: number | null = null;
  private leftBusy = false;
  private rightBusy = false;
  private leftExhausted = false;
  private rightExhausted = false;
  private leftFailUntil = 0;
  private rightFailUntil = 0;
  private settleUntil = 0;
  private destroyed = false;

  // Кеш отсортированного массива (полный набор всех загруженных баров).
  private sortedCache: CandleBar[] | null = null;
  // Индекс (в полном наборе) первого бара, отданного в график, и длина окна.
  private renderStartIdx = 0;
  private renderedLen = 0;
  private lastRange: LogicalRangeLike | null = null;

  private readonly cb: StoreCallbacks;

  constructor(cb: StoreCallbacks) {
    this.cb = cb;
  }

  reset(instrumentId: string, interval: number, bounds?: ViewportBounds): void {
    this.gen += 1;
    this.instrumentId = instrumentId;
    this.interval = interval;
    this.boundsMin = bounds?.fromSec ?? null;
    this.boundsMax = bounds?.toSec ?? null;
    this.bars.clear();
    this.sortedCache = null;
    this.renderStartIdx = 0;
    this.renderedLen = 0;
    this.lastRange = null;
    this.leftBusy = false;
    this.rightBusy = false;
    this.leftExhausted = false;
    this.rightExhausted = false;
    this.leftFailUntil = 0;
    this.rightFailUntil = 0;
    this.settleUntil = 0;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.reset("", 1);
  }

  getSorted(): CandleBar[] {
    if (!this.sortedCache) {
      this.sortedCache = [...this.bars.values()].sort(
        (a, b) => (a.time as number) - (b.time as number),
      );
    }
    return this.sortedCache;
  }

  /**
   * Собирает набор для отрисовки: если полный кеш больше MAX_RENDERED_CANDLES —
   * окно вокруг `centerFullIdx`, иначе весь набор. Возвращает сдвиг видимого
   * логического диапазона (в барах), нужный чтобы график остался на тех же свечах.
   */
  private buildEmit(centerFullIdx: number): { bars: CandleBar[]; shift: number } {
    const all = this.getSorted();
    const n = all.length;
    const prevStart = this.renderStartIdx;
    if (n <= MAX_RENDERED_CANDLES) {
      this.renderStartIdx = 0;
      this.renderedLen = n;
      return { bars: all, shift: prevStart };
    }
    const half = Math.floor(MAX_RENDERED_CANDLES / 2);
    const lo = Math.max(0, Math.min(centerFullIdx - half, n - MAX_RENDERED_CANDLES));
    const slice = all.slice(lo, lo + MAX_RENDERED_CANDLES);
    this.renderStartIdx = lo;
    this.renderedLen = slice.length;
    return { bars: slice, shift: prevStart - lo };
  }

  /** Центр видимого окна в индексах полного набора (учёт сдвига окна). */
  private visibleCenterFullIdx(prependedToFull = 0): number {
    const r = this.lastRange;
    const mid = r
      ? (r.from + r.to) / 2
      : Math.max(0, this.renderedLen - 1 - this.visibleCount / 2);
    return Math.round(this.renderStartIdx + prependedToFull + mid);
  }

  lastBar(): CandleBar | null {
    let last: CandleBar | null = null;
    for (const bar of this.bars.values()) {
      if (!last || (bar.time as number) > (last.time as number)) last = bar;
    }
    return last;
  }

  async loadInitial(visibleCount: number): Promise<void> {
    if (!this.instrumentId) return;
    this.visibleCount = Math.max(20, Math.floor(visibleCount));
    await this.fetchPage("left", this.gen, true);
  }

  requestVisible(range: LogicalRangeLike | null): void {
    if (!this.instrumentId || this.destroyed) return;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.ensureVisible(range);
    }, DEBOUNCE_MS);
  }

  private pageLimit(): number {
    return pageSizeForVisible(this.visibleCount);
  }

  private prefetch(): number {
    return prefetchForVisible(this.visibleCount);
  }

  private async ensureVisible(range: LogicalRangeLike | null): Promise<void> {
    if (!this.instrumentId || this.destroyed) return;
    if (this.bars.size === 0) return;
    if (Date.now() < this.settleUntil) return;
    const gen = this.gen;
    const bars = this.getSorted();
    this.lastRange = range;
    const n = bars.length;
    // range приходит в логических индексах отрисованного окна — переводим в
    // индексы полного набора (учёт сдвига окна renderStartIdx).
    const winFrom = range?.from ?? 0;
    const winTo = range?.to ?? this.renderedLen - 1;
    const fromIdx = this.renderStartIdx + winFrom;
    const toIdx = this.renderStartIdx + winTo;
    this.visibleCount = Math.max(1, Math.ceil(winTo - winFrom));
    const leftRemain = Math.max(0, fromIdx);
    const rightRemain = Math.max(0, n - 1 - toIdx);
    const now = Date.now();
    const prefetch = this.prefetch();

    // Прокрутка внутри уже загруженных данных, но к краю отрисованного окна —
    // переотдаём окно из кеша (без запроса, без спиннера).
    if (n > MAX_RENDERED_CANDLES) {
      const nearWinLeft = this.renderStartIdx > 0 && winFrom <= prefetch;
      const nearWinRight =
        this.renderStartIdx + this.renderedLen < n &&
        this.renderedLen - 1 - winTo <= prefetch;
      if (nearWinLeft || nearWinRight) {
        const emit = this.buildEmit(this.visibleCenterFullIdx());
        if (emit.shift !== 0 || emit.bars.length !== this.renderedLen) {
          this.cb.onHistory(emit.bars, {
            firstLoad: false,
            prepended: emit.shift,
            visibleCount: this.visibleCount,
          });
        }
      }
    }

    if (leftRemain <= prefetch && !this.leftBusy && !this.leftExhausted && now >= this.leftFailUntil) {
      await this.fetchPage("left", gen, false);
      return;
    }
    if (
      rightRemain <= prefetch &&
      !this.rightBusy &&
      !this.rightExhausted &&
      now >= this.rightFailUntil
    ) {
      await this.fetchPage("right", gen, false);
    }
  }

  private async fetchPage(dir: PageDir, gen: number, firstLoad: boolean): Promise<void> {
    if (!this.instrumentId || this.destroyed || gen !== this.gen) return;
    if (dir === "left") {
      if (this.leftBusy || this.leftExhausted) return;
      this.leftBusy = true;
    } else {
      if (this.rightBusy || this.rightExhausted) return;
      this.rightBusy = true;
    }
    this.cb.onLoading(true);

    const step = intervalMeta(this.interval).seconds;
    const nowSec = Date.now() / 1000;
    const minBound = this.boundsMin ?? HISTORY_FROM_SEC;
    const maxBound = this.boundsMax ?? nowSec + 60;
    const min = this.minTime();
    const max = this.maxTime();
    const limit = this.pageLimit();
    let fromSec: number;
    let toSec: number;
    let newestFirst: boolean;

    if (dir === "left") {
      newestFirst = true;
      fromSec = minBound;
      toSec = min != null ? min - 1 : maxBound;
    } else {
      newestFirst = false;
      fromSec = max != null ? max + 1 : Math.max(minBound, maxBound - limit * step);
      toSec = maxBound;
      if (max != null && max >= maxBound - step) {
        this.rightExhausted = true;
        this.rightBusy = false;
        if (!this.leftBusy) this.cb.onLoading(false);
        return;
      }
    }

    const prevFirst = this.minTime();
    try {
      const fetched = await fetchHistoricCandles({
        instrumentId: this.instrumentId,
        interval: this.interval,
        fromSec,
        toSec,
        limit,
        newestFirst,
      });
      if (gen !== this.gen || this.destroyed) return;

      let added = 0;
      for (const bar of fetched) {
        const t = bar.time as number;
        if (!this.bars.has(t)) added += 1;
        this.bars.set(t, bar);
      }
      if (added > 0) this.sortedCache = null;

      if (fetched.length === 0 || added === 0 || fetched.length < limit) {
        if (dir === "left") this.leftExhausted = true;
        else this.rightExhausted = true;
      }

      if (firstLoad && this.maxTime() != null && (this.maxTime() as number) >= maxBound - step * 2) {
        this.rightExhausted = true;
      }

      if (!added && !firstLoad) return;

      const bars = this.getSorted();
      const nextFirst = this.minTime();
      let prependedToFull = 0;
      if (prevFirst != null && nextFirst != null && nextFirst < prevFirst) {
        for (const bar of bars) {
          if ((bar.time as number) < prevFirst) prependedToFull += 1;
          else break;
        }
      }
      const wasFirst = firstLoad || prevFirst == null;
      if (wasFirst) {
        this.settleUntil = Date.now() + INITIAL_SETTLE_MS;
      }
      // Отдаём окно вокруг видимого диапазона; полный набор остаётся в кеше.
      const emit = wasFirst
        ? this.buildEmit(bars.length - 1)
        : this.buildEmit(this.visibleCenterFullIdx(prependedToFull));
      const shift = wasFirst ? prependedToFull : emit.shift + prependedToFull;
      this.cb.onHistory(emit.bars, {
        firstLoad: wasFirst,
        prepended: shift,
        visibleCount: this.visibleCount,
      });
      if (firstLoad && emit.bars.length === 0) {
        this.cb.onError(new Error("Нет свечей за выбранный период"));
      }
    } catch (err) {
      if (dir === "left") this.leftFailUntil = Date.now() + FAIL_COOLDOWN_MS;
      else this.rightFailUntil = Date.now() + FAIL_COOLDOWN_MS;
      this.cb.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (dir === "left") this.leftBusy = false;
      else this.rightBusy = false;
      if (gen === this.gen && !this.destroyed && !this.leftBusy && !this.rightBusy) {
        this.cb.onLoading(false);
      }
    }
  }

  private minTime(): number | null {
    let min: number | null = null;
    for (const time of this.bars.keys()) {
      if (min == null || time < min) min = time;
    }
    return min;
  }

  private maxTime(): number | null {
    let max: number | null = null;
    for (const time of this.bars.keys()) {
      if (max == null || time > max) max = time;
    }
    return max;
  }
}
