export type NatsStream = {
  name: string;
  description: string;
  subjects: string[];
  retention: number;
  storage: number;
  replicas: number;
  max_consumers: number;
  max_msgs: number;
  max_bytes: number;
  max_age: number;
  max_msgs_per_subject: number;
  max_msg_size: number;
  discard: number;
  discard_new_per_subject: boolean;
  allow_direct: boolean;
  no_ack: boolean;
  duplicate_window: number;
  sealed: boolean;
  deny_delete: boolean;
  deny_purge: boolean;
  allow_rollup: boolean;
  compression: number;
  first_seq_cfg: number;
  allow_msg_ttl: boolean;
  subject_delete_marker_ttl: number;
  metadata: Record<string, string>;
  created: string;
  msgs: number;
  bytes: number;
  first_seq: number;
  last_seq: number;
  first_ts: string;
  last_ts: string;
  consumer_count: number;
  num_deleted: number;
  num_subjects: number;
  cluster_name: string;
  cluster_leader: string;
};

export type NatsStreamWrite = {
  name?: string;
  description?: string;
  subjects: string[];
  retention: number;
  storage: number;
  replicas: number;
  max_consumers?: number;
  max_msgs?: number;
  max_bytes?: number;
  max_age?: number;
  max_msgs_per_subject?: number;
  max_msg_size?: number;
  discard?: number;
  discard_new_per_subject?: boolean;
  allow_direct?: boolean;
  no_ack?: boolean;
  duplicate_window?: number;
  sealed?: boolean;
  deny_delete?: boolean;
  deny_purge?: boolean;
  allow_rollup?: boolean;
  compression?: number;
  first_seq_cfg?: number;
  allow_msg_ttl?: boolean;
  subject_delete_marker_ttl?: number;
  metadata?: Record<string, string>;
};

export type NatsConsumer = {
  name: string;
  stream_name: string;
  durable: string;
  description: string;
  filter_subject: string;
  filter_subjects: string[];
  deliver_policy: number;
  opt_start_seq: number;
  opt_start_time: string;
  ack_policy: number;
  max_deliver: number;
  max_ack_pending: number;
  max_waiting: number;
  ack_wait: number;
  backoff: number[];
  replay_policy: number;
  rate_limit_bps: number;
  sample_freq: string;
  flow_control: boolean;
  idle_heartbeat: number;
  headers_only: boolean;
  max_request_batch: number;
  max_request_expires: number;
  max_request_max_bytes: number;
  deliver_subject: string;
  deliver_group: string;
  inactive_threshold: number;
  replicas: number;
  memory_storage: boolean;
  metadata: Record<string, string>;
  created: string;
  num_pending: number;
  num_ack_pending: number;
  num_redelivered: number;
  num_waiting: number;
  push_bound: boolean;
  delivered_stream_seq: number;
  delivered_consumer_seq: number;
  ack_floor_stream_seq: number;
  ack_floor_consumer_seq: number;
};

export type NatsConsumerWrite = {
  durable: string;
  name?: string;
  description?: string;
  filter_subject?: string;
  filter_subjects?: string[];
  deliver_policy: number;
  opt_start_seq?: number;
  opt_start_time?: string;
  ack_policy: number;
  max_deliver?: number;
  max_ack_pending?: number;
  max_waiting?: number;
  ack_wait?: number;
  backoff?: number[];
  replay_policy?: number;
  rate_limit_bps?: number;
  sample_freq?: string;
  flow_control?: boolean;
  idle_heartbeat?: number;
  headers_only?: boolean;
  max_request_batch?: number;
  max_request_expires?: number;
  max_request_max_bytes?: number;
  deliver_subject?: string;
  deliver_group?: string;
  inactive_threshold?: number;
  replicas?: number;
  memory_storage?: boolean;
  metadata?: Record<string, string>;
};

export type NatsAccount = {
  domain: string;
  memory: number;
  storage: number;
  reserved_memory: number;
  reserved_storage: number;
  streams: number;
  consumers: number;
  api_total: number;
  api_errors: number;
  max_memory: number;
  max_storage: number;
  max_streams: number;
  max_consumers: number;
  max_ack_pending: number;
};

export type NatsMessage = {
  subject: string;
  seq: number;
  data: string;
  data_base64: boolean;
  time: string;
  headers: Record<string, string[]>;
};

export type NatsMessageRow = {
  seq: number;
  msg: NatsMessage | null;
};

export const RETENTION_OPTIONS = [
  { value: 0, label: "Limits" },
  { value: 1, label: "Interest" },
  { value: 2, label: "WorkQueue" },
] as const;

export const STORAGE_OPTIONS = [
  { value: 0, label: "File" },
  { value: 1, label: "Memory" },
] as const;

export const DISCARD_OPTIONS = [
  { value: 0, label: "Old" },
  { value: 1, label: "New" },
] as const;

export const COMPRESSION_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "S2" },
] as const;

export const DELIVER_OPTIONS = [
  { value: 0, label: "All" },
  { value: 1, label: "Last" },
  { value: 2, label: "New" },
  { value: 3, label: "By start sequence" },
  { value: 4, label: "By start time" },
] as const;

export const ACK_OPTIONS = [
  { value: 0, label: "None" },
  { value: 1, label: "All" },
  { value: 2, label: "Explicit" },
] as const;

export const REPLAY_OPTIONS = [
  { value: 0, label: "Instant" },
  { value: 1, label: "Original" },
] as const;

export const NATS_SETTINGS_KIND = "trb.nats.settings";

export type NatsSettingsStream = {
  config: NatsStreamWrite;
  consumers: NatsConsumerWrite[];
};

export type NatsSettingsFile = {
  version: number;
  kind: typeof NATS_SETTINGS_KIND;
  exported_at: string;
  streams: NatsSettingsStream[];
};

export type NatsJsonPayload =
  | { kind: "settings"; file: NatsSettingsFile }
  | { kind: "stream"; config: NatsStreamWrite; consumers: NatsConsumerWrite[] }
  | { kind: "consumer"; stream?: string; config: NatsConsumerWrite };

export type NatsApplyResult = {
  created_streams: string[];
  updated_streams: string[];
  created_consumers: string[];
  updated_consumers: string[];
  errors: string[];
};

export type NatsFetchOpts = { fresh?: boolean };
