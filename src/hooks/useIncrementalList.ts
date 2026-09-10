import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Постраничная загрузка больших таблиц с сервера с кешем страниц.
 *
 * - Размер страницы выводится из числа видимых строк: `visible * 1.5`
 *   (правило «показано 100 → держим ~150»), фиксируется на время одного набора
 *   фильтров/сортировки и пересчитывается при их смене.
 * - Загруженные страницы остаются в `Map` (кеш): при обратной прокрутке строки
 *   возвращаются мгновенно, без повторного запроса. Мягкий предел `MAX_PAGES`
 *   с вытеснением самых далёких от текущего окна страниц.
 * - Фильтры/сортировка уходят на сервер; их смена сбрасывает кеш и `total`.
 */

export type PageParams = {
  offset: number;
  limit: number;
  sortBy?: string;
  sortDesc?: boolean;
  fieldFilters?: Record<string, string>;
  extra?: Record<string, string | number>;
};

export type PageResult<Row> = { rows: Row[]; total: number };

export type IncrementalListArgs<Row> = {
  fetchPage: (p: PageParams) => Promise<PageResult<Row>>;
  sortBy?: string;
  sortDesc?: boolean;
  /** Подстрочные фильтры по колонкам — пустые значения игнорируются. */
  fieldFilters?: Record<string, string>;
  /** Прочие точные фильтры (например intervalFilter). */
  extra?: Record<string, string | number>;
  /** false — не грузить (панель не готова). */
  enabled?: boolean;
};

export type IncrementalList<Row> = {
  /** Полное число строк под фильтром (0 пока не загружена первая страница). */
  total: number;
  /** Строка по абсолютному индексу; undefined — ещё не в кеше (рисуем скелетон). */
  rowAt: (index: number) => Row | undefined;
  /** Сообщить хук о видимом диапазоне из виртуализатора. */
  setVisibleRange: (startIndex: number, endIndex: number) => void;
  loading: boolean;
  error: string | null;
  /** Принудительно сбросить кеш и перезагрузить. */
  reload: () => void;
};

const MIN_PAGE = 60;
const MAX_PAGE = 400;
const MAX_PAGES = 60;
const DEBOUNCE_MS = 100;
const MAX_CONCURRENT = 3;

function nonEmpty(filters?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      const t = v.trim();
      if (t) out[k] = t;
    }
  }
  return out;
}

export function useIncrementalList<Row>({
  fetchPage,
  sortBy,
  sortDesc,
  fieldFilters,
  extra,
  enabled = true,
}: IncrementalListArgs<Row>): IncrementalList<Row> {
  const cleanFilters = useMemo(() => nonEmpty(fieldFilters), [fieldFilters]);
  const depsKey = useMemo(
    () => JSON.stringify([sortBy ?? "", sortDesc ?? false, cleanFilters, extra ?? {}]),
    [sortBy, sortDesc, cleanFilters, extra],
  );

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const paramsRef = useRef({ sortBy, sortDesc, cleanFilters, extra });
  paramsRef.current = { sortBy, sortDesc, cleanFilters, extra };
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const pagesRef = useRef(new Map<number, Row[]>());
  const pageOrderRef = useRef<number[]>([]);
  const inflightRef = useRef(new Set<number>());
  const pageSizeRef = useRef(0);
  const genRef = useRef(0);
  const totalRef = useRef(0);
  const rangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<() => void>(() => {});

  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const bump = useCallback(() => forceRender((n) => n + 1), []);

  // Основной цикл: держит в кеше страницы, покрывающие видимое окно + буфер 0.5×.
  const runFetches = useCallback(() => {
    if (!enabledRef.current) return;
    const { start, end } = rangeRef.current;
    const visible = Math.max(1, end - start);

    // Размер страницы фиксируем от первого видимого окна: visible * 1.5
    // (правило «показано 100 → держим ~150»). Держится до смены фильтров.
    if (pageSizeRef.current <= 0) {
      pageSizeRef.current = Math.min(
        MAX_PAGE,
        Math.max(MIN_PAGE, Math.round(visible * 1.5)),
      );
    }
    const size = pageSizeRef.current;

    const buffer = Math.ceil(visible * 0.5);
    const lo = Math.max(0, start - buffer);
    let hi = end + buffer;
    if (totalRef.current > 0) hi = Math.min(hi, totalRef.current - 1);

    const wanted = new Set<number>([0]); // страница 0 нужна всегда — узнать total
    for (let p = Math.floor(lo / size); p <= Math.floor(Math.max(lo, hi) / size); p += 1) {
      wanted.add(p);
    }

    for (const pageNo of wanted) {
      if (pagesRef.current.has(pageNo) || inflightRef.current.has(pageNo)) continue;
      if (inflightRef.current.size >= MAX_CONCURRENT) break;
      void fetchOne(pageNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  tickRef.current = runFetches;

  const schedule = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      tickRef.current();
    }, DEBOUNCE_MS);
  }, []);

  const evictIfNeeded = useCallback(() => {
    const pages = pagesRef.current;
    if (pages.size <= MAX_PAGES) return;
    const size = pageSizeRef.current || 1;
    const lo = Math.floor(rangeRef.current.start / size);
    const hi = Math.floor(rangeRef.current.end / size);
    const center = (lo + hi) / 2;
    const order = pageOrderRef.current
      .slice()
      .sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    for (const victim of order) {
      if (pages.size <= MAX_PAGES) break;
      if (victim >= lo - 1 && victim <= hi + 1) continue;
      pages.delete(victim);
      pageOrderRef.current = pageOrderRef.current.filter((p) => p !== victim);
    }
  }, []);

  const fetchOne = useCallback(
    async (pageNo: number) => {
      const gen = genRef.current;
      const size = pageSizeRef.current;
      if (size <= 0) return;
      if (pagesRef.current.has(pageNo) || inflightRef.current.has(pageNo)) return;
      inflightRef.current.add(pageNo);
      bump();
      try {
        const p = paramsRef.current;
        const res = await fetchRef.current({
          offset: pageNo * size,
          limit: size,
          sortBy: p.sortBy,
          sortDesc: p.sortDesc,
          fieldFilters: p.cleanFilters,
          extra: p.extra,
        });
        if (gen !== genRef.current) return;
        pagesRef.current.set(pageNo, res.rows);
        pageOrderRef.current.push(pageNo);
        totalRef.current = res.total;
        setTotal(res.total);
        setError(null);
        evictIfNeeded();
      } catch (err) {
        if (gen !== genRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        inflightRef.current.delete(pageNo);
        bump();
        tickRef.current(); // добрать очередь после освобождения слота
      }
    },
    [bump, evictIfNeeded],
  );

  const resetCache = useCallback(() => {
    genRef.current += 1;
    pagesRef.current.clear();
    pageOrderRef.current = [];
    inflightRef.current.clear();
    pageSizeRef.current = 0;
    totalRef.current = 0;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setTotal(0);
    setError(null);
    bump();
  }, [bump]);

  // Смена фильтров/сортировки/enabled — сброс кеша и перезапрос текущего окна.
  useEffect(() => {
    resetCache();
    if (!enabled) return;
    const id = window.setTimeout(() => tickRef.current(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, enabled]);

  const setVisibleRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const prev = rangeRef.current;
      if (prev.start === startIndex && prev.end === endIndex) return;
      rangeRef.current = { start: startIndex, end: endIndex };
      schedule();
    },
    [schedule],
  );

  const rowAt = useCallback((index: number): Row | undefined => {
    const size = pageSizeRef.current;
    if (size <= 0) return undefined;
    const page = pagesRef.current.get(Math.floor(index / size));
    return page?.[index % size];
  }, []);

  const reload = useCallback(() => {
    resetCache();
    if (enabledRef.current) window.setTimeout(() => tickRef.current(), 0);
  }, [resetCache]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      genRef.current += 1;
    };
  }, []);

  const loading = inflightRef.current.size > 0;

  return { total, rowAt, setVisibleRange, loading, error, reload };
}
