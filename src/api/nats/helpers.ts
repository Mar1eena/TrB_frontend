import * as natsPbModule from "@marleena/trb-proto/api/nats/manager_pb";
import type {
  AccountInfos,
  Consumer,
  ConsumerInfos,
  ConsumerName,
  Msg,
  RawStreamMsg,
  StreamConfig,
  StreamInfos,
  StreamName,
} from "@marleena/trb-proto/api/nats/manager_pb";
import type {
  NatsAccount,
  NatsConsumer,
  NatsConsumerWrite,
  NatsMessage,
  NatsStream,
  NatsStreamWrite,
} from "./types";
import { num, formatTimestamp, parseTimestamp } from "../common/converters";

export function natsProto(): typeof natsPbModule {
  const rec = natsPbModule as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const nested = rec.default;
  if (typeof rec.JsOpts === "function") return natsPbModule;
  if (nested && typeof nested.JsOpts === "function") {
    return nested as unknown as typeof natsPbModule;
  }
  const fromGlobal = (
    globalThis as {
      proto?: {
        trb?: {
          nats?: {
            manager?: { public?: { contract?: { v1?: typeof natsPbModule } } };
          };
        };
      };
    }
  ).proto?.trb?.nats?.manager?.public?.contract?.v1;
  if (fromGlobal && typeof fromGlobal.JsOpts === "function") return fromGlobal;
  return natsPbModule;
}

export const natsPb = natsProto();

export function nsToSecInput(ns?: number | null): string {
  if (!ns) return "";
  return String(ns / 1e9);
}

export function secInputToNs(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1e9);
}

export function mapToRecord(map?: { forEach: (cb: (value: string, key: string) => void) => void }): Record<string, string> {
  const out: Record<string, string> = {};
  map?.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function mapStream(info: StreamInfos): NatsStream {
  const cfg = info.getConfig();
  const st = info.getState();
  const cluster = info.getCluster();
  return {
    name: cfg?.getName() ?? "",
    description: cfg?.getDescription() ?? "",
    subjects: cfg?.getSubjectsList() ?? [],
    retention: cfg?.getRetention() ?? 0,
    storage: cfg?.getStorage() ?? 0,
    replicas: cfg?.getReplicas() ?? 0,
    max_consumers: cfg?.getMaxConsumers() ?? 0,
    max_msgs: num(cfg?.getMaxMsgs()),
    max_bytes: num(cfg?.getMaxBytes()),
    max_age: num(cfg?.getMaxAge()),
    max_msgs_per_subject: num(cfg?.getMaxMsgsPerSubject()),
    max_msg_size: cfg?.getMaxMsgSize() ?? 0,
    discard: cfg?.getDiscard() ?? 0,
    discard_new_per_subject: Boolean(cfg?.getDiscardNewPerSubject()),
    allow_direct: Boolean(cfg?.getAllowDirect()),
    no_ack: Boolean(cfg?.getNoAck()),
    duplicate_window: num(cfg?.getDuplicateWindow()),
    sealed: Boolean(cfg?.getSealed()),
    deny_delete: Boolean(cfg?.getDenyDelete()),
    deny_purge: Boolean(cfg?.getDenyPurge()),
    allow_rollup: Boolean(cfg?.getAllowRollup()),
    compression: cfg?.getCompression() ?? 0,
    first_seq_cfg: num(cfg?.getFirstSeq()),
    allow_msg_ttl: Boolean(cfg?.getAllowMsgTtl()),
    subject_delete_marker_ttl: num(cfg?.getSubjectDeleteMarkerTtl()),
    metadata: mapToRecord(cfg?.getMetadataMap()),
    created: formatTimestamp(info.getCreated()),
    msgs: num(st?.getMsgs()),
    bytes: num(st?.getBytes()),
    first_seq: num(st?.getFirstSeq()),
    last_seq: num(st?.getLastSeq()),
    first_ts: formatTimestamp(st?.getFirstTs()),
    last_ts: formatTimestamp(st?.getLastTs()),
    consumer_count: st?.getConsumerCount() ?? 0,
    num_deleted: st?.getNumDeleted() ?? 0,
    num_subjects: num(st?.getNumSubjects()),
    cluster_name: cluster?.getName() ?? "",
    cluster_leader: cluster?.getLeader() ?? "",
  };
}

export function mapConsumer(info: ConsumerInfos): NatsConsumer {
  const cfg = info.getConfig();
  const delivered = info.getDelivered();
  const ackFloor = info.getAckFloor();
  return {
    name: info.getName() || cfg?.getName() || cfg?.getDurable() || "",
    stream_name: info.getStreamName() ?? "",
    durable: cfg?.getDurable() ?? "",
    description: cfg?.getDescription() ?? "",
    filter_subject: cfg?.getFilterSubject() ?? "",
    filter_subjects: cfg?.getFilterSubjectsList() ?? [],
    deliver_policy: cfg?.getDeliverPolicy() ?? 0,
    opt_start_seq: num(cfg?.getOptStartSeq()),
    opt_start_time: formatTimestamp(cfg?.getOptStartTime()),
    ack_policy: cfg?.getAckPolicy() ?? 0,
    max_deliver: cfg?.getMaxDeliver() ?? 0,
    max_ack_pending: cfg?.getMaxAckPending() ?? 0,
    max_waiting: cfg?.getMaxWaiting() ?? 0,
    ack_wait: num(cfg?.getAckWait()),
    backoff: (cfg?.getBackoffList() ?? []).map((v) => num(v)),
    replay_policy: cfg?.getReplayPolicy() ?? 0,
    rate_limit_bps: num(cfg?.getRateLimitBps()),
    sample_freq: cfg?.getSampleFreq() ?? "",
    flow_control: Boolean(cfg?.getFlowControl()),
    idle_heartbeat: num(cfg?.getIdleHeartbeat()),
    headers_only: Boolean(cfg?.getHeadersOnly()),
    max_request_batch: cfg?.getMaxRequestBatch() ?? 0,
    max_request_expires: num(cfg?.getMaxRequestExpires()),
    max_request_max_bytes: cfg?.getMaxRequestMaxBytes() ?? 0,
    deliver_subject: cfg?.getDeliverSubject() ?? "",
    deliver_group: cfg?.getDeliverGroup() ?? "",
    inactive_threshold: num(cfg?.getInactiveThreshold()),
    replicas: cfg?.getReplicas() ?? 0,
    memory_storage: Boolean(cfg?.getMemoryStorage()),
    metadata: mapToRecord(cfg?.getMetadataMap()),
    created: formatTimestamp(info.getCreated()),
    num_pending: num(info.getNumPending()),
    num_ack_pending: info.getNumAckPendin() ?? 0,
    num_redelivered: info.getNumRedelivered() ?? 0,
    num_waiting: info.getNumWaiting() ?? 0,
    push_bound: Boolean(info.getPushBound()),
    delivered_stream_seq: num(delivered?.getStreamSeq()),
    delivered_consumer_seq: num(delivered?.getConsumerSeq()),
    ack_floor_stream_seq: num(ackFloor?.getStreamSeq()),
    ack_floor_consumer_seq: num(ackFloor?.getConsumerSeq()),
  };
}

export function mapAccount(info: AccountInfos): NatsAccount {
  const tier = info.getTier();
  const limits = tier?.getLimits();
  const api = info.getApi();
  return {
    domain: info.getDomain() ?? "",
    memory: num(tier?.getMemory()),
    storage: num(tier?.getStorage()),
    reserved_memory: num(tier?.getReservedMemory()),
    reserved_storage: num(tier?.getReservedStorage()),
    streams: tier?.getStream() ?? 0,
    consumers: tier?.getConsumers() ?? 0,
    api_total: num(api?.getTotal()),
    api_errors: num(api?.getErrors()),
    max_memory: num(limits?.getMaxMemory()),
    max_storage: num(limits?.getMaxStorage()),
    max_streams: limits?.getMaxStreams() ?? 0,
    max_consumers: limits?.getMaxConsumers() ?? 0,
    max_ack_pending: limits?.getMaxAckPending() ?? 0,
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeBytes(bytes: Uint8Array): { data: string; base64: boolean } {
  if (!bytes.length) return { data: "", base64: false };
  const text = new TextDecoder().decode(bytes);
  if (text.includes("\uFFFD")) return { data: bytesToBase64(bytes), base64: true };
  return { data: text, base64: false };
}

export function mapMessage(msg: RawStreamMsg): NatsMessage {
  const headers: Record<string, string[]> = {};
  msg.getHdrsMap().forEach((strings, key) => {
    headers[key] = strings.getValuesList();
  });
  const decoded = decodeBytes(msg.getData_asU8());
  return {
    subject: msg.getSubject() ?? "",
    seq: num(msg.getSeq()),
    data: decoded.data,
    data_base64: decoded.base64,
    time: formatTimestamp(msg.getTime()),
    headers,
  };
}

export function sanitizeMetadata(meta?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta ?? {})) {
    if (key.startsWith("_nats")) continue;
    out[key] = value;
  }
  return out;
}

export function fillMetadata(
  map: { set: (key: string, value: string) => unknown },
  meta?: Record<string, string>,
) {
  for (const [key, value] of Object.entries(sanitizeMetadata(meta))) {
    map.set(key, value);
  }
}

export function asStreamName(name: string): StreamName {
  const req = new natsPb.StreamName();
  req.setName(name);
  return req;
}

export function asConsumerName(stream: string, name: string): ConsumerName {
  const req = new natsPb.ConsumerName();
  req.setStream(stream);
  req.setName(name);
  return req;
}

export function asMsg(stream: string, seq: number): Msg {
  const req = new natsPb.Msg();
  req.setName(stream);
  req.setSeq(seq);
  return req;
}

export function streamConfigFromWrite(
  body: NatsStreamWrite,
  name: string,
  opts?: { sealed?: boolean },
): StreamConfig {
  const cfg = new natsPb.StreamConfig();
  cfg.setName(name);
  cfg.setDescription(body.description ?? "");
  cfg.setSubjectsList(body.subjects);
  cfg.setRetention(body.retention);
  cfg.setStorage(body.storage);
  cfg.setReplicas(body.replicas || 1);
  cfg.setMaxConsumers(body.max_consumers ?? 0);
  cfg.setMaxMsgs(body.max_msgs ?? 0);
  cfg.setMaxBytes(body.max_bytes ?? 0);
  cfg.setMaxAge(body.max_age ?? 0);
  cfg.setMaxMsgsPerSubject(body.max_msgs_per_subject ?? 0);
  cfg.setMaxMsgSize(body.max_msg_size ?? 0);
  cfg.setDiscard(body.discard ?? 0);
  cfg.setDiscardNewPerSubject(body.discard_new_per_subject ?? false);
  cfg.setAllowDirect(body.allow_direct ?? true);
  cfg.setNoAck(body.no_ack ?? false);
  cfg.setDuplicateWindow(body.duplicate_window ?? 0);
  cfg.setSealed(opts?.sealed ?? body.sealed ?? false);
  cfg.setDenyDelete(body.deny_delete ?? false);
  cfg.setDenyPurge(body.deny_purge ?? false);
  cfg.setAllowRollup(body.allow_rollup ?? false);
  cfg.setCompression(body.compression ?? 0);
  cfg.setFirstSeq(body.first_seq_cfg ?? 0);
  cfg.setAllowMsgTtl(body.allow_msg_ttl ?? false);
  cfg.setSubjectDeleteMarkerTtl(body.subject_delete_marker_ttl ?? 0);
  fillMetadata(cfg.getMetadataMap(), body.metadata);
  return cfg;
}

export function consumerFromWrite(stream: string, body: NatsConsumerWrite): Consumer {
  const durable = body.durable.trim();
  const cfg = new natsPb.ConsumerConfig();
  cfg.setDurable(durable);
  cfg.setName(body.name?.trim() || durable);
  cfg.setDescription(body.description ?? "");
  cfg.setFilterSubject(body.filter_subject ?? "");
  cfg.setFilterSubjectsList(body.filter_subjects ?? []);
  cfg.setDeliverPolicy(body.deliver_policy);
  cfg.setOptStartSeq(body.opt_start_seq ?? 0);
  const startTime = parseTimestamp(body.opt_start_time);
  if (startTime) cfg.setOptStartTime(startTime);
  cfg.setAckPolicy(body.ack_policy);
  cfg.setMaxDeliver(body.max_deliver ?? 0);
  cfg.setMaxAckPending(body.max_ack_pending ?? 0);
  cfg.setMaxWaiting(body.max_waiting ?? 0);
  cfg.setAckWait(body.ack_wait ?? 0);
  cfg.setBackoffList(body.backoff ?? []);
  cfg.setReplayPolicy(body.replay_policy ?? 0);
  cfg.setRateLimitBps(body.rate_limit_bps ?? 0);
  cfg.setSampleFreq(body.sample_freq ?? "");
  cfg.setFlowControl(body.flow_control ?? false);
  cfg.setIdleHeartbeat(body.idle_heartbeat ?? 0);
  cfg.setHeadersOnly(body.headers_only ?? false);
  cfg.setMaxRequestBatch(body.max_request_batch ?? 0);
  cfg.setMaxRequestExpires(body.max_request_expires ?? 0);
  cfg.setMaxRequestMaxBytes(body.max_request_max_bytes ?? 0);
  cfg.setDeliverSubject(body.deliver_subject ?? "");
  cfg.setDeliverGroup(body.deliver_group ?? "");
  cfg.setInactiveThreshold(body.inactive_threshold ?? 0);
  cfg.setReplicas(body.replicas ?? 0);
  cfg.setMemoryStorage(body.memory_storage ?? false);
  fillMetadata(cfg.getMetadataMap(), body.metadata);

  const req = new natsPb.Consumer();
  req.setName(stream);
  req.setConfig(cfg);
  return req;
}

export function enumLabel(
  options: readonly { value: number; label: string }[],
  value: number,
): string {
  return options.find((o) => o.value === value)?.label ?? String(value);
}

export function formatBytes(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 0) return "∞";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatAgeNs(ns?: number | null): string {
  if (ns == null || ns <= 0) return "∞";
  const sec = ns / 1e9;
  if (sec < 60) return `${Math.round(sec)} с`;
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ч`;
  return `${Math.round(sec / 86400)} д`;
}

export function formatDateTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return "—";
  return d.toLocaleString("ru-RU");
}

export function splitSubjects(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinSubjects(items?: string[]): string {
  return (items ?? []).join(", ");
}

export function parseMetadata(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function formatMetadata(meta?: Record<string, string>): string {
  return Object.entries(meta ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export function streamToWrite(stream: NatsStream): NatsStreamWrite {
  return {
    name: stream.name,
    description: stream.description,
    subjects: stream.subjects,
    retention: stream.retention,
    storage: stream.storage,
    replicas: stream.replicas || 1,
    max_consumers: stream.max_consumers,
    max_msgs: stream.max_msgs,
    max_bytes: stream.max_bytes,
    max_age: stream.max_age,
    max_msgs_per_subject: stream.max_msgs_per_subject,
    max_msg_size: stream.max_msg_size,
    discard: stream.discard,
    discard_new_per_subject: stream.discard_new_per_subject,
    allow_direct: stream.allow_direct,
    no_ack: stream.no_ack,
    duplicate_window: stream.duplicate_window,
    sealed: stream.sealed,
    deny_delete: stream.deny_delete,
    deny_purge: stream.deny_purge,
    allow_rollup: stream.allow_rollup,
    compression: stream.compression,
    first_seq_cfg: stream.first_seq_cfg,
    allow_msg_ttl: stream.allow_msg_ttl,
    subject_delete_marker_ttl: stream.subject_delete_marker_ttl,
    metadata: stream.metadata,
  };
}

export function consumerToWrite(c: NatsConsumer): NatsConsumerWrite {
  return {
    durable: c.durable || c.name,
    name: c.name || c.durable,
    description: c.description,
    filter_subject: c.filter_subject,
    filter_subjects: c.filter_subjects,
    deliver_policy: c.deliver_policy,
    opt_start_seq: c.opt_start_seq,
    opt_start_time: c.opt_start_time,
    ack_policy: c.ack_policy,
    max_deliver: c.max_deliver,
    max_ack_pending: c.max_ack_pending,
    max_waiting: c.max_waiting,
    ack_wait: c.ack_wait,
    backoff: c.backoff,
    replay_policy: c.replay_policy,
    rate_limit_bps: c.rate_limit_bps,
    sample_freq: c.sample_freq,
    flow_control: c.flow_control,
    idle_heartbeat: c.idle_heartbeat,
    headers_only: c.headers_only,
    max_request_batch: c.max_request_batch,
    max_request_expires: c.max_request_expires,
    max_request_max_bytes: c.max_request_max_bytes,
    deliver_subject: c.deliver_subject,
    deliver_group: c.deliver_group,
    inactive_threshold: c.inactive_threshold,
    replicas: c.replicas,
    memory_storage: c.memory_storage,
    metadata: c.metadata,
  };
}
