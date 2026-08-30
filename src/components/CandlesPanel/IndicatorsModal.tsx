import { useEffect, useId, useState } from "react";
import {
  FALLBACK_INDICATORS,
  listSupportedIndicators,
  type IndicatorConfig,
  type IndicatorInfo,
} from "../../api/indicators";

const PALETTE = [
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#e11d48", // Rose
  "#eab308", // Yellow
  "#a855f7", // Violet
];

function defaultColorForType(type: number): string {
  switch (type) {
    case 1: // RSI
      return "#8b5cf6";
    case 2: // SMA
      return "#3b82f6";
    case 3: // EMA
      return "#f59e0b";
    case 4: // MACD
      return "#06b6d4";
    case 5: // BB
      return "#10b981";
    default:
      return PALETTE[type % PALETTE.length];
  }
}

export function isOscillator(type: number, name: string): boolean {
  const upper = name.toUpperCase();
  return type === 1 || upper === "RSI" || type === 4 || upper === "MACD";
}

interface IndicatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicators: IndicatorConfig[];
  initialEditId?: string | null;
  onAddIndicator: (config: IndicatorConfig) => void;
  onUpdateIndicator: (config: IndicatorConfig) => void;
  onRemoveIndicator: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

function configsEqual(a: IndicatorConfig, b: IndicatorConfig): boolean {
  return (
    a.type === b.type &&
    a.name === b.name &&
    a.color === b.color &&
    (a.lineWidth ?? 2) === (b.lineWidth ?? 2) &&
    a.persist === b.persist &&
    JSON.stringify(a.params) === JSON.stringify(b.params)
  );
}

export default function IndicatorsModal({
  isOpen,
  onClose,
  indicators,
  initialEditId,
  onAddIndicator,
  onUpdateIndicator,
  onRemoveIndicator,
  onToggleVisibility,
}: IndicatorsModalProps) {
  const titleId = useId();
  const [supported, setSupported] = useState<IndicatorInfo[]>(FALLBACK_INDICATORS);
  const [selectedType, setSelectedType] = useState<number>(FALLBACK_INDICATORS[0].type);
  const [params, setParams] = useState<Record<string, number>>({ period: 14 });
  const [color, setColor] = useState<string>(defaultColorForType(FALLBACK_INDICATORS[0].type));
  const [lineWidth, setLineWidth] = useState<number>(2);
  const [persist, setPersist] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listSupportedIndicators()
      .then((items) => {
        if (!cancelled && items.length > 0) {
          setSupported(items);
        }
      })
      .catch(() => {
        /* use fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSpec = supported.find((item) => item.type === selectedType) ?? supported[0];

  const applyFormFromIndicator = (ind: IndicatorConfig) => {
    setEditingId(ind.id);
    setSelectedType(ind.type);
    setParams({ ...ind.params });
    setColor(ind.color);
    setLineWidth(ind.lineWidth ?? 2);
    setPersist(ind.persist);
  };

  const handleSelectType = (type: number) => {
    const ofType = indicators.filter((item) => item.type === type);
    if (ofType.length === 1) {
      applyFormFromIndicator(ofType[0]);
      return;
    }
    setSelectedType(type);
    setEditingId(null);
    const spec = supported.find((item) => item.type === type);
    if (spec) {
      setParams({ ...spec.defaultParams });
      setColor(defaultColorForType(type));
      setLineWidth(2);
    }
  };

  const handleStartEdit = (ind: IndicatorConfig) => {
    applyFormFromIndicator(ind);
  };

  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      return;
    }
    if (initialEditId) {
      const ind = indicators.find((item) => item.id === initialEditId);
      if (ind) applyFormFromIndicator(ind);
      return;
    }
    const ofType = indicators.filter((item) => item.type === selectedType);
    if (ofType.length === 1) {
      applyFormFromIndicator(ofType[0]);
    }
    // Только при открытии модалки / выборе чипа — не сбрасывать форму на каждый live-apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialEditId]);

  useEffect(() => {
    if (!isOpen || !editingId) return;
    const existing = indicators.find((item) => item.id === editingId);
    const spec = supported.find((item) => item.type === selectedType);
    if (!existing || !spec) return;
    if (Object.values(params).some((value) => !Number.isFinite(value))) return;

    const next: IndicatorConfig = {
      ...existing,
      type: selectedType,
      name: spec.name,
      params: { ...params },
      color,
      lineWidth,
      persist,
    };
    if (configsEqual(existing, next)) return;

    const timer = window.setTimeout(() => {
      onUpdateIndicator(next);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [
    isOpen,
    editingId,
    selectedType,
    params,
    color,
    lineWidth,
    persist,
    indicators,
    supported,
    onUpdateIndicator,
  ]);

  const handleCancelEdit = () => {
    setEditingId(null);
    const spec = supported.find((item) => item.type === selectedType);
    if (spec) {
      setParams({ ...spec.defaultParams });
      setColor(defaultColorForType(selectedType));
    }
  };

  const handleSave = () => {
    if (editingId) {
      const existing = indicators.find((i) => i.id === editingId);
      if (existing) {
        onUpdateIndicator({
          ...existing,
          type: selectedType,
          name: activeSpec.name,
          params: { ...params },
          color,
          lineWidth,
          persist,
        });
      }
      setEditingId(null);
    } else {
      const newId = `${activeSpec.name.toLowerCase()}_${Date.now().toString(36)}`;
      onAddIndicator({
        id: newId,
        type: selectedType,
        name: activeSpec.name,
        params: { ...params },
        color,
        lineWidth,
        persist,
        visible: true,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box indicators-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId}>Индикаторы графика</h2>
            <p className="modal-subtitle">
              Расчёт TA-Lib на всей серии данных с сохранением в ClickHouse
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="indicators-modal-grid">
          {/* Левая колонка: выбор индикатора */}
          <div className="indicators-sidebar">
            <h3 className="section-title">Доступные индикаторы</h3>
            <div className="indicators-type-list">
              {supported.map((spec) => {
                const isSelected = spec.type === selectedType && !editingId;
                const countActive = indicators.filter((i) => i.type === spec.type).length;
                return (
                  <button
                    key={spec.type}
                    type="button"
                    className={`indicator-type-btn ${isSelected ? "is-active" : ""}`}
                    onClick={() => handleSelectType(spec.type)}
                  >
                    <span className="ind-name">{spec.name}</span>
                    {countActive > 0 ? (
                      <span className="ind-count-badge" title={`Добавлено: ${countActive}`}>
                        {countActive}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {indicators.length > 0 ? (
              <div className="indicators-active-section">
                <h3 className="section-title">Активные на графике ({indicators.length})</h3>
                <div className="indicators-active-list">
                  {indicators.map((ind) => (
                    <div
                      key={ind.id}
                      role="button"
                      tabIndex={0}
                      className={`active-indicator-item ${editingId === ind.id ? "is-editing" : ""} ${
                        !ind.visible ? "is-hidden" : ""
                      }`}
                      onClick={() => handleStartEdit(ind)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleStartEdit(ind);
                        }
                      }}
                    >
                      <span
                        className="active-color-dot"
                        style={{ backgroundColor: ind.color }}
                        aria-hidden="true"
                      />
                      <div className="active-ind-info">
                        <span className="active-ind-title">
                          <strong>{ind.name}</strong>
                          <span className="active-ind-params">
                            (
                            {Object.entries(ind.params)
                              .map(([k, v]) => `${k}:${v}`)
                              .join(", ")}
                            )
                          </span>
                        </span>
                        <span className="active-ind-badges">
                          {isOscillator(ind.type, ind.name) ? (
                            <span className="chip-badge osc">Осциллятор</span>
                          ) : (
                            <span className="chip-badge overlay">Оверлей</span>
                          )}
                          {ind.persist ? (
                            <span className="chip-badge ch" title="Сохраняется в ClickHouse">
                              CH
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="active-ind-actions">
                        <button
                          type="button"
                          className={`icon-btn ${ind.visible ? "visible" : "muted"}`}
                          title={ind.visible ? "Скрыть" : "Показать"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleVisibility(ind.id);
                          }}
                        >
                          {ind.visible ? "👁" : "🚫"}
                        </button>
                        <button
                          type="button"
                          className="icon-btn edit"
                          title="Редактировать параметры"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(ind);
                          }}
                        >
                          ⚙
                        </button>
                        <button
                          type="button"
                          className="icon-btn remove"
                          title="Удалить с графика"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveIndicator(ind.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Правая колонка: форма настройки параметров */}
          <div className="indicators-config-pane">
            <h3 className="section-title">
              {editingId ? `Редактирование: ${activeSpec.name}` : `Настройка: ${activeSpec.name}`}
            </h3>

            <div className="config-fields-group">
              <div className="config-form-section">
                <span className="form-section-label">Параметры расчёта</span>
                <div className="params-fields-grid">
                  {Object.keys(activeSpec.defaultParams).map((key) => (
                    <label key={key} className="param-field">
                      <span className="param-label">{key}</span>
                      <input
                        type="number"
                        step={key.startsWith("nbdev") ? "0.1" : "1"}
                        min={key === "period" ? String(activeSpec.minBars) : "1"}
                        value={params[key] ?? activeSpec.defaultParams[key]}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setParams((prev) => ({ ...prev, [key]: val }));
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="config-form-section">
                <span className="form-section-label">Цвет и стиль линии</span>
                <div className="style-controls-row">
                  <div className="color-palette-wrap">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`palette-color-btn ${color === c ? "is-selected" : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setColor(c)}
                        aria-label={`Выбрать цвет ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      className="custom-color-input"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      title="Выбрать свой цвет"
                    />
                  </div>

                  <label className="param-field line-width-field">
                    <span className="param-label">Толщина</span>
                    <select
                      value={lineWidth}
                      onChange={(e) => setLineWidth(Number(e.target.value))}
                    >
                      <option value={1}>1 px</option>
                      <option value={2}>2 px</option>
                      <option value={3}>3 px</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="config-form-section">
                <span className="form-section-label">Хранение данных</span>
                <label className="persist-checkbox-label">
                  <input
                    type="checkbox"
                    checked={persist}
                    onChange={(e) => setPersist(e.target.checked)}
                  />
                  <div>
                    <strong>Сохранять в ClickHouse (`TrB.indicator_values`)</strong>
                    <p className="persist-hint">
                      Рассчитанные значения сохраняются в базу данных при расчёте.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="config-actions-row">
              {editingId ? (
                <button type="button" className="btn ghost" onClick={handleCancelEdit}>
                  Отмена
                </button>
              ) : null}
              <button type="button" className="btn primary" onClick={handleSave}>
                {editingId ? "Сохранить изменения" : "+ Добавить на график"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
