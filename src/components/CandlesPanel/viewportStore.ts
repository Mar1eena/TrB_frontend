import {
  fetchHistoricCandles,
  intervalMeta,
  pageSizeForVisible,
  prefetchForVisible,
  type CandleBar,
} from "../../api/tinvest/candles";

export type HistoryMeta = {
  firstLoad: boolean;
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
const HISTORY_FROM_SEC = Date.UTC(1971, 0, 2) / 1000;

type PageDir = "left" | "right";

export class CandleViewportStore {
  private bars = new Map<number, CandleBar>();
  private instrumentId = "";
  private interval = 1;
  private gen = 0;
  private visibleCount = 80;
  private historyReady = false;
  private timer: number | null = null;
  private leftBusy = false;
  private rightBusy = false;
  private leftExhausted = false;
  private rightExhausted = false;
  private leftFailUntil = 0;
  private rightFailUntil = 0;
  private destroyed = false;

  private readonly cb: StoreCallbacks;

  constructor(cb: StoreCallbacks) {
    this.cb = cb;
  }

  reset(instrumentId: string, interval: number): void {
    this.gen += 1;
    this.instrumentId = instrumentId;
    this.interval = interval;
    this.bars.clear();
    this.historyReady = false;
    this.leftBusy = false;
    this.rightBusy = false;
    this.leftExhausted = false;
    this.rightExhausted = false;
    this.leftFailUntil = 0;
    this.rightFailUntil = 0;
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
    return [...this.bars.values()].sort((a, b) => (a.time as number) - (b.time as number));
  }

  lastBar(): CandleBar | null {
    let last: CandleBar | null = null;
    for (const bar of this.bars.values()) {
      if (!last || (bar.time as number) > (last.time as number)) last = bar;
    }
    return last;
  }

  applyLive(bar: CandleBar): CandleBar | null {
    const t = bar.time as number;
    const prev = this.bars.get(t);
    const next: CandleBar = { ...bar, live: true };
    this.bars.set(t, next);
    if (!this.historyReady) return null;
    if (prev && !prev.live) {
      let lastTime = t;
      for (const time of this.bars.keys()) {
        if (time > lastTime) lastTime = time;
      }
      if (t < lastTime) return null;
    }
    return next;
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
    const gen = this.gen;
    const bars = this.getSorted();
    if (bars.length === 0) {
      await this.fetchPage("left", gen, true);
      return;
    }
    const fromIdx = range?.from ?? 0;
    const toIdx = range?.to ?? bars.length - 1;
    this.visibleCount = Math.max(1, Math.ceil(toIdx - fromIdx));
    const n = bars.length;
    const leftRemain = fromIdx;
    const rightRemain = n - 1 - toIdx;
    const now = Date.now();
    const prefetch = this.prefetch();

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
    const min = this.minTime();
    const max = this.maxTime();
    const limit = this.pageLimit();
    let fromSec: number;
    let toSec: number;
    let newestFirst: boolean;

    if (dir === "left") {
      newestFirst = true;
      fromSec = HISTORY_FROM_SEC;
      toSec = min != null ? min - 1 : nowSec + 60;
    } else {
      newestFirst = false;
      fromSec = max != null ? max + 1 : nowSec - limit * step;
      toSec = nowSec + 60;
      if (max != null && max >= nowSec - step) {
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
        const existing = this.bars.get(t);
        if (existing?.live) continue;
        if (!existing) added += 1;
        this.bars.set(t, bar);
      }

      if (fetched.length === 0 || added === 0 || fetched.length < limit) {
        if (dir === "left") this.leftExhausted = true;
        else this.rightExhausted = true;
      }

      if (firstLoad && this.maxTime() != null && (this.maxTime() as number) >= nowSec - step * 2) {
        this.rightExhausted = true;
      }

      if (!added && !firstLoad) return;

      this.historyReady = true;
      const bars = this.getSorted();
      const nextFirst = this.minTime();
      let prepended = 0;
      if (prevFirst != null && nextFirst != null && nextFirst < prevFirst) {
        for (const bar of bars) {
          if ((bar.time as number) < prevFirst) prepended += 1;
          else break;
        }
      }
      this.cb.onHistory(bars, {
        firstLoad: firstLoad || prevFirst == null,
        prepended,
        visibleCount: this.visibleCount,
      });
      if (firstLoad && bars.length === 0) {
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
