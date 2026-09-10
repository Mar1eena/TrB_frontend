// Стилизованные окна принятия решения вместо window.confirm / window.prompt.
// Внешний вид повторяет модалки панели стратегий (.strategy-modal).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useOverlayClose } from "../../hooks/useOverlayClose";

function useEscape(onCancel: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Продолжить",
  cancelLabel = "Отмена",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);
  const overlay = useOverlayClose(onCancel);
  return (
    <div className="strategy-modal-overlay" {...overlay}>
      <div
        className="strategy-modal strategy-confirm"
        role="alertdialog"
        aria-modal="true"
      >
        <header className="strategy-modal-head">
          <h2>{title}</h2>
          <button type="button" className="strategy-modal-close" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="strategy-confirm-msg">{message}</div>
        <footer className="strategy-modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === "danger" ? "danger" : "primary"}`}
            autoFocus
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  label,
  message,
  defaultValue = "",
  placeholder,
  confirmLabel = "Сохранить",
  cancelLabel = "Отмена",
  onSubmit,
  onCancel,
}: {
  title: string;
  label: string;
  message?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);
  useEscape(onCancel);
  const overlay = useOverlayClose(onCancel);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const v = value.trim();
    if (v) onSubmit(v);
  };

  return (
    <div className="strategy-modal-overlay" {...overlay}>
      <div
        className="strategy-modal strategy-confirm"
        role="dialog"
        aria-modal="true"
      >
        <header className="strategy-modal-head">
          <h2>{title}</h2>
          <button type="button" className="strategy-modal-close" onClick={onCancel}>
            ×
          </button>
        </header>
        {message ? <div className="strategy-confirm-msg">{message}</div> : null}
        <label className="filter-field">
          <span>{label}</span>
          <input
            ref={ref}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <footer className="strategy-modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn primary" disabled={!value.trim()} onClick={submit}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
