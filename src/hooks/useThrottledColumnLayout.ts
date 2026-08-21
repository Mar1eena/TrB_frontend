import { useEffect, type RefObject } from "react";

type ColumnApplier = (el: HTMLElement) => void;

/** ResizeObserver coalesced to one rAF — avoids layout thrash while dragging the window. */
export function useThrottledColumnLayout(
  ref: RefObject<HTMLElement | null>,
  apply: ColumnApplier,
  deps: unknown[],
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const run = () => {
      frame = 0;
      apply(el);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(run);
    };

    run();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps explicitly
  }, deps);
}
