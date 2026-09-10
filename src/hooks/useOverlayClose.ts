import { useCallback, useRef, type MouseEvent } from "react";

// Закрытие модалки по клику на подложку — но только если кнопку мыши
// и нажали, и отпустили на самой подложке. Если ЛКМ зажали внутри окна
// (выделение текста, драг ползунка) и увели курсор за пределы окна,
// окно остаётся открытым.
export function useOverlayClose<T extends Element = HTMLDivElement>(onClose: () => void) {
  const pressedOnOverlay = useRef(false);

  const onMouseDown = useCallback((event: MouseEvent<T>) => {
    pressedOnOverlay.current = event.target === event.currentTarget;
  }, []);

  const onClick = useCallback(
    (event: MouseEvent<T>) => {
      const hit = pressedOnOverlay.current && event.target === event.currentTarget;
      pressedOnOverlay.current = false;
      if (hit) onClose();
    },
    [onClose],
  );

  return { onMouseDown, onClick };
}
