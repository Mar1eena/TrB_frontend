// Русские названия и описания настроек стратегии для конструктора.
// Схема (список индикаторов, параметры, enum) генерируется из proto в
// specSchema.generated.ts; здесь — только человеческий текст поверх неё.

import { INDICATOR_BY_KEY } from "./specSchema.generated";

type Named = { name: string; desc: string };

// --- индикаторы (популярные; остальные берут англ. название из proto) ---
export const INDICATOR_RU: Record<string, Named> = {
  rsi: { name: "RSI — индекс относительной силы", desc: "Осциллятор 0–100. <30 — перепроданность, >70 — перекупленность. Классический период — 14." },
  sma: { name: "SMA — простая скользящая средняя", desc: "Среднее цены за N последних баров. Сглаживает шум, показывает направление тренда." },
  ema: { name: "EMA — экспоненциальная скользящая средняя", desc: "Скользящая средняя с большим весом свежих баров — быстрее реагирует, чем SMA." },
  wma: { name: "WMA — взвешенная скользящая средняя", desc: "Линейно взвешенная средняя: свежие бары важнее старых." },
  dema: { name: "DEMA — двойная EMA", desc: "Уменьшает запаздывание обычной EMA." },
  tema: { name: "TEMA — тройная EMA", desc: "Ещё меньше запаздывания, чем у DEMA." },
  trima: { name: "TRIMA — треугольная средняя", desc: "Дважды сглаженная средняя, вес максимален в центре окна." },
  kama: { name: "KAMA — адаптивная средняя Кауфмана", desc: "Ускоряется на тренде и замедляется во флэте." },
  t3: { name: "T3 — средняя Тилсона", desc: "Гладкая средняя с малым запаздыванием (параметр vFactor управляет сглаживанием)." },
  macd: { name: "MACD — схождение/расхождение средних", desc: "Разница быстрой и медленной EMA плюс сигнальная линия. Выходы: macd, signal, hist." },
  ppo: { name: "PPO — процентный ценовой осциллятор", desc: "Как MACD, но в процентах — сопоставим между инструментами." },
  bbands: { name: "Bollinger Bands — полосы Боллинджера", desc: "Средняя ± N стандартных отклонений. Выходы: upper, middle, lower." },
  atr: { name: "ATR — средний истинный диапазон", desc: "Средний размах бара за период. Мера волатильности в пунктах цены." },
  natr: { name: "NATR — нормированный ATR", desc: "ATR в процентах от цены." },
  adx: { name: "ADX — индекс направленного движения", desc: "Сила тренда 0–100 (без направления). >25 — выраженный тренд." },
  adxr: { name: "ADXR — сглаженный ADX", desc: "ADX, усреднённый с его значением период назад." },
  cci: { name: "CCI — индекс товарного канала", desc: "Отклонение цены от средней. Выход за ±100 — сильное движение." },
  mom: { name: "MOM — моментум", desc: "Разница цены и цены N баров назад." },
  roc: { name: "ROC — скорость изменения", desc: "Процентное изменение цены за N баров." },
  rocp: { name: "ROCP — скорость изменения (доля)", desc: "(цена − цена N баров назад) / цена N баров назад." },
  willr: { name: "Williams %R", desc: "Осциллятор −100..0. Ниже −80 — перепроданность, выше −20 — перекупленность." },
  stoch: { name: "Стохастик", desc: "Положение закрытия в диапазоне за период. Выходы: slowk, slowd." },
  stochrsi: { name: "Stochastic RSI", desc: "Стохастик, посчитанный по RSI. Выходы: fastk, fastd." },
  mfi: { name: "MFI — индекс денежного потока", desc: "RSI с учётом объёма. 0–100." },
  cmo: { name: "CMO — осциллятор моментума Чанде", desc: "Осциллятор −100..100 на основе сумм роста и падения." },
  obv: { name: "OBV — балансовый объём", desc: "Накопленный объём со знаком движения цены." },
  ad: { name: "A/D — линия накопления/распределения Чайкина", desc: "Накопление объёма с учётом положения закрытия в баре." },
  sar: { name: "Parabolic SAR", desc: "Трейлинг-уровень разворота. acceleration и maximum задают шаг." },
  aroon: { name: "Aroon", desc: "Как давно был максимум и минимум за период. Выходы: aroondown, aroonup." },
  trix: { name: "TRIX", desc: "1-барный ROC тройной сглаженной EMA — фильтрует мелкие колебания." },
  ultosc: { name: "Ultimate Oscillator", desc: "Осциллятор по трём периодам сразу (period1/2/3)." },
};

export function indName(key: string): string {
  return INDICATOR_RU[key]?.name ?? INDICATOR_BY_KEY[key]?.labelEn ?? key.toUpperCase();
}
export function indDesc(key: string): string {
  return INDICATOR_RU[key]?.desc ?? INDICATOR_BY_KEY[key]?.labelEn ?? "";
}

// --- параметры индикаторов ---
export const PARAM_RU: Record<string, Named> = {
  period: { name: "Период", desc: "Размер окна расчёта в барах." },
  fastPeriod: { name: "Быстрый период", desc: "Окно быстрой скользящей средней." },
  slowPeriod: { name: "Медленный период", desc: "Окно медленной скользящей средней." },
  signalPeriod: { name: "Сигнальный период", desc: "Сглаживание сигнальной линии." },
  fastKPeriod: { name: "Период %K", desc: "Окно быстрой линии %K." },
  slowKPeriod: { name: "Замедление %K", desc: "Сглаживание линии %K." },
  slowDPeriod: { name: "Период %D", desc: "Сглаживание сигнальной линии %D." },
  fastDPeriod: { name: "Период %D (быстрый)", desc: "Сглаживание быстрой %D." },
  nbDevUp: { name: "Отклонений вверх", desc: "Сколько σ отложить вверх от средней." },
  nbDevDn: { name: "Отклонений вниз", desc: "Сколько σ отложить вниз от средней." },
  nbDev: { name: "Число σ", desc: "Множитель стандартного отклонения." },
  maType: { name: "Тип средней", desc: "Метод усреднения." },
  fastMaType: { name: "Тип быстрой средней", desc: "Метод усреднения быстрой линии." },
  slowMaType: { name: "Тип медленной средней", desc: "Метод усреднения медленной линии." },
  signalMaType: { name: "Тип сигнальной средней", desc: "Метод усреднения сигнальной линии." },
  acceleration: { name: "Ускорение", desc: "Шаг фактора ускорения SAR (обычно 0.02)." },
  maximum: { name: "Максимум ускорения", desc: "Потолок фактора ускорения SAR (обычно 0.2)." },
  vFactor: { name: "Фактор объёма (T3)", desc: "0..1 — степень сглаживания T3." },
  penetration: { name: "Проникновение", desc: "Глубина захода в тело предыдущей свечи (для паттернов)." },
  minPeriod: { name: "Мин. период", desc: "Нижняя граница переменного периода." },
  maxPeriod: { name: "Макс. период", desc: "Верхняя граница переменного периода." },
  fastLimit: { name: "Быстрый предел", desc: "Верхний предел сглаживания MAMA." },
  slowLimit: { name: "Медленный предел", desc: "Нижний предел сглаживания MAMA." },
  timePeriod1: { name: "Период 1", desc: "Короткое окно." },
  timePeriod2: { name: "Период 2", desc: "Среднее окно." },
  timePeriod3: { name: "Период 3", desc: "Длинное окно." },
};
export function paramName(jsonName: string): string {
  return PARAM_RU[jsonName]?.name ?? jsonName;
}
export function paramDesc(jsonName: string): string {
  return PARAM_RU[jsonName]?.desc ?? "";
}

// --- enum'ы ---
export const ENUM_RU: Record<string, Record<string, string>> = {
  MAType: {
    MA_TYPE_SMA: "SMA — простая",
    MA_TYPE_EMA: "EMA — экспоненциальная",
    MA_TYPE_WMA: "WMA — взвешенная",
    MA_TYPE_DEMA: "DEMA — двойная EMA",
    MA_TYPE_TEMA: "TEMA — тройная EMA",
    MA_TYPE_TRIMA: "TRIMA — треугольная",
    MA_TYPE_KAMA: "KAMA — адаптивная Кауфмана",
    MA_TYPE_MAMA: "MAMA — адаптивная MESA",
    MA_TYPE_T3: "T3 — Тилсона",
  },
  PriceField: {
    PRICE_CLOSE: "Закрытие",
    PRICE_OPEN: "Открытие",
    PRICE_HIGH: "Максимум",
    PRICE_LOW: "Минимум",
    PRICE_VOLUME: "Объём",
    PRICE_HL2: "(H+L)/2",
    PRICE_HLC3: "(H+L+C)/3",
    PRICE_OHLC4: "(O+H+L+C)/4",
  },
  CompareOp: {
    COMPARE_OP_GT: "больше >",
    COMPARE_OP_GE: "больше или равно ≥",
    COMPARE_OP_LT: "меньше <",
    COMPARE_OP_LE: "меньше или равно ≤",
    COMPARE_OP_EQ: "равно =",
    COMPARE_OP_NE: "не равно ≠",
    COMPARE_OP_CROSSES_ABOVE: "пересекает вверх ↗",
    COMPARE_OP_CROSSES_BELOW: "пересекает вниз ↘",
  },
  ArithOp: {
    ARITH_OP_ADD: "сложение +",
    ARITH_OP_SUB: "вычитание −",
    ARITH_OP_MUL: "умножение ×",
    ARITH_OP_DIV: "деление ÷",
  },
};
export function enumLabel(enumName: string, value: string): string {
  return ENUM_RU[enumName]?.[value] ?? value;
}

// --- категории индикаторов ---
export const CATEGORY_RU: Record<string, string> = {
  Momentum: "Осцилляторы и импульс",
  "Overlap Studies": "Скользящие средние",
  Volatility: "Волатильность",
  Volume: "Объём",
  Cycle: "Циклы (Гильберт)",
  Statistic: "Статистика",
  "Pattern Recognition": "Свечные паттерны",
  Math: "Математика",
  "Price Transform": "Трансформация цены",
  Прочее: "Прочее",
};
export function categoryName(cat: string): string {
  return CATEGORY_RU[cat] ?? cat;
}

// --- поля sizing / risk / прочее ---
export const FIELD_RU: Record<string, Named> = {
  warmupBars: {
    name: "Прогрев, баров",
    desc: "Сколько первых баров пропустить, пока индикаторы не набрали историю. Ориентир — самый длинный период × 3.",
  },
  "operand.shift": {
    name: "Сдвиг, баров",
    desc: "0 — текущий закрытый бар, 1 — предыдущий и т. д. Позволяет сравнивать значение с прошлым.",
  },
  outputKey: {
    name: "Линия индикатора",
    desc: "У многолинейных индикаторов (MACD, Bollinger, Stoch) — какую линию использовать.",
  },
  appliedTo: {
    name: "Считать по цене",
    desc: "Какое поле свечи подавать на вход индикатора. По умолчанию — закрытие.",
  },
  crosses: {
    name: "Пересечение",
    desc: "Срабатывает только на том баре, где левая линия пересекла правую в нужную сторону.",
  },
  // sizing
  method: {
    name: "Метод размера позиции",
    desc: "Как считать объём сделки при входе.",
  },
  fixedCash: { name: "Фиксированная сумма", desc: "Сколько денег счёта вкладывать в сделку (в валюте счёта)." },
  percentEquity: { name: "Доля капитала, %", desc: "Какой процент капитала вкладывать. Диапазон 0–100 %." },
  fixedUnits: { name: "Фиксированный объём", desc: "Постоянное число лотов/единиц инструмента." },
  riskPerTrade: {
    name: "Риск на сделку, %",
    desc: "Доля капитала, теряемая при срабатывании стопа. Требует ненулевой стоп-лосс.",
  },
  maxOpenPositions: { name: "Макс. открытых позиций", desc: "Сколько сделок держать одновременно. По умолчанию 1." },
  allowPyramiding: { name: "Разрешить доборы", desc: "Позволять увеличивать уже открытую позицию новыми входами." },
  // risk
  stopLossPct: { name: "Стоп-лосс, %", desc: "Убыток от цены входа, при котором позиция закрывается. 0 — выключено. Меньше 100 %." },
  takeProfitPct: { name: "Тейк-профит, %", desc: "Прибыль от цены входа, при которой позиция закрывается. 0 — выключено." },
  trailingStop: { name: "Трейлинг-стоп", desc: "Подтягивать стоп за ценой в прибыльную сторону." },
  trailingPct: { name: "Откат трейлинга, %", desc: "На сколько цена может откатиться от пика, прежде чем закроется позиция. 0–100 %." },
  timeStopBars: { name: "Стоп по времени, баров", desc: "Принудительный выход через N баров после входа. 0 — выключено." },
};
export function fieldName(key: string): string {
  return FIELD_RU[key]?.name ?? key;
}
export function fieldDesc(key: string): string {
  return FIELD_RU[key]?.desc ?? "";
}

// --- виды операндов и узлов правил ---
export const OPERAND_KIND_RU: Record<string, Named> = {
  indicatorId: { name: "Индикатор", desc: "Значение одного из объявленных выше индикаторов." },
  price: { name: "Цена свечи", desc: "Поле текущей свечи: закрытие, максимум и т. д." },
  constant: { name: "Число", desc: "Постоянное значение для сравнения (например уровень 30)." },
  arith: { name: "Формула", desc: "Арифметика над двумя операндами: A + B, A × B и т. п." },
};
export const NODE_KIND_RU: Record<string, Named> = {
  compare: { name: "Сравнение", desc: "Сравнить два значения оператором (>, <, пересечение…)." },
  all: { name: "И (все условия)", desc: "Истинно, когда истинны все вложенные условия." },
  any: { name: "ИЛИ (любое условие)", desc: "Истинно, когда истинно хотя бы одно вложенное условие." },
  negate: { name: "НЕ", desc: "Инвертирует вложенное условие." },
  literal: { name: "Константа", desc: "Всегда истина или всегда ложь." },
};
