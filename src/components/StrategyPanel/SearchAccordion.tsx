// Сворачиваемая секция формы «Поиск 2.0» — не строгий wizard (все секции
// доступны и независимо переключаются), а способ спрятать то, что сейчас не
// редактируется, среди ~13 блоков настроек. Открытость каждой секции
// переживает перезагрузку страницы (localStorage), т.к. это чисто
// пользовательская раскладка, а не часть SearchFormState.

import { useState, type ReactNode } from "react";
import { InfoTip } from "./InfoTip";

function loadOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const v = window.localStorage.getItem(`search2.section.${id}`);
    return v == null ? defaultOpen : v === "1";
  } catch {
    return defaultOpen;
  }
}

function saveOpen(id: string, open: boolean) {
  try {
    window.localStorage.setItem(`search2.section.${id}`, open ? "1" : "0");
  } catch {
    // приватный режим/квота — просто не персистим
  }
}

export function SearchSection({
  id,
  title,
  info,
  badgeCount = 0,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  info?: string;
  badgeCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => loadOpen(id, defaultOpen));

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      saveOpen(id, next);
      return next;
    });
  };

  return (
    <div className={`search-section search-accordion-section${open ? "" : " is-collapsed"}`} id={`search-section-${id}`}>
      <button type="button" className="search-accordion-head" onClick={toggle} aria-expanded={open}>
        <span className="search-accordion-arrow" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="search-section-title-text">{title}</span>
        {info ? <InfoTip text={info} /> : null}
        {badgeCount > 0 ? <span className="search-accordion-badge">{badgeCount}</span> : null}
      </button>
      {open ? <div className="search-accordion-body">{children}</div> : null}
    </div>
  );
}

export function openSearchSection(id: string) {
  saveOpen(id, true);
  const el = document.getElementById(`search-section-${id}`);
  if (el?.classList.contains("is-collapsed")) {
    el.querySelector<HTMLButtonElement>(".search-accordion-head")?.click();
  }
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
