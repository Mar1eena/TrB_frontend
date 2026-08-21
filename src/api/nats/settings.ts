import {
  NATS_SETTINGS_KIND,
  type NatsApplyResult,
  type NatsConsumerWrite,
  type NatsJsonPayload,
  type NatsSettingsFile,
  type NatsSettingsStream,
  type NatsStreamWrite,
} from "./types";
import {
  consumerToWrite,
  streamToWrite,
} from "./helpers";
import {
  createConsumer,
  createStream,
  fetchConsumers,
  fetchStream,
  fetchStreams,
  updateConsumer,
  updateStream,
} from "./client";
import { num } from "../common/converters";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    if (key in obj) return num(obj[key]);
  }
  return 0;
}

function pickBool(obj: Record<string, unknown>, fallback: boolean, ...keys: string[]): boolean {
  for (const key of keys) {
    if (key in obj) return Boolean(obj[key]);
  }
  return fallback;
}

function pickStrs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function pickMeta(value: unknown): Record<string, string> {
  const obj = asRecord(value);
  if (!obj) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(obj)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function pickNsList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => num(item)).filter((n) => n > 0);
}

function parseStreamWrite(raw: unknown): NatsStreamWrite | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const name = pickStr(obj, "name");
  const subjects = pickStrs(obj.subjects);
  if (!name && subjects.length === 0) return null;
  return {
    name,
    description: pickStr(obj, "description"),
    subjects,
    retention: pickNum(obj, "retention"),
    storage: pickNum(obj, "storage"),
    replicas: pickNum(obj, "replicas", "num_replicas", "numReplicas") || 1,
    max_consumers: pickNum(obj, "max_consumers", "maxConsumers"),
    max_msgs: pickNum(obj, "max_msgs", "maxMsgs"),
    max_bytes: pickNum(obj, "max_bytes", "maxBytes"),
    max_age: pickNum(obj, "max_age", "maxAge"),
    max_msgs_per_subject: pickNum(obj, "max_msgs_per_subject", "maxMsgsPerSubject"),
    max_msg_size: pickNum(obj, "max_msg_size", "maxMsgSize"),
    discard: pickNum(obj, "discard"),
    discard_new_per_subject: pickBool(obj, false, "discard_new_per_subject", "discardNewPerSubject"),
    allow_direct: pickBool(obj, true, "allow_direct", "allowDirect"),
    no_ack: pickBool(obj, false, "no_ack", "noAck"),
    duplicate_window: pickNum(obj, "duplicate_window", "duplicateWindow"),
    sealed: pickBool(obj, false, "sealed"),
    deny_delete: pickBool(obj, false, "deny_delete", "denyDelete"),
    deny_purge: pickBool(obj, false, "deny_purge", "denyPurge"),
    allow_rollup: pickBool(obj, false, "allow_rollup", "allowRollup", "allow_rollup_hdrs"),
    compression: pickNum(obj, "compression"),
    first_seq_cfg: pickNum(obj, "first_seq_cfg", "first_seq", "firstSeq"),
    allow_msg_ttl: pickBool(obj, false, "allow_msg_ttl", "allowMsgTtl"),
    subject_delete_marker_ttl: pickNum(obj, "subject_delete_marker_ttl", "subjectDeleteMarkerTtl"),
    metadata: pickMeta(obj.metadata),
  };
}

function parseConsumerWrite(raw: unknown): NatsConsumerWrite | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const nested = asRecord(obj.config);
  const src = nested ?? obj;
  const durable = pickStr(src, "durable", "durable_name", "name");
  const looksLikeConsumer =
    "durable" in src ||
    "durable_name" in src ||
    "deliver_policy" in src ||
    "deliverPolicy" in src ||
    "ack_policy" in src ||
    "ackPolicy" in src ||
    "filter_subject" in src ||
    "filterSubject" in src ||
    "filter_subjects" in src ||
    "filterSubjects" in src;
  if (!looksLikeConsumer || !durable) return null;
  return {
    durable,
    name: pickStr(src, "name") || durable,
    description: pickStr(src, "description"),
    filter_subject: pickStr(src, "filter_subject", "filterSubject"),
    filter_subjects: pickStrs(src.filter_subjects ?? src.filterSubjects),
    deliver_policy: pickNum(src, "deliver_policy", "deliverPolicy"),
    opt_start_seq: pickNum(src, "opt_start_seq", "optStartSeq"),
    opt_start_time: pickStr(src, "opt_start_time", "optStartTime"),
    ack_policy: pickNum(src, "ack_policy", "ackPolicy"),
    max_deliver: pickNum(src, "max_deliver", "maxDeliver"),
    max_ack_pending: pickNum(src, "max_ack_pending", "maxAckPending"),
    max_waiting: pickNum(src, "max_waiting", "maxWaiting"),
    ack_wait: pickNum(src, "ack_wait", "ackWait"),
    backoff: pickNsList(src.backoff),
    replay_policy: pickNum(src, "replay_policy", "replayPolicy"),
    rate_limit_bps: pickNum(src, "rate_limit_bps", "rateLimitBps"),
    sample_freq: pickStr(src, "sample_freq", "sampleFreq"),
    flow_control: pickBool(src, false, "flow_control", "flowControl"),
    idle_heartbeat: pickNum(src, "idle_heartbeat", "idleHeartbeat"),
    headers_only: pickBool(src, false, "headers_only", "headersOnly"),
    max_request_batch: pickNum(src, "max_request_batch", "maxRequestBatch"),
    max_request_expires: pickNum(src, "max_request_expires", "maxRequestExpires"),
    max_request_max_bytes: pickNum(src, "max_request_max_bytes", "maxRequestMaxBytes"),
    deliver_subject: pickStr(src, "deliver_subject", "deliverSubject"),
    deliver_group: pickStr(src, "deliver_group", "deliverGroup"),
    inactive_threshold: pickNum(src, "inactive_threshold", "inactiveThreshold"),
    replicas: pickNum(src, "replicas", "num_replicas", "numReplicas"),
    memory_storage: pickBool(src, false, "memory_storage", "memoryStorage", "mem_storage"),
    metadata: pickMeta(src.metadata),
  };
}

function parseSettingsStream(raw: unknown): NatsSettingsStream | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const wrapped = parseStreamWrite(obj.config);
  const flat = wrapped ?? parseStreamWrite(obj);
  if (!flat) return null;
  const consumersRaw = obj.consumers;
  const consumers = Array.isArray(consumersRaw)
    ? consumersRaw.map((item) => parseConsumerWrite(item)).filter((item): item is NatsConsumerWrite => Boolean(item))
    : [];
  return { config: flat, consumers };
}

export function buildNatsSettings(streams: NatsSettingsStream[]): NatsSettingsFile {
  return {
    version: 1,
    kind: NATS_SETTINGS_KIND,
    exported_at: new Date().toISOString(),
    streams,
  };
}

export function parseNatsJson(raw: unknown): NatsJsonPayload {
  const obj = asRecord(raw);
  if (!obj) throw new Error("JSON должен быть объектом");

  if (Array.isArray(obj.streams) || obj.kind === NATS_SETTINGS_KIND) {
    const streams = (Array.isArray(obj.streams) ? obj.streams : [])
      .map((item) => parseSettingsStream(item))
      .filter((item): item is NatsSettingsStream => Boolean(item));
    if (streams.length === 0) throw new Error("В файле нет стримов");
    return {
      kind: "settings",
      file: {
        version: num(obj.version) || 1,
        kind: NATS_SETTINGS_KIND,
        exported_at: pickStr(obj, "exported_at", "exportedAt") || new Date().toISOString(),
        streams,
      },
    };
  }

  const wrappedStream = parseStreamWrite(obj.config);
  if (wrappedStream && (Array.isArray(obj.consumers) || wrappedStream.subjects.length > 0 || wrappedStream.name)) {
    if (wrappedStream.name || wrappedStream.subjects.length > 0) {
      const consumers = Array.isArray(obj.consumers)
        ? obj.consumers.map((item) => parseConsumerWrite(item)).filter((item): item is NatsConsumerWrite => Boolean(item))
        : [];
      return { kind: "stream", config: wrappedStream, consumers };
    }
  }

  const stream = parseStreamWrite(obj);
  if (stream && (stream.subjects.length > 0 || "retention" in obj || "storage" in obj || "subjects" in obj)) {
    const consumers = Array.isArray(obj.consumers)
      ? obj.consumers.map((item) => parseConsumerWrite(item)).filter((item): item is NatsConsumerWrite => Boolean(item))
      : [];
    return { kind: "stream", config: stream, consumers };
  }

  const consumer = parseConsumerWrite(obj);
  if (consumer) {
    return { kind: "consumer", stream: pickStr(obj, "stream", "stream_name", "streamName") || undefined, config: consumer };
  }

  throw new Error("Не удалось распознать JSON настроек NATS");
}

export async function collectNatsSettings(streamName?: string): Promise<NatsSettingsFile> {
  const streams = streamName
    ? [await fetchStream(streamName, { fresh: true })]
    : await fetchStreams({ fresh: true });
  const items = await Promise.all(
    streams.map(async (stream) => ({
      config: streamToWrite(stream),
      consumers: (await fetchConsumers(stream.name, { fresh: true })).map(consumerToWrite),
    })),
  );
  return buildNatsSettings(items);
}

export async function applyNatsSettings(file: NatsSettingsFile): Promise<NatsApplyResult> {
  const result: NatsApplyResult = {
    created_streams: [],
    updated_streams: [],
    created_consumers: [],
    updated_consumers: [],
    errors: [],
  };
  const existing = new Set((await fetchStreams({ fresh: true })).map((stream) => stream.name));
  for (const item of file.streams) {
    const name = item.config.name?.trim() ?? "";
    if (!name) {
      result.errors.push("стрим без имени пропущен");
      continue;
    }
    try {
      if (existing.has(name)) {
        try {
          await updateStream(name, item.config);
          result.updated_streams.push(name);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (item.config.sealed && /seal/i.test(message)) {
            result.updated_streams.push(name);
          } else {
            throw error;
          }
        }
      } else {
        await createStream(item.config);
        result.created_streams.push(name);
        existing.add(name);
      }
    } catch (error) {
      result.errors.push(`стрим ${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    let existingConsumers = new Set<string>();
    try {
      existingConsumers = new Set(
        (await fetchConsumers(name, { fresh: true })).map((consumer) => consumer.durable || consumer.name),
      );
    } catch (error) {
      result.errors.push(`consumers ${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const consumer of item.consumers) {
      const consumerName = (consumer.durable || consumer.name || "").trim();
      if (!consumerName) {
        result.errors.push(`стрим ${name}: consumer без имени пропущен`);
        continue;
      }
      try {
        if (existingConsumers.has(consumerName)) {
          await updateConsumer(name, consumer);
          result.updated_consumers.push(`${name}/${consumerName}`);
        } else {
          await createConsumer(name, consumer);
          result.created_consumers.push(`${name}/${consumerName}`);
        }
      } catch (error) {
        result.errors.push(
          `consumer ${name}/${consumerName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return result;
}

export function formatApplyResult(result: NatsApplyResult): string {
  const parts: string[] = [];
  if (result.created_streams.length) parts.push(`создано стримов ${result.created_streams.length}`);
  if (result.updated_streams.length) parts.push(`обновлено стримов ${result.updated_streams.length}`);
  if (result.created_consumers.length) parts.push(`создано consumers ${result.created_consumers.length}`);
  if (result.updated_consumers.length) parts.push(`обновлено consumers ${result.updated_consumers.length}`);
  if (result.errors.length) parts.push(`ошибок ${result.errors.length}`);
  return parts.join(", ") || "Изменений нет";
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function readJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    const finish = (error?: unknown, value?: unknown) => {
      input.remove();
      if (error) reject(error);
      else resolve(value);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        finish(new Error("cancelled"));
        return;
      }
      file
        .text()
        .then((text) => JSON.parse(text) as unknown)
        .then((value) => finish(undefined, value))
        .catch((error) => finish(error));
    });
    input.addEventListener("cancel", () => finish(new Error("cancelled")));
    document.body.appendChild(input);
    input.click();
  });
}
