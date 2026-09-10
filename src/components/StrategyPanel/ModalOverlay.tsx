import { useRef, type ReactNode } from "react";

/**
 * Подложка модального окна. Закрывает окно только когда клик и начат, и завершён
 * на самой подложке. Если зажать ЛКМ внутри окна (выделение текста, драг графика)
 * и увести курсор за пределы окна — окно НЕ закрывается.
 */
export function ModalOverlay({
  className = "strategy-modal-overlay",
  onClose,
  disabled = false,
  children,
}: {
  className?: string;
  onClose: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const pressedOnOverlay = useRef(false);

  return (
    <div
      className={className}
      onMouseDown={(e) => {
        pressedOnOverlay.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        const shouldClose = pressedOnOverlay.current && e.target === e.currentTarget;
        pressedOnOverlay.current = false;
        if (shouldClose && !disabled) onClose();
      }}
    >
      {children}
    </div>
  );
}
