import { useCallback, useRef, type PointerEvent } from "react";

/**
 * Закрытие модального окна по клику на подложку.
 *
 * Окно закрывается ТОЛЬКО если нажатие ЛКМ и началось, и завершилось на самой
 * подложке одним и тем же указателем. Поэтому:
 *  - зажал ЛКМ внутри окна (выделение текста, драг графика/ползунка) и увёл
 *    курсор за пределы окна или отпустил на подложке — окно остаётся открытым;
 *  - нажал на подложку и увёл курсор в окно — тоже не закрывает.
 *
 * Решение принимается на pointerup по месту НАЖАТИЯ, без опоры на синтетический
 * `click` (который браузер может не сгенерировать после «дрэга»).
 */
export function useOverlayClose<T extends Element = HTMLDivElement>(onClose: () => void) {
  const pressPointerId = useRef<number | null>(null);

  const onPointerDown = useCallback((event: PointerEvent<T>) => {
    pressPointerId.current =
      event.button === 0 && event.target === event.currentTarget ? event.pointerId : null;
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<T>) => {
      const shouldClose =
        pressPointerId.current === event.pointerId && event.target === event.currentTarget;
      pressPointerId.current = null;
      if (shouldClose) onClose();
    },
    [onClose],
  );

  const onPointerCancel = useCallback(() => {
    pressPointerId.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
