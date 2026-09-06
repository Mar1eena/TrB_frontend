import type { ReactNode } from "react";

/**
 * Иконка ⓘ с всплывающей подсказкой. Показ — CSS по :hover / :focus-within,
 * без порталов и зависимостей. Подсказка позиционируется относительно обёртки.
 */
export function InfoTip({ text, below = false }: { text: string; below?: boolean }) {
  if (!text) return null;
  return (
    <span className="infotip" tabIndex={0} role="note" aria-label={text}>
      <span aria-hidden="true">ⓘ</span>
      <span className={`infotip-pop${below ? " infotip-pop--below" : ""}`}>{text}</span>
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
