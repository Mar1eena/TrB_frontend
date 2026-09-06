// Кодоген схемы StrategySpec для визуального конструктора стратегий.
//
// Читает текст proto из соседнего репозитория TrB_proto и генерирует
//   src/components/StrategyPanel/specSchema.generated.ts
// со списком индикаторов TA-Lib (oneof IndicatorSettings.indicator_type),
// их параметрами и enum'ами (MAType / PriceField / CompareOp / ArithOp).
//
// Запуск:  npm run gen:spec-schema
// Перезапускать при изменении services/indicators/params.proto или
// services/strategy/spec.proto в TrB_proto.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const protoDir = path.resolve(here, "../../TrB_proto/services");
const paramsProto = path.join(protoDir, "indicators/params.proto");
const specProto = path.join(protoDir, "strategy/spec.proto");
const outFile = path.resolve(here, "../src/components/StrategyPanel/specSchema.generated.ts");

for (const f of [paramsProto, specProto]) {
  if (!fs.existsSync(f)) {
    console.error(
      `[gen-spec-schema] не найден ${f}\n` +
        `Ожидается репозиторий TrB_proto рядом с TrB_frontend (../TrB_proto).`,
    );
    process.exit(1);
  }
}

// --- дефолты параметров по имени (proto значений по умолчанию не несёт) ---
const DEFAULTS = {
  period: 14,
  timeperiod: 14,
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  fastKPeriod: 5,
  slowKPeriod: 3,
  slowDPeriod: 3,
  fastDPeriod: 3,
  nbDevUp: 2,
  nbDevDn: 2,
  nbDev: 1,
  acceleration: 0.02,
  maximum: 0.2,
  vFactor: 0.7,
  penetration: 0.3,
  fastLimit: 0.5,
  slowLimit: 0.05,
  minPeriod: 2,
  maxPeriod: 30,
  period1: 7,
  period2: 14,
  period3: 28,
  startValue: 0,
  offsetOnReverse: 0,
  accelerationInitLong: 0.02,
  accelerationLong: 0.02,
  accelerationMaxLong: 0.2,
  accelerationInitShort: 0.02,
  accelerationShort: 0.02,
  accelerationMaxShort: 0.2,
};

// --- индикаторы с несколькими линиями на выходе (output_key) ---
// синхронно с engine/specmod/indicators.py::_output_index
const MULTI_OUTPUT = {
  macd: ["macd", "signal", "hist"],
  macdext: ["macd", "signal", "hist"],
  macdfix: ["macd", "signal", "hist"],
  bbands: ["upper", "middle", "lower"],
  stoch: ["slowk", "slowd"],
  stochf: ["fastk", "fastd"],
  stochrsi: ["fastk", "fastd"],
  aroon: ["aroondown", "aroonup"],
  minmax: ["min", "max"],
  minmaxindex: ["minidx", "maxidx"],
  mama: ["mama", "fama"],
  htphasor: ["inphase", "quadrature"],
  htsine: ["sine", "leadsine"],
};

const SECTION_CATEGORY = [
  [/momentum/i, "Momentum"],
  [/overlap studies/i, "Overlap Studies"],
  [/volatility/i, "Volatility"],
  [/volume/i, "Volume"],
  [/cycle/i, "Cycle"],
  [/pattern recognition/i, "Pattern Recognition"],
  [/price transform/i, "Price Transform"],
  [/statistic/i, "Statistic"],
  [/math operators|math transform/i, "Math"],
];

function toCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function humanize(name) {
  return name
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// вытащить "длинное имя" из комментария вида "// RSI — Relative Strength Index."
function longNameFromComment(comment) {
  if (!comment) return "";
  let c = comment.replace(/\.\s*$/, "").trim();
  const dash = c.split(/\s+[—–-]\s+/);
  if (dash.length > 1) return dash.slice(1).join(" - ").trim();
  return c;
}

// ---------------------------------------------------------------------------
// разбор enum'ов
// ---------------------------------------------------------------------------
function parseEnums(text) {
  const enums = {};
  const re = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const [, name, body] = m;
    const values = [];
    let pending = "";
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line) {
        pending = "";
        continue;
      }
      if (line.startsWith("//")) {
        pending = line.replace(/^\/\/\s?/, "");
        continue;
      }
      const fm = line.match(/^(\w+)\s*=\s*(\d+)\s*;(?:\s*\/\/\s?(.*))?$/);
      if (fm) {
        const [, vname, , trailing] = fm;
        values.push({
          value: vname,
          labelEn: longNameFromComment(trailing || pending) || humanize(vname),
        });
      }
      pending = "";
    }
    enums[name] = values;
  }
  return enums;
}

// ---------------------------------------------------------------------------
// разбор message XxxParams { ... }
// ---------------------------------------------------------------------------
function parseMessages(text) {
  const messages = {};
  const lines = text.split("\n");
  let pendingComment = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("//")) {
      pendingComment = line.replace(/^\/\/\s?/, "");
      continue;
    }
    const mm = line.match(/^message\s+(\w+)\s*\{(.*)$/);
    if (!mm) {
      if (line) pendingComment = "";
      continue;
    }
    const msgName = mm[1];
    const comment = pendingComment;
    pendingComment = "";
    // собрать тело до закрывающей скобки
    let body = mm[2];
    let depth = (body.match(/\{/g) || []).length - (body.match(/\}/g) || []).length + 1;
    while (depth > 0 && i + 1 < lines.length) {
      i++;
      body += "\n" + lines[i];
      depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    }
    const fields = [];
    for (const raw of body.split("\n")) {
      const fl = raw.trim().replace(/\/\/.*$/, "").trim();
      const fm = fl.match(/^(?:optional\s+)?([A-Za-z0-9_.]+)\s+(\w+)\s*=\s*\d+\s*;/);
      if (!fm) continue;
      const [, ptype, pname] = fm;
      let type = "float";
      let enumName;
      if (/^(uint32|int32|uint64|int64|sint32|sint64|fixed32|fixed64)$/.test(ptype)) type = "int";
      else if (/^(double|float)$/.test(ptype)) type = "float";
      else {
        type = "enum";
        enumName = ptype.replace(/^.*\./, "");
      }
      const jsonName = toCamel(pname);
      fields.push({
        name: pname,
        jsonName,
        type,
        ...(enumName ? { enumName } : {}),
        default: DEFAULTS[jsonName] ?? DEFAULTS[pname] ?? (type === "float" ? 0 : 0),
      });
    }
    messages[msgName] = { comment, fields };
  }
  return messages;
}

// ---------------------------------------------------------------------------
// разбор oneof indicator_type внутри message IndicatorSettings
// ---------------------------------------------------------------------------
function parseIndicatorOneof(text, messages) {
  const start = text.indexOf("oneof indicator_type");
  if (start < 0) throw new Error("не найден oneof indicator_type");
  let depth = 0;
  let i = text.indexOf("{", start);
  const bodyStart = i + 1;
  for (; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = text.slice(bodyStart, i);
  const out = [];
  let category = "Прочее";
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("//")) {
      const c = line.replace(/^\/\/\s?/, "");
      for (const [re, cat] of SECTION_CATEGORY) {
        if (re.test(c)) {
          category = cat;
          break;
        }
      }
      continue;
    }
    const fm = line.match(/^(\w+)\s+(\w+)\s*=\s*\d+\s*;/);
    if (!fm) continue;
    const [, msgName, key] = fm;
    const msg = messages[msgName];
    if (!msg) {
      console.warn(`[gen-spec-schema] нет message ${msgName} для ${key}`);
      continue;
    }
    out.push({
      key,
      func: key.toUpperCase(),
      labelEn: longNameFromComment(msg.comment) || key.toUpperCase(),
      category,
      params: msg.fields,
      ...(MULTI_OUTPUT[key] ? { outputs: MULTI_OUTPUT[key] } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
const paramsText = fs.readFileSync(paramsProto, "utf8");
const specText = fs.readFileSync(specProto, "utf8");

const messages = parseMessages(paramsText);
const indicators = parseIndicatorOneof(paramsText, messages);

const enums = {
  ...parseEnums(paramsText), // MAType
  ...parseEnums(specText), // PriceField, CompareOp, ArithOp, ...
};
const keepEnums = ["MAType", "PriceField", "CompareOp", "ArithOp"];
const enumsOut = {};
for (const k of keepEnums) if (enums[k]) enumsOut[k] = enums[k];

indicators.sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));

const banner =
  "// СГЕНЕРИРОВАНО scripts/gen-spec-schema.mjs — НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.\n" +
  "// Источник: TrB_proto/services/indicators/params.proto + strategy/spec.proto\n" +
  `// Индикаторов: ${indicators.length}. Обновить: npm run gen:spec-schema\n`;

const ts =
  banner +
  "\n" +
  `export type ParamType = "int" | "float" | "enum";\n\n` +
  `export type ParamDef = {\n` +
  `  name: string;\n  jsonName: string;\n  type: ParamType;\n  enumName?: string;\n  default: number;\n};\n\n` +
  `export type IndicatorDef = {\n` +
  `  key: string;\n  func: string;\n  labelEn: string;\n  category: string;\n  params: ParamDef[];\n  outputs?: string[];\n};\n\n` +
  `export type EnumValue = { value: string; labelEn: string };\n\n` +
  `export const INDICATORS: IndicatorDef[] = ${JSON.stringify(indicators, null, 2)};\n\n` +
  `export const ENUMS: Record<string, EnumValue[]> = ${JSON.stringify(enumsOut, null, 2)};\n\n` +
  `export const INDICATOR_BY_KEY: Record<string, IndicatorDef> = Object.fromEntries(\n` +
  `  INDICATORS.map((i) => [i.key, i]),\n);\n`;

fs.writeFileSync(outFile, ts);
console.log(
  `[gen-spec-schema] ${path.relative(process.cwd(), outFile)} — ` +
    `${indicators.length} индикаторов, enum: ${Object.keys(enumsOut).join(", ")}`,
);
