import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Иконка ⓘ с всплывающей подсказкой.
 * Подсказка рендерится порталом в document.body с position: fixed и координатами
 * из getBoundingClientRect якоря — иначе она обрезается ближайшим предком с
 * overflow: hidden/auto (модалка, прокручиваемый список индикаторов и т.п.) и
 * фактически становится не видна при наведении.
 */
export function InfoTip({ text, below = false }: { text: string; below?: boolean }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (!text) return null;

  const show = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: below ? r.bottom + 6 : r.top - 6,
      left: r.left + r.width / 2,
    });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={anchorRef}
      className="infotip"
      tabIndex={0}
      role="note"
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-hidden="true">ⓘ</span>
      {pos
        ? createPortal(
            <span
              className={`infotip-pop${below ? " infotip-pop--below" : ""}`}
              style={{ top: pos.top, left: pos.left }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

/** Подпись поля с иконкой-подсказкой справа. */
export function FieldLabel({
  children,
  desc,
  below,
}: {
  children: ReactNode;
  desc?: string;
  below?: boolean;
}) {
  return (
    <span className="field-label-with-tip">
      {children}
      {desc ? <InfoTip text={desc} below={below} /> : null}
    </span>
  );
}
