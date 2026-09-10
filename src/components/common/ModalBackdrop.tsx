import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

/**
 * Единая подложка модального окна поверх Radix Dialog.
 *
 * - Radix даёт focus-trap, возврат фокуса, блокировку прокрутки, Escape и портал.
 * - Content растянут на весь экран и играет роль флекс-контейнера (класс `className`
 *   сохраняет прежнюю вёрстку панелей: `*-modal-backdrop` / `strategy-modal-overlay`).
 * - Закрытие по клику на подложку срабатывает, только если кнопку мыши и нажали,
 *   и отпустили на самой подложке (drag-out из окна не закрывает).
 */
export function ModalBackdrop({
  onClose,
  className = "ch-modal-backdrop",
  disabled = false,
  title = "Диалог",
  children,
}: {
  onClose: () => void;
  className?: string;
  disabled?: boolean;
  /** Скрытый заголовок для скринридеров (у окна обычно есть свой видимый <h2>). */
  title?: string;
  children: ReactNode;
}) {
  const pressedOnBackdrop = useRef(false);

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next && !disabled) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          className={className}
          aria-describedby={undefined}
          onMouseDown={(e) => {
            pressedOnBackdrop.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            const hit = pressedOnBackdrop.current && e.target === e.currentTarget;
            pressedOnBackdrop.current = false;
            if (hit && !disabled) onClose();
          }}
        >
          <Dialog.Title
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {title}
          </Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
