import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ACK_OPTIONS,
  COMPRESSION_OPTIONS,
  DELIVER_OPTIONS,
  DISCARD_OPTIONS,
  REPLAY_OPTIONS,
  RETENTION_OPTIONS,
  STORAGE_OPTIONS,
  applyNatsSettings,
  buildNatsSettings,
  collectNatsSettings,
  createConsumer,
  createStream,
  deleteConsumer,
  deleteMessage,
  deleteStream,
  downloadJson,
  enumLabel,
  consumerToWrite,
  fetchAccount,
  fetchConsumers,
  fetchStream,
  fetchStreams,
  fetchStreamsInfo,
  fetchMessageRange,
  formatAgeNs,
  formatApplyResult,
  formatBytes,
  formatDateTime,
  formatMetadata,
  joinSubjects,
  nsToSecInput,
  parseMetadata,
  parseNatsJson,
  publishMessage,
  purgeStream,
  readJsonFile,
  secInputToNs,
  splitSubjects,
  streamNameBySubject,
  streamToWrite,
  updateConsumer,
  updateStream,
  type NatsAccount,
  type NatsConsumer,
  type NatsConsumerWrite,
  type NatsMessage,
  type NatsMessageRow,
  type NatsSettingsFile,
  type NatsStream,
  type NatsStreamWrite,
} from "../../api/nats";
import "../../styles/tables.css";
import "../SchedulerPanel/SchedulerPanel.css";
import "./NatsAdminPanel.css";
import { useNotify } from "../../notifications";

type MainTab = "explorer" | "publish" | "system";
type StreamDetailTab = "overview" | "config" | "consumers" | "messages" | "json";

type Dialog =
  | { kind: "create-stream" }
  | { kind: "create-consumer" }
  | { kind: "edit-consumer"; consumer: NatsConsumer }
  | { kind: "view-message"; msg: NatsMessage }
  | {
      kind: "confirm-danger";
      title: string;
      prompt: string;
      actionName: string;
      onConfirm: () => Promise<void>;
    };

type StreamFormState = {
  name: string;
  description: string;
  subjects: string;
  retention: number;
  storage: number;
  replicas: string;
  maxConsumers: string;
  maxMsgs: string;
  maxBytes: string;
  maxAgeSec: string;
  maxMsgsPerSubject: string;
  maxMsgSize: string;
  discard: number;
  discardNewPerSubject: boolean;
  allowDirect: boolean;
  noAck: boolean;
  duplicateWindowSec: string;
  sealed: boolean;
  denyDelete: boolean;
  denyPurge: boolean;
  allowRollup: boolean;
  compression: number;
  firstSeq: string;
  allowMsgTtl: boolean;
  subjectDeleteMarkerTtlSec: string;
  metadata: string;
};

type ConsumerFormState = {
  durable: string;
  description: string;
  filterSubject: string;
  filterSubjects: string;
  deliverPolicy: number;
  optStartSeq: string;
  optStartTime: string;
  ackPolicy: number;
  maxDeliver: string;
  maxAckPending: string;
  maxWaiting: string;
  ackWaitSec: string;
  backoffSec: string;
  replayPolicy: number;
  rateLimitBps: string;
  sampleFreq: string;
  flowControl: boolean;
  idleHeartbeatSec: string;
  headersOnly: boolean;
  maxRequestBatch: string;
  maxRequestExpiresSec: string;
  maxRequestMaxBytes: string;
  deliverSubject: string;
  deliverGroup: string;
  inactiveThresholdSec: string;
  replicas: string;
  memoryStorage: boolean;
  metadata: string;
};

const emptyStreamForm = (): StreamFormState => ({
  name: "",
  description: "",
  subjects: "",
  retention: 0,
  storage: 0,
  replicas: "1",
  maxConsumers: "",
  maxMsgs: "",
  maxBytes: "",
  maxAgeSec: "",
  maxMsgsPerSubject: "",
  maxMsgSize: "",
  discard: 0,
  discardNewPerSubject: false,
  allowDirect: true,
  noAck: false,
  duplicateWindowSec: "",
  sealed: false,
  denyDelete: false,
  denyPurge: false,
  allowRollup: false,
  compression: 0,
  firstSeq: "",
  allowMsgTtl: false,
  subjectDeleteMarkerTtlSec: "",
  metadata: "",
});

const emptyConsumerForm = (): ConsumerFormState => ({
  durable: "",
  description: "",
  filterSubject: "",
  filterSubjects: "",
  deliverPolicy: 0,
  optStartSeq: "",
  optStartTime: "",
  ackPolicy: 2,
  maxDeliver: "",
  maxAckPending: "",
  maxWaiting: "",
  ackWaitSec: "30",
  backoffSec: "",
  replayPolicy: 0,
  rateLimitBps: "",
  sampleFreq: "",
  flowControl: false,
  idleHeartbeatSec: "",
  headersOnly: false,
  maxRequestBatch: "",
  maxRequestExpiresSec: "",
  maxRequestMaxBytes: "",
  deliverSubject: "",
  deliverGroup: "",
  inactiveThresholdSec: "",
  replicas: "",
  memoryStorage: false,
  metadata: "",
});

const STREAM_HINTS = {
  name: "Уникальное имя стрима. После создания не меняется.",
  description: "Свободный комментарий. На работу стрима не влияет.",
  subjects:
    "Шаблоны NATS: какие сообщения попадают в стрим. Несколько значений — через запятую или новую строку.",
  retention:
    "Когда NATS может удалять сообщения: по лимитам (limits), пока они нужны consumers (interest), или как очередь задач (workqueue).",
  storage: "Где хранить данные. File переживает рестарт, Memory быстрее, но теряется при перезапуске.",
  discard:
    "Что делать при достижении лимита: вытеснять самые старые (old) или отклонять новые публикации (new).",
  discardNewPerSubject:
    "Лимит Discard New считать отдельно по каждому subject, а не по стриму целиком.",
  msgs: "Сколько сообщений сейчас лежит в стриме.",
  bytes: "Суммарный объём тел сообщений на диске или в памяти.",
  consumers: "Сколько consumer'ов подписано на этот стрим.",
  numSubjects: "Сколько уникальных subject среди сообщений в стриме.",
  firstSeq: "Sequence number самого старого сообщения, которое ещё хранится.",
  lastSeq: "Sequence number последнего записанного сообщения.",
  firstTs: "Время первого сообщения, которое ещё есть в стриме.",
  lastTs: "Время последней записи в стрим.",
  numDeleted: "Сообщения, вырезанные из стрима. Из-за них в нумерации seq появляются дыры.",
  maxMsgs: "Максимум сообщений в стриме. Пусто — без лимита.",
  maxBytes: "Максимальный объём стрима. Пусто — без лимита.",
  maxAge: "Как долго хранить сообщение. 0 — без ограничения по времени.",
  maxConsumers: "Потолок числа consumer'ов. Пусто — без лимита.",
  maxMsgsPerSubject: "Сколько сообщений держать по одному subject.",
  maxMsgSize: "Максимальный размер одного сообщения в байтах.",
  replicas: "Сколько копий стрима в кластере JetStream. 1 — без репликации.",
  compression: "Сжимать ли блоки на диске. S2 экономит место, чуть грузит CPU.",
  duplicateWindow:
    "Окно дедупликации по заголовку Nats-Msg-Id. Повтор с тем же id внутри окна отбрасывается.",
  firstSeqCfg: "С какого sequence начать нумерацию при создании стрима.",
  allowDirect: "Читать сообщения по seq или last напрямую, минуя consumer.",
  noAck: "Публиковать без подтверждения JetStream. Быстрее, но сообщение можно потерять.",
  sealed: "Стрим закрыт: нельзя писать и менять конфигурацию.",
  denyDelete: "Запретить удаление отдельных сообщений.",
  denyPurge: "Запретить очистку (purge) всего стрима.",
  allowRollup: "Разрешить заголовок Nats-Rollup: свернуть историю subject до одного сообщения.",
  allowMsgTtl: "Разрешить TTL на отдельные сообщения через заголовок Nats-TTL.",
  subjectDeleteMarkerTtl: "Как долго хранить маркер удаления subject после rollup или TTL.",
  metadata: "Произвольные пары ключ=значение. На логику JetStream не влияют.",
  cluster: "Raft-группа стрима и текущий лидер, который принимает записи.",
  created: "Когда стрим создали на сервере.",
} as const;

const CONSUMER_HINTS = {
  durable: "Постоянное имя consumer. После создания не меняется.",
  description: "Свободный комментарий. На доставку не влияет.",
  filterSubject: "Один subject-фильтр. Пусто — все subjects стрима.",
  filterSubjects: "Несколько фильтров через запятую или новую строку. Имеет приоритет над одним filter subject.",
  deliverPolicy: "Откуда начать читать: все сообщения, только новые, с seq или с времени.",
  optStartSeq: "Начальный sequence при политике By start sequence.",
  optStartTime: "Начальное время (RFC3339) при политике By start time.",
  ackPolicy: "Как подтверждать: none, all или каждое сообщение явно (explicit).",
  maxDeliver: "Сколько раз пытаться доставить одно сообщение. 0 — без лимита.",
  maxAckPending: "Сколько неподтверждённых сообщений можно держать одновременно.",
  maxWaiting: "Максимум ожидающих pull-запросов.",
  ackWait: "Сколько ждать ack, прежде чем сообщение вернётся в pending.",
  backoff: "Паузы между повторными доставками, секунды через запятую.",
  replayPolicy: "Скорость воспроизведения истории: сразу (instant) или как писали (original).",
  rateLimitBps: "Ограничение скорости доставки в байтах в секунду.",
  sampleFreq: "Доля сообщений для sampling, например 100%.",
  flowControl: "Flow control для push-consumer.",
  idleHeartbeat: "Интервал heartbeat при простое, секунды.",
  headersOnly: "Доставлять только заголовки, без тела сообщения.",
  maxRequestBatch: "Максимальный batch в одном pull-запросе.",
  maxRequestExpires: "Максимальный expire pull-запроса, секунды.",
  maxRequestMaxBytes: "Максимальный объём ответа на pull-запрос, байт.",
  deliverSubject: "Push: куда публиковать сообщения. Пусто — pull consumer.",
  deliverGroup: "Queue group для push-consumer.",
  inactiveThreshold: "Через сколько секунд простоя удалить ephemeral consumer.",
  replicas: "Число реплик consumer. 0 — как у стрима.",
  memoryStorage: "Держать состояние consumer в памяти, а не на диске.",
  metadata: "Произвольные пары ключ=значение.",
} as const;

function limitText(value: number, format?: (n: number) => string): string {
  if (!value || value < 0) return "без лимита";
  return format ? format(value) : value.toLocaleString("ru-RU");
}

function streamFormFrom(stream: NatsStream): StreamFormState {
  return {
    name: stream.name,
    description: stream.description,
    subjects: joinSubjects(stream.subjects),
    retention: stream.retention,
    storage: stream.storage,
    replicas: String(stream.replicas || 1),
    maxConsumers: stream.max_consumers ? String(stream.max_consumers) : "",
    maxMsgs: stream.max_msgs ? String(stream.max_msgs) : "",
    maxBytes: stream.max_bytes ? String(stream.max_bytes) : "",
    maxAgeSec: nsToSecInput(stream.max_age),
    maxMsgsPerSubject: stream.max_msgs_per_subject ? String(stream.max_msgs_per_subject) : "",
    maxMsgSize: stream.max_msg_size ? String(stream.max_msg_size) : "",
    discard: stream.discard,
    discardNewPerSubject: stream.discard_new_per_subject,
    allowDirect: stream.allow_direct,
    noAck: stream.no_ack,
    duplicateWindowSec: nsToSecInput(stream.duplicate_window),
    sealed: stream.sealed,
    denyDelete: stream.deny_delete,
    denyPurge: stream.deny_purge,
    allowRollup: stream.allow_rollup,
    compression: stream.compression,
    firstSeq: stream.first_seq_cfg ? String(stream.first_seq_cfg) : "",
    allowMsgTtl: stream.allow_msg_ttl,
    subjectDeleteMarkerTtlSec: nsToSecInput(stream.subject_delete_marker_ttl),
    metadata: formatMetadata(stream.metadata),
  };
}

function consumerFormFrom(c: NatsConsumer): ConsumerFormState {
  return {
    durable: c.durable || c.name,
    description: c.description,
    filterSubject: c.filter_subject,
    filterSubjects: joinSubjects(c.filter_subjects),
    deliverPolicy: c.deliver_policy,
    optStartSeq: c.opt_start_seq ? String(c.opt_start_seq) : "",
    optStartTime: c.opt_start_time,
    ackPolicy: c.ack_policy,
    maxDeliver: c.max_deliver ? String(c.max_deliver) : "",
    maxAckPending: c.max_ack_pending ? String(c.max_ack_pending) : "",
    maxWaiting: c.max_waiting ? String(c.max_waiting) : "",
    ackWaitSec: nsToSecInput(c.ack_wait) || "30",
    backoffSec: (c.backoff ?? []).map((ns) => ns / 1e9).filter((n) => n > 0).join(", "),
    replayPolicy: c.replay_policy,
    rateLimitBps: c.rate_limit_bps ? String(c.rate_limit_bps) : "",
    sampleFreq: c.sample_freq,
    flowControl: c.flow_control,
    idleHeartbeatSec: nsToSecInput(c.idle_heartbeat),
    headersOnly: c.headers_only,
    maxRequestBatch: c.max_request_batch ? String(c.max_request_batch) : "",
    maxRequestExpiresSec: nsToSecInput(c.max_request_expires),
    maxRequestMaxBytes: c.max_request_max_bytes ? String(c.max_request_max_bytes) : "",
    deliverSubject: c.deliver_subject,
    deliverGroup: c.deliver_group,
    inactiveThresholdSec: nsToSecInput(c.inactive_threshold),
    replicas: c.replicas ? String(c.replicas) : "",
    memoryStorage: c.memory_storage,
    metadata: formatMetadata(c.metadata),
  };
}

function toStreamWrite(form: StreamFormState): NatsStreamWrite {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    subjects: splitSubjects(form.subjects),
    retention: Number(form.retention),
    storage: Number(form.storage),
    replicas: Number(form.replicas) || 1,
    max_consumers: Number(form.maxConsumers) || 0,
    max_msgs: Number(form.maxMsgs) || 0,
    max_bytes: Number(form.maxBytes) || 0,
    max_age: secInputToNs(form.maxAgeSec),
    max_msgs_per_subject: Number(form.maxMsgsPerSubject) || 0,
    max_msg_size: Number(form.maxMsgSize) || 0,
    discard: Number(form.discard),
    discard_new_per_subject: form.discardNewPerSubject,
    allow_direct: form.allowDirect,
    no_ack: form.noAck,
    duplicate_window: secInputToNs(form.duplicateWindowSec),
    sealed: form.sealed,
    deny_delete: form.denyDelete,
    deny_purge: form.denyPurge,
    allow_rollup: form.allowRollup,
    compression: Number(form.compression),
    first_seq_cfg: Number(form.firstSeq) || 0,
    allow_msg_ttl: form.allowMsgTtl,
    subject_delete_marker_ttl: secInputToNs(form.subjectDeleteMarkerTtlSec),
    metadata: parseMetadata(form.metadata),
  };
}

function StreamConfigFields({
  form,
  onChange,
  nameLocked,
}: {
  form: StreamFormState;
  onChange: (next: StreamFormState) => void;
  nameLocked?: boolean;
}) {
  const set = (patch: Partial<StreamFormState>) => onChange({ ...form, ...patch });

  return (
    <>
      <div className="nats-form-section">
        <span className="nats-form-section-title">Основные параметры</span>
        <div className="nats-form-grid">
          <div className="nats-field">
            <label title={STREAM_HINTS.name}>Имя стрима *</label>
            <input
              type="text"
              required
              placeholder="MY_STREAM"
              value={form.name}
              disabled={nameLocked}
              style={nameLocked ? { opacity: 0.6 } : undefined}
              onChange={(e) => set({ name: e.target.value })}
              autoFocus={!nameLocked}
            />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.description}>Описание</label>
            <input
              type="text"
              placeholder="Назначение стрима..."
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.replicas}>Реплики</label>
            <input
              type="text"
              placeholder="1"
              value={form.replicas}
              onChange={(e) => set({ replicas: e.target.value })}
            />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.firstSeqCfg}>Начальный seq (First seq)</label>
            <input
              type="text"
              placeholder="0 = по умолчанию"
              value={form.firstSeq}
              onChange={(e) => set({ firstSeq: e.target.value })}
            />
          </div>
          <div className="nats-field span-all">
            <label title={STREAM_HINTS.subjects}>Шаблоны Subjects *</label>
            <textarea
              rows={2}
              required
              placeholder={"TrB.Event.*\nTrB.Task.>"}
              value={form.subjects}
              onChange={(e) => set({ subjects: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Политики хранения</span>
        <div className="nats-form-grid">
          <div className="nats-field">
            <label title={STREAM_HINTS.retention}>Retention</label>
            <select value={form.retention} onChange={(e) => set({ retention: Number(e.target.value) })}>
              {RETENTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.storage}>Storage</label>
            <select value={form.storage} onChange={(e) => set({ storage: Number(e.target.value) })}>
              {STORAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.discard}>Discard</label>
            <select value={form.discard} onChange={(e) => set({ discard: Number(e.target.value) })}>
              {DISCARD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.compression}>Compression</label>
            <select value={form.compression} onChange={(e) => set({ compression: Number(e.target.value) })}>
              {COMPRESSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Лимиты</span>
        <div className="nats-form-grid">
          <div className="nats-field">
            <label title={STREAM_HINTS.maxMsgs}>Макс. сообщений (Max msgs)</label>
            <input type="text" placeholder="0 / пусто = без лимита" value={form.maxMsgs} onChange={(e) => set({ maxMsgs: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.maxBytes}>Макс. объём, байт (Max bytes)</label>
            <input type="text" placeholder="0 / пусто = без лимита" value={form.maxBytes} onChange={(e) => set({ maxBytes: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.maxAge}>Макс. возраст, сек (Max age)</label>
            <input type="text" placeholder="0 = без ограничения" value={form.maxAgeSec} onChange={(e) => set({ maxAgeSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.maxConsumers}>Макс. consumers</label>
            <input type="text" placeholder="пусто = без лимита" value={form.maxConsumers} onChange={(e) => set({ maxConsumers: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.maxMsgsPerSubject}>Макс. сообщений на subject</label>
            <input type="text" placeholder="0 = без лимита" value={form.maxMsgsPerSubject} onChange={(e) => set({ maxMsgsPerSubject: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.maxMsgSize}>Макс. размер сообщения, байт</label>
            <input type="text" placeholder="0 = без лимита" value={form.maxMsgSize} onChange={(e) => set({ maxMsgSize: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.duplicateWindow}>Окно дедупликации, сек</label>
            <input type="text" placeholder="например 120" value={form.duplicateWindowSec} onChange={(e) => set({ duplicateWindowSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={STREAM_HINTS.subjectDeleteMarkerTtl}>TTL маркера удаления subject, сек</label>
            <input type="text" placeholder="0 = не хранить" value={form.subjectDeleteMarkerTtlSec} onChange={(e) => set({ subjectDeleteMarkerTtlSec: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Флаги</span>
        <div className="nats-check-grid">
          {(
            [
              ["allowDirect", "Allow Direct", STREAM_HINTS.allowDirect],
              ["noAck", "No Ack", STREAM_HINTS.noAck],
              ["discardNewPerSubject", "Discard New Per Subject", STREAM_HINTS.discardNewPerSubject],
              ["allowRollup", "Allow Rollup", STREAM_HINTS.allowRollup],
              ["allowMsgTtl", "Allow Msg TTL", STREAM_HINTS.allowMsgTtl],
              ["denyDelete", "Deny Delete", STREAM_HINTS.denyDelete],
              ["denyPurge", "Deny Purge", STREAM_HINTS.denyPurge],
              ["sealed", "Sealed", STREAM_HINTS.sealed],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="nats-check" title={hint}>
              <input type="checkbox" checked={form[key]} onChange={(e) => set({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Metadata</span>
        <div className="nats-field">
          <label title={STREAM_HINTS.metadata}>Пары ключ=значение (по одной на строку)</label>
          <textarea
            rows={3}
            placeholder={"owner=trading\n_nats.req.level=0"}
            value={form.metadata}
            onChange={(e) => set({ metadata: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

function InfoGrid({ items }: { items: { label: string; value: ReactNode; hint?: string; mono?: boolean }[] }) {
  return (
    <div className="nats-info-grid">
      {items.map((item) => (
        <div key={item.label} className="nats-info-cell" title={item.hint}>
          <span className="nats-info-lbl">{item.label}</span>
          <span className={`nats-info-val${item.mono ? " mono" : ""}`}>{item.value || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function ConsumerConfigFields({
  form,
  onChange,
  nameLocked,
}: {
  form: ConsumerFormState;
  onChange: (next: ConsumerFormState) => void;
  nameLocked?: boolean;
}) {
  const set = (patch: Partial<ConsumerFormState>) => onChange({ ...form, ...patch });

  return (
    <>
      <div className="nats-form-section">
        <span className="nats-form-section-title">Основные параметры</span>
        <div className="nats-form-grid">
          <div className="nats-field">
            <label title={CONSUMER_HINTS.durable}>Durable Name *</label>
            <input
              type="text"
              required
              placeholder="worker-group"
              value={form.durable}
              disabled={nameLocked}
              style={nameLocked ? { opacity: 0.6 } : undefined}
              onChange={(e) => set({ durable: e.target.value })}
              autoFocus={!nameLocked}
            />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.description}>Описание</label>
            <input
              type="text"
              placeholder="Обработчик задач..."
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.filterSubject}>Filter Subject</label>
            <input
              type="text"
              placeholder="TrB.Event.>"
              value={form.filterSubject}
              onChange={(e) => set({ filterSubject: e.target.value })}
            />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.replicas}>Реплики</label>
            <input type="text" placeholder="0 = как у стрима" value={form.replicas} onChange={(e) => set({ replicas: e.target.value })} />
          </div>
          <div className="nats-field span-all">
            <label title={CONSUMER_HINTS.filterSubjects}>Filter Subjects (несколько)</label>
            <textarea
              rows={2}
              placeholder={"TrB.Event.User.>\nTrB.Event.Order.>"}
              value={form.filterSubjects}
              onChange={(e) => set({ filterSubjects: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Доставка и подтверждение</span>
        <div className="nats-form-grid">
          <div className="nats-field">
            <label title={CONSUMER_HINTS.deliverPolicy}>Deliver Policy</label>
            <select value={form.deliverPolicy} onChange={(e) => set({ deliverPolicy: Number(e.target.value) })}>
              {DELIVER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.optStartSeq}>Start Seq</label>
            <input type="text" placeholder="для By start sequence" value={form.optStartSeq} onChange={(e) => set({ optStartSeq: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.optStartTime}>Start Time (RFC3339)</label>
            <input type="text" placeholder="2026-01-01T00:00:00Z" value={form.optStartTime} onChange={(e) => set({ optStartTime: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.ackPolicy}>Ack Policy</label>
            <select value={form.ackPolicy} onChange={(e) => set({ ackPolicy: Number(e.target.value) })}>
              {ACK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.replayPolicy}>Replay Policy</label>
            <select value={form.replayPolicy} onChange={(e) => set({ replayPolicy: Number(e.target.value) })}>
              {REPLAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.ackWait}>Ack Wait, сек</label>
            <input type="text" value={form.ackWaitSec} onChange={(e) => set({ ackWaitSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.maxDeliver}>Max Deliver</label>
            <input type="text" placeholder="0 = без лимита" value={form.maxDeliver} onChange={(e) => set({ maxDeliver: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.maxAckPending}>Max Ack Pending</label>
            <input type="text" placeholder="0 = по умолчанию" value={form.maxAckPending} onChange={(e) => set({ maxAckPending: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.maxWaiting}>Max Waiting</label>
            <input type="text" placeholder="0 = по умолчанию" value={form.maxWaiting} onChange={(e) => set({ maxWaiting: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.backoff}>Backoff, сек (через запятую)</label>
            <input type="text" placeholder="1, 5, 30" value={form.backoffSec} onChange={(e) => set({ backoffSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.rateLimitBps}>Rate Limit, байт/с</label>
            <input type="text" placeholder="0 = без лимита" value={form.rateLimitBps} onChange={(e) => set({ rateLimitBps: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.sampleFreq}>Sample Freq</label>
            <input type="text" placeholder="100%" value={form.sampleFreq} onChange={(e) => set({ sampleFreq: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Push / Pull</span>
        <div className="nats-form-grid">
          <div className="nats-field">
            <label title={CONSUMER_HINTS.deliverSubject}>Deliver Subject (push)</label>
            <input type="text" placeholder="пусто = pull" value={form.deliverSubject} onChange={(e) => set({ deliverSubject: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.deliverGroup}>Deliver Group</label>
            <input type="text" placeholder="queue group" value={form.deliverGroup} onChange={(e) => set({ deliverGroup: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.idleHeartbeat}>Idle Heartbeat, сек</label>
            <input type="text" value={form.idleHeartbeatSec} onChange={(e) => set({ idleHeartbeatSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.inactiveThreshold}>Inactive Threshold, сек</label>
            <input type="text" value={form.inactiveThresholdSec} onChange={(e) => set({ inactiveThresholdSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.maxRequestBatch}>Max Request Batch</label>
            <input type="text" value={form.maxRequestBatch} onChange={(e) => set({ maxRequestBatch: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.maxRequestExpires}>Max Request Expires, сек</label>
            <input type="text" value={form.maxRequestExpiresSec} onChange={(e) => set({ maxRequestExpiresSec: e.target.value })} />
          </div>
          <div className="nats-field">
            <label title={CONSUMER_HINTS.maxRequestMaxBytes}>Max Request Bytes</label>
            <input type="text" value={form.maxRequestMaxBytes} onChange={(e) => set({ maxRequestMaxBytes: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Флаги</span>
        <div className="nats-check-grid">
          {(
            [
              ["flowControl", "Flow Control", CONSUMER_HINTS.flowControl],
              ["headersOnly", "Headers Only", CONSUMER_HINTS.headersOnly],
              ["memoryStorage", "Memory Storage", CONSUMER_HINTS.memoryStorage],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="nats-check" title={hint}>
              <input type="checkbox" checked={form[key]} onChange={(e) => set({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="nats-form-section">
        <span className="nats-form-section-title">Metadata</span>
        <div className="nats-field">
          <label title={CONSUMER_HINTS.metadata}>Пары ключ=значение (по одной на строку)</label>
          <textarea
            rows={3}
            placeholder={"owner=trading\n_nats.req.level=0"}
            value={form.metadata}
            onChange={(e) => set({ metadata: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

function toConsumerWrite(form: ConsumerFormState): NatsConsumerWrite {
  const durable = form.durable.trim();
  return {
    durable,
    name: durable,
    description: form.description.trim(),
    filter_subject: form.filterSubject.trim(),
    filter_subjects: splitSubjects(form.filterSubjects),
    deliver_policy: Number(form.deliverPolicy),
    opt_start_seq: Number(form.optStartSeq) || 0,
    opt_start_time: form.optStartTime.trim(),
    ack_policy: Number(form.ackPolicy),
    max_deliver: Number(form.maxDeliver) || 0,
    max_ack_pending: Number(form.maxAckPending) || 0,
    max_waiting: Number(form.maxWaiting) || 0,
    ack_wait: secInputToNs(form.ackWaitSec),
    backoff: splitSubjects(form.backoffSec).map((s) => secInputToNs(s)).filter((n) => n > 0),
    replay_policy: Number(form.replayPolicy),
    rate_limit_bps: Number(form.rateLimitBps) || 0,
    sample_freq: form.sampleFreq.trim(),
    flow_control: form.flowControl,
    idle_heartbeat: secInputToNs(form.idleHeartbeatSec),
    headers_only: form.headersOnly,
    max_request_batch: Number(form.maxRequestBatch) || 0,
    max_request_expires: secInputToNs(form.maxRequestExpiresSec),
    max_request_max_bytes: Number(form.maxRequestMaxBytes) || 0,
    deliver_subject: form.deliverSubject.trim(),
    deliver_group: form.deliverGroup.trim(),
    inactive_threshold: secInputToNs(form.inactiveThresholdSec),
    replicas: Number(form.replicas) || 0,
    memory_storage: form.memoryStorage,
    metadata: parseMetadata(form.metadata),
  };
}

function jsonFileName(prefix: string, id: string): string {
  const safe = id.replace(/[^\w.-]+/g, "_") || "settings";
  return `${prefix}-${safe}.json`;
}

function previewText(value: string, max = 80): string {
  const one = value.replace(/\s+/g, " ").trim();
  if (!one) return "—";
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="nats-modal-backdrop" onClick={onClose}>
      {children}
    </div>
  );
}

export default function NatsAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  const [activeTab, setActiveTab] = useState<MainTab>("explorer");
  const [streamDetailTab, setStreamDetailTab] = useState<StreamDetailTab>("overview");

  const [account, setAccount] = useState<NatsAccount | null>(null);
  const [streams, setStreams] = useState<NatsStream[]>([]);
  const [selectedStreamName, setSelectedStreamName] = useState("");
  const [streamDetail, setStreamDetail] = useState<NatsStream | null>(null);

  const [consumers, setConsumers] = useState<NatsConsumer[]>([]);
  const [consumersLoading, setConsumersLoading] = useState(false);
  const [selectedConsumerName, setSelectedConsumerName] = useState("");

  const [streamFilter, setStreamFilter] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");

  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Forms
  const [streamForm, setStreamForm] = useState<StreamFormState>(emptyStreamForm);
  const [consumerForm, setConsumerForm] = useState<ConsumerFormState>(emptyConsumerForm);
  const [publishForm, setPublishForm] = useState({ subject: "", data: "" });
  const [copiedKey, setCopiedKey] = useState("");

  // Messages Pagination & Filters
  const [msgPage, setMsgPage] = useState(1);
  const [msgPageSize, setMsgPageSize] = useState(25);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgSeqFrom, setMsgSeqFrom] = useState("");
  const [msgSeqTo, setMsgSeqTo] = useState("");
  const [msgPayload, setMsgPayload] = useState("");
  const [msgHideMissing, setMsgHideMissing] = useState(true);
  const [msgRows, setMsgRows] = useState<NatsMessageRow[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const selectedStream = useMemo(
    () => streamDetail ?? streams.find((s) => s.name === selectedStreamName) ?? null,
    [streamDetail, streams, selectedStreamName],
  );

  const selectedConsumer = useMemo(
    () => consumers.find((c) => (c.durable || c.name) === selectedConsumerName) ?? null,
    [consumers, selectedConsumerName],
  );

  const filteredStreams = useMemo(() => {
    const q = streamFilter.trim().toLowerCase();
    if (!q) return streams;
    return streams.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.subjects.some((sub) => sub.toLowerCase().includes(q)),
    );
  }, [streams, streamFilter]);

  const msgWindow = useMemo(() => {
    const first = selectedStream?.first_seq ?? 0;
    const last = selectedStream?.last_seq ?? 0;
    if (!selectedStream || last <= 0 || last < first) {
      return { start: 0, end: 0, span: 0, pages: 1, from: 0, to: 0 };
    }
    let rangeStart = Number(msgSeqFrom);
    let rangeEnd = Number(msgSeqTo);
    if (!Number.isFinite(rangeStart) || rangeStart <= 0) rangeStart = first;
    if (!Number.isFinite(rangeEnd) || rangeEnd <= 0) rangeEnd = last;
    rangeStart = Math.max(first, Math.floor(rangeStart));
    rangeEnd = Math.min(last, Math.floor(rangeEnd));
    if (rangeEnd < rangeStart) {
      return { start: 0, end: 0, span: 0, pages: 1, from: 0, to: 0 };
    }
    const span = rangeEnd - rangeStart + 1;
    const pages = Math.max(1, Math.ceil(span / msgPageSize));
    const page = Math.min(Math.max(1, msgPage), pages);
    const end = rangeEnd - (page - 1) * msgPageSize;
    const start = Math.max(rangeStart, end - msgPageSize + 1);
    return { start, end, span, pages, from: rangeStart, to: rangeEnd };
  }, [selectedStream, msgSeqFrom, msgSeqTo, msgPage, msgPageSize]);

  const visibleMsgRows = useMemo(() => {
    const subject = msgSubject.trim().toLowerCase();
    const payload = msgPayload.trim().toLowerCase();
    return [...msgRows]
      .sort((a, b) => b.seq - a.seq)
      .filter((row) => {
        if (msgHideMissing && !row.msg) return false;
        if (subject && !row.msg?.subject.toLowerCase().includes(subject)) return false;
        if (payload && !row.msg?.data.toLowerCase().includes(payload)) return false;
        return true;
      });
  }, [msgRows, msgSubject, msgPayload, msgHideMissing]);

  const copyText = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  }, []);

  const run = useCallback(async (action: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await action();
      if (ok) notify.success(ok);
    } catch (e) {
      if (e instanceof Error && e.message === "cancelled") return;
      notify.error(e instanceof Error ? e.message : "Ошибка NATS");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const loadOverview = useCallback(async (opts?: { select?: string; keepSelection?: boolean; viaInfo?: boolean; fresh?: boolean }) => {
    setLoading(true);
    try {
      const fetchOpts = opts?.fresh ? { fresh: true } : undefined;
      const [acc, items] = await Promise.all([
        fetchAccount(fetchOpts),
        opts?.viaInfo ? fetchStreamsInfo(fetchOpts) : fetchStreams(fetchOpts),
      ]);
      setAccount(acc);
      setStreams(items);
      setSelectedStreamName((prev) => {
        if (opts?.select) return opts.select;
        if (opts?.keepSelection === false) return items[0]?.name || "";
        if (prev && items.some((s) => s.name === prev)) return prev;
        return items[0]?.name || "";
      });
      notify.clear();
      if (opts?.fresh) {
        setStreamDetail((prev) => {
          const name = opts.select || prev?.name;
          if (!name) return prev;
          return items.find((s) => s.name === name) ?? prev;
        });
        notify.success("Список стримов обновлён");
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Не удалось загрузить NATS");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadConsumersForStream = useCallback(async (name: string) => {
    if (!name) return;
    setConsumersLoading(true);
    try {
      const cons = await fetchConsumers(name);
      setConsumers(cons);
    } catch (e) {
      setConsumers([]);
      notify.error(e instanceof Error ? e.message : "Не удалось загрузить consumers");
    } finally {
      setConsumersLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!selectedStreamName) {
      setStreamDetail(null);
      setConsumers([]);
      setSelectedConsumerName("");
      return;
    }
    const found = streams.find((s) => s.name === selectedStreamName);
    if (found) {
      setStreamDetail(found);
      setStreamForm(streamFormFrom(found));
    }
    void loadConsumersForStream(selectedStreamName);
    setSelectedConsumerName("");
  }, [selectedStreamName, loadConsumersForStream]);

  useEffect(() => {
    setMsgPage(1);
    setMsgRows([]);
  }, [selectedStreamName]);

  useEffect(() => {
    if (streamDetailTab !== "messages" || !selectedStreamName || msgWindow.span <= 0) {
      if (streamDetailTab !== "messages") return;
      setMsgRows([]);
      setMsgLoading(false);
      return;
    }
    let cancelled = false;
    setMsgLoading(true);
    fetchMessageRange(selectedStreamName, msgWindow.start, msgWindow.end)
      .then((rows) => {
        if (!cancelled) setMsgRows(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setMsgRows([]);
          notify.error(e instanceof Error ? e.message : "Не удалось загрузить сообщения");
        }
      })
      .finally(() => {
        if (!cancelled) setMsgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [streamDetailTab, selectedStreamName, msgWindow.start, msgWindow.end, msgWindow.span, notify]);

  useEffect(() => {
    if (msgPage > msgWindow.pages) setMsgPage(msgWindow.pages);
  }, [msgPage, msgWindow.pages]);

  function onSaveStream(e: FormEvent) {
    e.preventDefault();
    const body = toStreamWrite(streamForm);
    if (!body.name || body.subjects.length === 0) {
      notify.error("Укажите имя стрима и хотя бы один subject");
      return;
    }
    const isUpdate = dialog?.kind !== "create-stream" && Boolean(selectedStream && selectedStream.name === body.name);
    void run(async () => {
      const saved = isUpdate
        ? await updateStream(body.name!, body)
        : await createStream(body);
      setDialog(null);
      await loadOverview({ select: saved.name, fresh: true });
    }, isUpdate ? `Стрим ${body.name} обновлён` : `Стрим ${body.name} создан`);
  }

  function onSaveConsumer(e: FormEvent) {
    e.preventDefault();
    if (!selectedStreamName) {
      notify.error("Сначала выберите стрим");
      return;
    }
    const body = toConsumerWrite(consumerForm);
    if (!body.durable) {
      notify.error("Укажите durable-имя consumer");
      return;
    }
    const isUpdate = dialog?.kind === "edit-consumer";
    void run(async () => {
      if (isUpdate) {
        await updateConsumer(selectedStreamName, body);
      } else {
        await createConsumer(selectedStreamName, body);
      }
      setDialog(null);
      await loadConsumersForStream(selectedStreamName);
      await loadOverview();
    }, isUpdate ? `Consumer ${body.durable} обновлён` : `Consumer ${body.durable} создан`);
  }

  function onPublish(e: FormEvent) {
    e.preventDefault();
    const subject = publishForm.subject.trim();
    if (!subject) {
      notify.error("Укажите subject");
      return;
    }
    void run(async () => {
      await publishMessage(subject, publishForm.data);
      setPublishForm((prev) => ({ ...prev, data: "" }));
      await loadOverview({ fresh: true });
    }, `Опубликовано в ${subject}`);
  }

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const subject = subjectQuery.trim();
    if (!subject) return;
    void run(async () => {
      const name = await streamNameBySubject(subject);
      setSelectedStreamName(name);
      setStreamDetailTab("overview");
      notify.success(`Subject «${subject}» → стрим ${name}`);
    });
  }

  async function applySettingsFile(file: NatsSettingsFile, okPrefix: string) {
    const result = await applyNatsSettings(file);
    await loadOverview({ keepSelection: false, fresh: true });
    if (result.errors.length) {
      throw new Error(`${formatApplyResult(result)}. ${result.errors[0]}`);
    }
    notify.success(`${okPrefix}: ${formatApplyResult(result)}`);
  }

  function onExportJson() {
    void run(async () => {
      const file = await collectNatsSettings();
      downloadJson("nats-settings.json", file);
      notify.success(`Выгружено стримов: ${file.streams.length}`);
    });
  }

  function onExportStreamRow(stream: NatsStream) {
    downloadJson(
      jsonFileName("stream", stream.name),
      buildNatsSettings([{ config: streamToWrite(stream), consumers: [] }]),
    );
    notify.success(`Стрим ${stream.name} выгружен`);
  }

  function onExportConsumersRow(stream: NatsStream) {
    void run(async () => {
      const cons = (await fetchConsumers(stream.name)).map(consumerToWrite);
      downloadJson(
        jsonFileName("consumers", stream.name),
        buildNatsSettings([{ config: streamToWrite(stream), consumers: cons }]),
      );
      notify.success(`Consumers ${stream.name}: ${cons.length}`);
    });
  }

  function onImportJson() {
    void (async () => {
      let raw: unknown;
      try {
        raw = await readJsonFile();
      } catch (error) {
        if (error instanceof Error && error.message === "cancelled") return;
        notify.error(error instanceof Error ? error.message : "Не удалось прочитать JSON");
        return;
      }
      void run(async () => {
        const parsed = parseNatsJson(raw);
        if (parsed.kind === "consumer") {
          const stream = parsed.stream;
          if (!stream) {
            throw new Error("JSON consumer без имени стрима");
          }
          const current = await fetchStream(stream, { fresh: true });
          await applySettingsFile(
            buildNatsSettings([{ config: streamToWrite(current), consumers: [parsed.config] }]),
            "Настройки применены",
          );
          return;
        }
        const file =
          parsed.kind === "settings"
            ? parsed.file
            : buildNatsSettings([{ config: parsed.config, consumers: parsed.consumers }]);
        await applySettingsFile(file, "Настройки применены");
      });
    })();
  }

  return (
    <div className="nats-panel">
      {/* Header Bar */}
      <header className="nats-header">
        <div className="nats-title-wrap">
          <h1>NATS JetStream Studio</h1>
          <div className={`nats-live-indicator ${account ? "" : "is-offline"}`}>
            <span className="dot" />
            {account ? "Connected" : loading ? "Connecting..." : "Offline"}
          </div>
        </div>

        {account && (
          <div className="nats-stats-ribbon">
            <span className="nats-chip" title="Стримы на аккаунте / лимит">
              <span className="label">стримы</span>
              <strong>{account.streams}{account.max_streams > 0 ? ` / ${account.max_streams}` : ""}</strong>
            </span>
            <span className="nats-chip" title="Consumers / лимит">
              <span className="label">cons</span>
              <strong>{account.consumers}{account.max_consumers > 0 ? ` / ${account.max_consumers}` : ""}</strong>
            </span>
            <span className="nats-chip" title="Память JetStream">
              <span className="label">ram</span>
              <strong>{formatBytes(account.memory)}</strong>
            </span>
            <span className="nats-chip" title="Диск JetStream">
              <span className="label">диск</span>
              <strong>{formatBytes(account.storage)}</strong>
            </span>
            <span className="nats-chip" title="Запросы к JetStream API этого аккаунта и ошибки">
              <span className="label">js api</span>
              <strong>{account.api_total} / {account.api_errors}</strong>
            </span>
          </div>
        )}

        <div className="nats-header-actions">
          {/* Main Nav Tabs inside Header Actions */}
          <nav className="nats-nav-tabs">
            <button
              type="button"
              className={`nats-nav-tab ${activeTab === "explorer" ? "is-active" : ""}`}
              onClick={() => setActiveTab("explorer")}
            >
              🗂 Стримы
              <span className="nats-tab-badge">{streams.length}</span>
            </button>
            <button
              type="button"
              className={`nats-nav-tab ${activeTab === "publish" ? "is-active" : ""}`}
              onClick={() => setActiveTab("publish")}
            >
              📤 Публикация
            </button>
            <button
              type="button"
              className={`nats-nav-tab ${activeTab === "system" ? "is-active" : ""}`}
              onClick={() => setActiveTab("system")}
            >
              ⚙️ Бэкапы
            </button>
          </nav>

          <button
            type="button"
            className="secondary-btn sm"
            disabled={loading || busy}
            onClick={() => void loadOverview({ fresh: true })}
            title="Обновить данные NATS"
          >
            🔄 Обновить
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="nats-content">
        {/* ================= TAB 1: EXPLORER ================= */}
        {activeTab === "explorer" && (
          <div className="nats-explorer">
            {/* Left Pane: Streams List */}
            <section className="nats-pane">
              <div className="nats-pane-header">
                <h3>🌊 Стримы ({filteredStreams.length})</h3>
                <button
                  type="button"
                  className="primary-btn sm"
                  onClick={() => {
                    setStreamForm(emptyStreamForm());
                    setDialog({ kind: "create-stream" });
                  }}
                  title="Создать новый стрим"
                >
                  + Стрим
                </button>
              </div>

              <div className="nats-search-box">
                <input
                  type="text"
                  placeholder="Поиск стримов, subjects..."
                  value={streamFilter}
                  onChange={(e) => setStreamFilter(e.target.value)}
                />
                {streamFilter && (
                  <button type="button" className="nats-search-clear" onClick={() => setStreamFilter("")}>
                    ✕
                  </button>
                )}
              </div>

              <div className="nats-tree-list">
                {filteredStreams.map((stream) => {
                  const isSelected = stream.name === selectedStreamName;
                  return (
                    <div
                      key={stream.name}
                      className={`nats-tree-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedStreamName(stream.name);
                        setStreamDetail(stream);
                        setStreamForm(streamFormFrom(stream));
                      }}
                    >
                      <div className="nats-tree-item-main">
                        <span className="nats-tree-name">
                          {stream.storage === 1 ? "💾" : "📁"} {stream.name}
                        </span>
                        <span className={`nats-tag ${stream.storage === 1 ? "is-mem" : ""}`}>
                          {stream.storage === 1 ? "Memory" : "File"}
                        </span>
                      </div>
                      <div className="nats-tree-item-meta">
                        <span>{stream.msgs.toLocaleString()} msgs</span>
                        <span>• {formatBytes(stream.bytes)}</span>
                        <span>• {stream.consumer_count} cons</span>
                        {!stream.deny_delete && (
                          <button
                            type="button"
                            className="danger-btn sm"
                            style={{ marginLeft: "auto", padding: "0.1rem 0.35rem", fontSize: "0.7rem", lineHeight: 1 }}
                            title={`Удалить стрим ${stream.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialog({
                                kind: "confirm-danger",
                                title: `Удаление стрима ${stream.name}`,
                                prompt: `Вы действительно хотите удалить стрим "${stream.name}" вместе со всеми сообщениями и consumers?`,
                                actionName: "Удалить стрим",
                                onConfirm: async () => {
                                  await deleteStream(stream.name);
                                  await loadOverview({ keepSelection: false, fresh: true });
                                },
                              });
                            }}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Right Pane: Stream Detail */}
            <section className="nats-pane nats-stream-detail">
              {selectedStream ? (
                <>
                  <div className="nats-stream-detail-header">
                    <div className="nats-stream-title-row">
                      <div className="nats-stream-title-left">
                        <h2>{selectedStream.name}</h2>
                        <span className={`nats-tag ${selectedStream.storage === 1 ? "is-mem" : ""}`}>
                          {enumLabel(STORAGE_OPTIONS, selectedStream.storage)}
                        </span>
                        <span className="nats-tag">
                          {enumLabel(RETENTION_OPTIONS, selectedStream.retention)}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary-btn sm"
                          disabled={busy || selectedStream.deny_purge}
                          onClick={() => {
                            setDialog({
                              kind: "confirm-danger",
                              title: `Очистка стрима ${selectedStream.name}`,
                              prompt: `Очистить все сообщения в стриме "${selectedStream.name}"? Конфигурация стрима и consumers сохранятся.`,
                              actionName: "Очистить сообщения (Purge)",
                              onConfirm: async () => {
                                await purgeStream(selectedStream.name);
                                await loadOverview({ fresh: true });
                              },
                            });
                          }}
                          title={selectedStream.deny_purge ? STREAM_HINTS.denyPurge : "Очистить все сообщения в стриме"}
                        >
                          🧹 Purge
                        </button>
                        <button
                          type="button"
                          className="secondary-btn sm"
                          onClick={() => onExportStreamRow(selectedStream)}
                          title="Скачать JSON-конфиг стрима"
                        >
                          📥 Экспорт JSON
                        </button>
                        {!selectedStream.deny_delete && (
                          <button
                            type="button"
                            className="danger-btn sm"
                            disabled={busy}
                            onClick={() => {
                              setDialog({
                                kind: "confirm-danger",
                                title: `Удаление стрима ${selectedStream.name}`,
                                prompt: `Вы действительно хотите удалить стрим "${selectedStream.name}" со всеми сообщениями и consumers?`,
                                actionName: "Удалить стрим",
                                onConfirm: async () => {
                                  await deleteStream(selectedStream.name);
                                  await loadOverview({ keepSelection: false, fresh: true });
                                },
                              });
                            }}
                          >
                            🗑 Удалить
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedStream.description && (
                      <p className="nats-stream-desc">{selectedStream.description}</p>
                    )}

                    <div className="nats-stream-stats-bar">
                      <div className="stat-item">
                        <span className="lbl">Сообщения:</span>
                        <span className="val">{selectedStream.msgs.toLocaleString()}</span>
                      </div>
                      <div className="stat-item">
                        <span className="lbl">Размер:</span>
                        <span className="val">{formatBytes(selectedStream.bytes)}</span>
                      </div>
                      <div className="stat-item">
                        <span className="lbl">Seq:</span>
                        <span className="val">{selectedStream.first_seq} .. {selectedStream.last_seq}</span>
                      </div>
                      <div className="stat-item">
                        <span className="lbl">Consumers:</span>
                        <span className="val">{selectedStream.consumer_count}</span>
                      </div>
                      <div className="stat-item">
                        <span className="lbl">Subjects:</span>
                        <span className="val">{selectedStream.num_subjects}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sub-nav inside stream view */}
                  <div className="nats-sub-nav">
                    <button
                      type="button"
                      className={`nats-sub-tab ${streamDetailTab === "overview" ? "is-active" : ""}`}
                      onClick={() => setStreamDetailTab("overview")}
                    >
                      📊 Обзор
                    </button>
                    <button
                      type="button"
                      className={`nats-sub-tab ${streamDetailTab === "config" ? "is-active" : ""}`}
                      onClick={() => {
                        setStreamForm(streamFormFrom(selectedStream));
                        setStreamDetailTab("config");
                      }}
                    >
                      ⚙️ Конфигурация
                    </button>
                    <button
                      type="button"
                      className={`nats-sub-tab ${streamDetailTab === "consumers" ? "is-active" : ""}`}
                      onClick={() => {
                        setStreamDetailTab("consumers");
                        loadConsumersForStream(selectedStream.name);
                      }}
                    >
                      👥 Consumers ({consumers.length})
                    </button>
                    <button
                      type="button"
                      className={`nats-sub-tab ${streamDetailTab === "messages" ? "is-active" : ""}`}
                      onClick={() => setStreamDetailTab("messages")}
                    >
                      ✉️ Сообщения ({selectedStream.msgs.toLocaleString()})
                    </button>
                    <button
                      type="button"
                      className={`nats-sub-tab ${streamDetailTab === "json" ? "is-active" : ""}`}
                      onClick={() => setStreamDetailTab("json")}
                    >
                      📜 JSON
                    </button>
                  </div>

                  {/* Sub-view Area */}
                  <div className="nats-sub-view">
                    {/* Sub-tab 1: Overview */}
                    {streamDetailTab === "overview" && (
                      <div className="nats-overview-view">
                        <div className="nats-stats-grid">
                          <div className="nats-stat-card">
                            <span className="nats-stat-lbl">Сообщения</span>
                            <span className="nats-stat-val">{selectedStream.msgs.toLocaleString()}</span>
                            <span className="nats-stat-sub">{limitText(selectedStream.max_msgs, (n) => `лимит ${n.toLocaleString()}`)}</span>
                            {selectedStream.max_msgs > 0 && (
                              <div className="nats-progress-bar">
                                <div
                                  className={`nats-progress-fill ${selectedStream.msgs / selectedStream.max_msgs > 0.85 ? "is-danger" : ""}`}
                                  style={{ width: `${Math.min(100, (selectedStream.msgs / selectedStream.max_msgs) * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>

                          <div className="nats-stat-card">
                            <span className="nats-stat-lbl">Объём хранилища</span>
                            <span className="nats-stat-val">{formatBytes(selectedStream.bytes)}</span>
                            <span className="nats-stat-sub">{limitText(selectedStream.max_bytes, (n) => `лимит ${formatBytes(n)}`)}</span>
                            {selectedStream.max_bytes > 0 && (
                              <div className="nats-progress-bar">
                                <div
                                  className={`nats-progress-fill ${selectedStream.bytes / selectedStream.max_bytes > 0.85 ? "is-danger" : ""}`}
                                  style={{ width: `${Math.min(100, (selectedStream.bytes / selectedStream.max_bytes) * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>

                          <div className="nats-stat-card">
                            <span className="nats-stat-lbl">Consumers</span>
                            <span className="nats-stat-val">{selectedStream.consumer_count}</span>
                            <span className="nats-stat-sub">{limitText(selectedStream.max_consumers, (n) => `лимит ${n}`)}</span>
                          </div>

                          <div className="nats-stat-card">
                            <span className="nats-stat-lbl">Уникальные Subjects</span>
                            <span className="nats-stat-val">{selectedStream.num_subjects}</span>
                            <span className="nats-stat-sub">{limitText(selectedStream.max_msgs_per_subject, (n) => `макс. ${n} на subject`)}</span>
                          </div>
                        </div>

                        {/* Subjects Card */}
                        <div className="nats-card">
                          <div className="nats-card-head">
                            <h4>🎯 Шаблоны Subjects ({selectedStream.subjects.length})</h4>
                          </div>
                          <div className="nats-card-body">
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                              {selectedStream.subjects.map((sub) => (
                                <span key={sub} className="nats-chip mono">
                                  {sub}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Sequence and Lifecycle */}
                        <div className="nats-card">
                          <div className="nats-card-head">
                            <h4>⏱ Последовательность & Время</h4>
                          </div>
                          <div className="nats-card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.6rem" }}>
                            <div>
                              <span style={{ fontSize: "0.72rem", color: "var(--muted, #a99bb8)", textTransform: "uppercase" }}>Первое сообщение (First Seq)</span>
                              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{selectedStream.first_seq}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted, #a99bb8)" }}>{formatDateTime(selectedStream.first_ts)}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: "0.72rem", color: "var(--muted, #a99bb8)", textTransform: "uppercase" }}>Последнее сообщение (Last Seq)</span>
                              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{selectedStream.last_seq}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted, #a99bb8)" }}>{formatDateTime(selectedStream.last_ts)}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: "0.72rem", color: "var(--muted, #a99bb8)", textTransform: "uppercase" }}>Удалено сообщений</span>
                              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>{selectedStream.num_deleted}</div>
                              <div style={{ fontSize: "0.72rem", color: "var(--muted, #a99bb8)" }}>{selectedStream.max_age > 0 ? `Max age: ${formatAgeNs(selectedStream.max_age)}` : "Без ограничения по времени"}</div>
                            </div>
                          </div>
                        </div>

                        {/* Flags Card */}
                        <div className="nats-card">
                          <div className="nats-card-head">
                            <h4>🚩 Флаги и возможности</h4>
                          </div>
                          <div className="nats-card-body">
                            <div className="nats-flags-grid">
                              {[
                                { on: selectedStream.allow_direct, label: "allow_direct (прямое чтение)", hint: STREAM_HINTS.allowDirect },
                                { on: selectedStream.no_ack, label: "no_ack (без подтверждения)", hint: STREAM_HINTS.noAck },
                                { on: selectedStream.sealed, label: "sealed (только чтение)", hint: STREAM_HINTS.sealed },
                                { on: selectedStream.deny_delete, label: "deny_delete (запрет удаления)", hint: STREAM_HINTS.denyDelete },
                                { on: selectedStream.deny_purge, label: "deny_purge (запрет очистки)", hint: STREAM_HINTS.denyPurge },
                                { on: selectedStream.allow_rollup, label: "allow_rollup", hint: STREAM_HINTS.allowRollup },
                                { on: selectedStream.allow_msg_ttl, label: "allow_msg_ttl", hint: STREAM_HINTS.allowMsgTtl },
                                { on: selectedStream.discard_new_per_subject, label: "discard_new_per_subject", hint: STREAM_HINTS.discardNewPerSubject },
                              ].map((f) => (
                                <div key={f.label} className={`nats-flag-chip ${f.on ? "is-on" : ""}`} title={f.hint}>
                                  {f.on ? "✓" : "—"} {f.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="nats-card">
                          <div className="nats-card-head">
                            <h4>⚙️ Конфигурация</h4>
                          </div>
                          <div className="nats-card-body">
                            <InfoGrid
                              items={[
                                { label: "Retention", value: enumLabel(RETENTION_OPTIONS, selectedStream.retention), hint: STREAM_HINTS.retention },
                                { label: "Storage", value: enumLabel(STORAGE_OPTIONS, selectedStream.storage), hint: STREAM_HINTS.storage },
                                { label: "Discard", value: enumLabel(DISCARD_OPTIONS, selectedStream.discard), hint: STREAM_HINTS.discard },
                                { label: "Compression", value: enumLabel(COMPRESSION_OPTIONS, selectedStream.compression), hint: STREAM_HINTS.compression },
                                { label: "Replicas", value: String(selectedStream.replicas || 1), hint: STREAM_HINTS.replicas },
                                { label: "Max msgs", value: limitText(selectedStream.max_msgs), hint: STREAM_HINTS.maxMsgs },
                                { label: "Max bytes", value: limitText(selectedStream.max_bytes, formatBytes), hint: STREAM_HINTS.maxBytes },
                                { label: "Max age", value: selectedStream.max_age > 0 ? formatAgeNs(selectedStream.max_age) : "без лимита", hint: STREAM_HINTS.maxAge },
                                { label: "Max consumers", value: limitText(selectedStream.max_consumers), hint: STREAM_HINTS.maxConsumers },
                                { label: "Max msgs / subject", value: limitText(selectedStream.max_msgs_per_subject), hint: STREAM_HINTS.maxMsgsPerSubject },
                                { label: "Max msg size", value: limitText(selectedStream.max_msg_size, formatBytes), hint: STREAM_HINTS.maxMsgSize },
                                { label: "Duplicate window", value: selectedStream.duplicate_window > 0 ? formatAgeNs(selectedStream.duplicate_window) : "по умолчанию", hint: STREAM_HINTS.duplicateWindow },
                                { label: "First seq cfg", value: selectedStream.first_seq_cfg ? String(selectedStream.first_seq_cfg) : "—", hint: STREAM_HINTS.firstSeqCfg },
                                { label: "Subject delete marker TTL", value: selectedStream.subject_delete_marker_ttl > 0 ? formatAgeNs(selectedStream.subject_delete_marker_ttl) : "—", hint: STREAM_HINTS.subjectDeleteMarkerTtl },
                                { label: "Created", value: formatDateTime(selectedStream.created), hint: STREAM_HINTS.created },
                                { label: "Cluster", value: selectedStream.cluster_name || "—", hint: STREAM_HINTS.cluster },
                                { label: "Leader", value: selectedStream.cluster_leader || "—", hint: STREAM_HINTS.cluster },
                              ]}
                            />
                          </div>
                        </div>

                        {Object.keys(selectedStream.metadata ?? {}).length > 0 && (
                          <div className="nats-card">
                            <div className="nats-card-head">
                              <h4>🏷 Metadata</h4>
                            </div>
                            <div className="nats-card-body">
                              <pre className="nats-code-box" style={{ maxHeight: "160px" }}>
                                {formatMetadata(selectedStream.metadata) || "—"}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sub-tab 2: Config / Edit */}
                    {streamDetailTab === "config" && (
                      <form className="nats-config-view" onSubmit={onSaveStream}>
                        <StreamConfigFields
                          form={streamForm}
                          onChange={setStreamForm}
                          nameLocked
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                          <button type="submit" className="primary-btn" disabled={busy}>
                            💾 Сохранить изменения
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Sub-tab 3: Consumers */}
                    {streamDetailTab === "consumers" && (
                      <div className="nats-consumers-view">
                        <div className="nats-toolbar">
                          <span style={{ fontSize: "0.8rem", color: "var(--muted, #a99bb8)" }}>
                            Подписанные Consumers на стрим {selectedStream.name}
                          </span>
                          <div className="nats-toolbar-group">
                            <button
                              type="button"
                              className="secondary-btn sm"
                              onClick={() => onExportConsumersRow(selectedStream)}
                              title="Выгрузить всех consumers в JSON"
                            >
                              📥 Экспорт Consumers
                            </button>
                            <button
                              type="button"
                              className="primary-btn sm"
                              onClick={() => {
                                setConsumerForm(emptyConsumerForm());
                                setDialog({ kind: "create-consumer" });
                              }}
                            >
                              + Новый Consumer
                            </button>
                          </div>
                        </div>

                        <div className="nats-consumers-split">
                        <div className="nats-table-wrap">
                          <table className="nats-table">
                            <thead>
                              <tr>
                                <th>Имя / Durable</th>
                                <th>Filter Subject</th>
                                <th>Ack Policy</th>
                                <th>Pending</th>
                                <th>Ack Pend.</th>
                                <th>Redelivered</th>
                                <th>Created</th>
                                <th style={{ textAlign: "right" }}>Действия</th>
                              </tr>
                            </thead>
                            <tbody>
                              {consumersLoading ? (
                                <tr>
                                  <td colSpan={8} style={{ textAlign: "center", padding: "1.5rem" }}>Загрузка consumers...</td>
                                </tr>
                              ) : consumers.length === 0 ? (
                                <tr>
                                  <td colSpan={8} style={{ textAlign: "center", padding: "1.5rem" }}>Consumers не найдены</td>
                                </tr>
                              ) : (
                                consumers.map((c) => {
                                  const name = c.durable || c.name;
                                  const isSelected = name === selectedConsumerName;
                                  return (
                                    <tr
                                      key={name}
                                      className={`is-clickable${isSelected ? " is-selected" : ""}`}
                                      tabIndex={0}
                                      aria-selected={isSelected}
                                      onClick={() => setSelectedConsumerName(name)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          setSelectedConsumerName(name);
                                        }
                                      }}
                                    >
                                      <td>
                                        <strong style={{ color: "#fff" }}>{name}</strong>
                                        {c.description && <div style={{ fontSize: "0.7rem", color: "var(--muted, #a99bb8)" }}>{c.description}</div>}
                                      </td>
                                      <td className="mono">{c.filter_subject || (c.filter_subjects?.length ? c.filter_subjects.join(", ") : "*")}</td>
                                      <td>
                                        <span className="nats-tag">{enumLabel(ACK_OPTIONS, c.ack_policy)}</span>
                                      </td>
                                      <td className="mono">{c.num_pending}</td>
                                      <td className="mono">{c.num_ack_pending}</td>
                                      <td className="mono">{c.num_redelivered}</td>
                                      <td style={{ fontSize: "0.72rem" }}>{formatDateTime(c.created)}</td>
                                      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                        <div style={{ display: "inline-flex", gap: "0.3rem" }}>
                                          <button
                                            type="button"
                                            className="secondary-btn sm"
                                            onClick={() => {
                                              setConsumerForm(consumerFormFrom(c));
                                              setDialog({ kind: "edit-consumer", consumer: c });
                                            }}
                                          >
                                            Изменить
                                          </button>
                                          <button
                                            type="button"
                                            className="danger-btn sm"
                                            onClick={() => {
                                              setDialog({
                                                kind: "confirm-danger",
                                                title: `Удаление consumer ${name}`,
                                                prompt: `Удалить consumer "${name}" из стрима "${selectedStream.name}"?`,
                                                actionName: "Удалить consumer",
                                                onConfirm: async () => {
                                                  await deleteConsumer(selectedStream.name, name);
                                                  if (selectedConsumerName === name) setSelectedConsumerName("");
                                                  await loadConsumersForStream(selectedStream.name);
                                                  await loadOverview();
                                                },
                                              });
                                            }}
                                          >
                                            🗑
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                        <aside className="nats-consumer-detail">
                          {selectedConsumer ? (
                            <>
                              <h4>{selectedConsumer.durable || selectedConsumer.name}</h4>
                              {selectedConsumer.description ? (
                                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted, #a99bb8)" }}>{selectedConsumer.description}</p>
                              ) : null}
                              <InfoGrid
                                items={[
                                  { label: "Filter", value: selectedConsumer.filter_subject || selectedConsumer.filter_subjects?.join(", ") || "*", mono: true },
                                  { label: "Deliver", value: enumLabel(DELIVER_OPTIONS, selectedConsumer.deliver_policy) },
                                  { label: "Ack", value: enumLabel(ACK_OPTIONS, selectedConsumer.ack_policy) },
                                  { label: "Replay", value: enumLabel(REPLAY_OPTIONS, selectedConsumer.replay_policy) },
                                  { label: "Start seq", value: selectedConsumer.opt_start_seq ? String(selectedConsumer.opt_start_seq) : "—" },
                                  { label: "Start time", value: selectedConsumer.opt_start_time || "—" },
                                  { label: "Pending", value: String(selectedConsumer.num_pending) },
                                  { label: "Ack pending", value: String(selectedConsumer.num_ack_pending) },
                                  { label: "Redelivered", value: String(selectedConsumer.num_redelivered) },
                                  { label: "Waiting", value: String(selectedConsumer.num_waiting) },
                                  { label: "Delivered seq", value: `${selectedConsumer.delivered_stream_seq} / ${selectedConsumer.delivered_consumer_seq}`, mono: true },
                                  { label: "Ack floor", value: `${selectedConsumer.ack_floor_stream_seq} / ${selectedConsumer.ack_floor_consumer_seq}`, mono: true },
                                  { label: "Ack wait", value: selectedConsumer.ack_wait > 0 ? formatAgeNs(selectedConsumer.ack_wait) : "—" },
                                  { label: "Backoff", value: (selectedConsumer.backoff ?? []).length ? selectedConsumer.backoff.map((ns) => formatAgeNs(ns)).join(", ") : "—" },
                                  { label: "Max deliver", value: limitText(selectedConsumer.max_deliver) },
                                  { label: "Max ack pending", value: limitText(selectedConsumer.max_ack_pending) },
                                  { label: "Max waiting", value: limitText(selectedConsumer.max_waiting) },
                                  { label: "Rate limit", value: selectedConsumer.rate_limit_bps > 0 ? `${selectedConsumer.rate_limit_bps} B/s` : "—" },
                                  { label: "Sample freq", value: selectedConsumer.sample_freq || "—" },
                                  { label: "Idle heartbeat", value: selectedConsumer.idle_heartbeat > 0 ? formatAgeNs(selectedConsumer.idle_heartbeat) : "—" },
                                  { label: "Inactive", value: selectedConsumer.inactive_threshold > 0 ? formatAgeNs(selectedConsumer.inactive_threshold) : "—" },
                                  { label: "Push subject", value: selectedConsumer.deliver_subject || "pull", mono: true },
                                  { label: "Deliver group", value: selectedConsumer.deliver_group || "—" },
                                  { label: "Replicas", value: String(selectedConsumer.replicas || 0) },
                                  { label: "Max req batch", value: limitText(selectedConsumer.max_request_batch) },
                                  { label: "Max req expires", value: selectedConsumer.max_request_expires > 0 ? formatAgeNs(selectedConsumer.max_request_expires) : "—" },
                                  { label: "Max req bytes", value: limitText(selectedConsumer.max_request_max_bytes, formatBytes) },
                                  { label: "Created", value: formatDateTime(selectedConsumer.created) },
                                ]}
                              />
                              <div className="nats-flags-grid">
                                {[
                                  { on: selectedConsumer.flow_control, label: "flow_control" },
                                  { on: selectedConsumer.headers_only, label: "headers_only" },
                                  { on: selectedConsumer.memory_storage, label: "memory_storage" },
                                  { on: selectedConsumer.push_bound, label: "push_bound" },
                                ].map((f) => (
                                  <div key={f.label} className={`nats-flag-chip ${f.on ? "is-on" : ""}`}>
                                    {f.on ? "✓" : "—"} {f.label}
                                  </div>
                                ))}
                              </div>
                              {Object.keys(selectedConsumer.metadata ?? {}).length > 0 && (
                                <pre className="nats-code-box" style={{ maxHeight: "120px" }}>
                                  {formatMetadata(selectedConsumer.metadata)}
                                </pre>
                              )}
                            </>
                          ) : (
                            <div className="nats-empty" style={{ padding: "1.2rem 0.5rem" }}>
                              <span>Нажмите на строку consumer, чтобы увидеть детали</span>
                            </div>
                          )}
                        </aside>
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 4: Messages */}
                    {streamDetailTab === "messages" && (
                      <div className="nats-messages-view">
                        <div className="nats-toolbar">
                          <div className="nats-toolbar-group">
                            <input
                              type="text"
                              placeholder="Фильтр по subject"
                              value={msgSubject}
                              onChange={(e) => setMsgSubject(e.target.value)}
                              style={{ width: "130px" }}
                            />
                            <input
                              type="text"
                              placeholder="Поиск в payload"
                              value={msgPayload}
                              onChange={(e) => setMsgPayload(e.target.value)}
                              style={{ width: "130px" }}
                            />
                            <input
                              type="text"
                              placeholder={`seq с (${selectedStream.first_seq})`}
                              value={msgSeqFrom}
                              onChange={(e) => {
                                setMsgSeqFrom(e.target.value);
                                setMsgPage(1);
                              }}
                              style={{ width: "85px" }}
                            />
                            <span>–</span>
                            <input
                              type="text"
                              placeholder={`seq по (${selectedStream.last_seq})`}
                              value={msgSeqTo}
                              onChange={(e) => {
                                setMsgSeqTo(e.target.value);
                                setMsgPage(1);
                              }}
                              style={{ width: "85px" }}
                            />
                            <select
                              value={msgPageSize}
                              onChange={(e) => {
                                setMsgPageSize(Number(e.target.value));
                                setMsgPage(1);
                              }}
                            >
                              {[10, 25, 50, 100].map((n) => (
                                <option key={n} value={n}>{n}/стр</option>
                              ))}
                            </select>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.72rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={msgHideMissing}
                                onChange={(e) => setMsgHideMissing(e.target.checked)}
                              />
                              Без удалённых
                            </label>
                          </div>

                          <div className="nats-toolbar-group">
                            <span style={{ fontSize: "0.75rem", color: "var(--muted, #a99bb8)" }}>
                              {msgLoading
                                ? "Загрузка…"
                                : msgWindow.span > 0
                                  ? `Диапазон ${msgWindow.start}–${msgWindow.end} (Стр. ${Math.min(msgPage, msgWindow.pages)}/${msgWindow.pages})`
                                  : "Нет данных"}
                            </span>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              disabled={msgLoading || msgPage <= 1}
                              onClick={() => setMsgPage((p) => Math.max(1, p - 1))}
                            >
                              ← Назад
                            </button>
                            <button
                              type="button"
                              className="secondary-btn sm"
                              disabled={msgLoading || msgPage >= msgWindow.pages}
                              onClick={() => setMsgPage((p) => p + 1)}
                            >
                              Вперёд →
                            </button>
                          </div>
                        </div>

                        <div className="nats-table-wrap">
                          <table className="nats-table">
                            <thead>
                              <tr>
                                <th style={{ width: "70px" }}>Seq</th>
                                <th>Subject</th>
                                <th>Время</th>
                                <th>Размер</th>
                                <th>Данные (Payload)</th>
                                <th style={{ textAlign: "right" }}>Действия</th>
                              </tr>
                            </thead>
                            <tbody>
                              {msgLoading ? (
                                <tr>
                                  <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem" }}>Загрузка сообщений...</td>
                                </tr>
                              ) : visibleMsgRows.length === 0 ? (
                                <tr>
                                  <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem" }}>Сообщения не найдены</td>
                                </tr>
                              ) : (
                                visibleMsgRows.map((row) => (
                                  <tr
                                    key={row.seq}
                                    style={{ cursor: row.msg ? "pointer" : "default" }}
                                    onClick={() => row.msg && setDialog({ kind: "view-message", msg: row.msg })}
                                  >
                                    <td className="mono" style={{ fontWeight: 600 }}>{row.seq}</td>
                                    <td className="mono">{row.msg?.subject || "—"}</td>
                                    <td style={{ fontSize: "0.72rem" }}>
                                      {row.msg ? formatDateTime(row.msg.time) : "удалено"}
                                    </td>
                                    <td className="mono">
                                      {row.msg ? formatBytes(new TextEncoder().encode(row.msg.data).length) : "—"}
                                    </td>
                                    <td className="mono" style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {row.msg ? previewText(row.msg.data) : "seq отсутствует"}
                                    </td>
                                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                      {row.msg && !selectedStream.deny_delete ? (
                                        <button
                                          type="button"
                                          className="danger-btn sm"
                                          disabled={busy}
                                          onClick={() => {
                                            setDialog({
                                              kind: "confirm-danger",
                                              title: `Удаление сообщения seq=${row.seq}`,
                                              prompt: `Удалить сообщение seq=${row.seq} из стрима "${selectedStream.name}"?`,
                                              actionName: "Удалить сообщение",
                                              onConfirm: async () => {
                                                await deleteMessage(selectedStream.name, row.seq);
                                                setMsgRows((prev) =>
                                                  prev.map((item) =>
                                                    item.seq === row.seq ? { seq: row.seq, msg: null } : item,
                                                  ),
                                                );
                                                await loadOverview();
                                              },
                                            });
                                          }}
                                        >
                                          🗑
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Sub-tab 5: JSON */}
                    {streamDetailTab === "json" && (
                      <div className="nats-json-view">
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="secondary-btn sm"
                            onClick={() => copyText("json", JSON.stringify(selectedStream, null, 2))}
                          >
                            {copiedKey === "json" ? "✓ Скопировано!" : "📋 Скопировать JSON"}
                          </button>
                        </div>
                        <pre className="nats-code-box">
                          {JSON.stringify(selectedStream, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="nats-empty">
                  <span className="icon">👈</span>
                  <span>Выберите стрим слева для просмотра деталей</span>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= TAB 2: PUBLISH & LOOKUP ================= */}
        {activeTab === "publish" && (
          <div className="nats-console-layout">
            {/* Left: Quick Publish */}
            <section className="nats-pane" style={{ padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="nats-pane-header" style={{ margin: "-0.85rem -0.85rem 0.5rem -0.85rem" }}>
                <h3>📤 Опубликовать сообщение (Publish)</h3>
              </div>
              <form onSubmit={onPublish} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                <div className="nats-field">
                  <label>Subject *</label>
                  <input
                    type="text"
                    required
                    placeholder="TrB.HistoricCandle.Task.AAPL.1min"
                    value={publishForm.subject}
                    onChange={(e) => setPublishForm({ ...publishForm, subject: e.target.value })}
                  />
                </div>
                <div className="nats-field">
                  <label>Данные / Payload (JSON или текст)</label>
                  <textarea
                    rows={8}
                    placeholder='{"action": "sync", "figi": "BBG000B9XRY4"}'
                    value={publishForm.data}
                    onChange={(e) => setPublishForm({ ...publishForm, data: e.target.value })}
                  />
                </div>
                <button type="submit" className="primary-btn" disabled={busy || !publishForm.subject.trim()}>
                  🚀 Опубликовать в NATS
                </button>
              </form>
            </section>

            {/* Right: Subject Lookup & Info */}
            <section className="nats-pane" style={{ padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="nats-pane-header" style={{ margin: "-0.85rem -0.85rem 0.5rem -0.85rem" }}>
                <h3>🔍 Поиск стрима по Subject (Lookup)</h3>
              </div>
              <form onSubmit={onLookup} style={{ display: "flex", gap: "0.45rem" }}>
                <input
                  type="text"
                  placeholder="Введите subject, например TrB.HistoricCandle.Task.>"
                  value={subjectQuery}
                  onChange={(e) => setSubjectQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="secondary-btn" disabled={busy || !subjectQuery.trim()}>
                  Найти стрим
                </button>
              </form>

              <div className="nats-card" style={{ marginTop: "0.5rem" }}>
                <div className="nats-card-head">
                  <h4>💡 Справка по NATS JetStream шаблонам</h4>
                </div>
                <div className="nats-card-body" style={{ fontSize: "0.8rem", color: "var(--text, #efe8f8)", lineHeight: 1.5 }}>
                  <p><strong><code>*</code> (один токен):</strong> Сопоставляется ровно с одним элементом пути. Например, <code>TrB.*.Task</code> подходит под <code>TrB.Candle.Task</code>, но не <code>TrB.Candle.Sub.Task</code>.</p>
                  <p><strong><code>&gt;</code> (все токены):</strong> Сопоставляется с любым количеством уровней в конце пути. Например, <code>TrB.HistoricCandle.&gt;</code> подходит под всё, что начинается с этого префикса.</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ================= TAB 3: SYSTEM & BACKUP ================= */}
        {activeTab === "system" && (
          <div className="nats-system-layout">
            {/* Backup / Export */}
            <div className="nats-pane" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="nats-pane-header" style={{ margin: "-1rem -1rem 0.5rem -1rem" }}>
                <h3>📦 Экспорт и Резервное копирование</h3>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted, #a99bb8)", lineHeight: 1.4 }}>
                Выгрузите полную конфигурацию всех JetStream стримов и consumers аккаунта в единый JSON-файл для резервного копирования или миграции.
              </p>
              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={onExportJson}
                style={{ alignSelf: "flex-start" }}
              >
                📥 Скачать полный nats-settings.json
              </button>
            </div>

            {/* Import / Restore */}
            <div className="nats-pane" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="nats-pane-header" style={{ margin: "-1rem -1rem 0.5rem -1rem" }}>
                <h3>📤 Импорт конфигурации (Apply JSON)</h3>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted, #a99bb8)", lineHeight: 1.4 }}>
                Загрузите JSON-файл с конфигурацией. Существующие стримы и consumers будут обновлены, отсутствующие — созданы. Сообщения не затрагиваются.
              </p>
              <button
                type="button"
                className="secondary-btn"
                disabled={busy}
                onClick={onImportJson}
                style={{ alignSelf: "flex-start" }}
              >
                📂 Выбрать и применить JSON
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODALS & DIALOGS ================= */}

      {/* 1. Create Stream Modal */}
      {dialog?.kind === "create-stream" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="nats-modal-window is-wide" onClick={(e) => e.stopPropagation()}>
            <div className="nats-modal-head">
              <h3>Создание нового стрима JetStream</h3>
              <button type="button" className="nats-modal-close" onClick={() => setDialog(null)}>✕</button>
            </div>
            <form onSubmit={onSaveStream}>
              <div className="nats-modal-body">
                <StreamConfigFields form={streamForm} onChange={setStreamForm} />
              </div>
              <div className="nats-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>Отмена</button>
                <button type="submit" className="primary-btn" disabled={busy || !streamForm.name.trim()}>Создать стрим</button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 2. Create / Edit Consumer Modal */}
      {(dialog?.kind === "create-consumer" || dialog?.kind === "edit-consumer") && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="nats-modal-window is-wide" onClick={(e) => e.stopPropagation()}>
            <div className="nats-modal-head">
              <h3>{dialog.kind === "edit-consumer" ? `Редактирование consumer ${dialog.consumer.durable || dialog.consumer.name}` : `Новый consumer в стриме ${selectedStreamName}`}</h3>
              <button type="button" className="nats-modal-close" onClick={() => setDialog(null)}>✕</button>
            </div>
            <form onSubmit={onSaveConsumer}>
              <div className="nats-modal-body">
                <ConsumerConfigFields
                  form={consumerForm}
                  onChange={setConsumerForm}
                  nameLocked={dialog.kind === "edit-consumer"}
                />
              </div>
              <div className="nats-modal-foot">
                <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>Отмена</button>
                <button type="submit" className="primary-btn" disabled={busy || !consumerForm.durable.trim()}>
                  {dialog.kind === "edit-consumer" ? "Сохранить" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* 3. View Message Modal */}
      {dialog?.kind === "view-message" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="nats-modal-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "780px" }}>
            <div className="nats-modal-head">
              <h3>Сообщение Seq #{dialog.msg.seq}</h3>
              <button type="button" className="nats-modal-close" onClick={() => setDialog(null)}>✕</button>
            </div>
            <div className="nats-modal-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--muted, #a99bb8)" }}>
                  <strong>Subject:</strong> <span className="mono" style={{ color: "#fff" }}>{dialog.msg.subject}</span>
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--muted, #a99bb8)" }}>
                  {formatDateTime(dialog.msg.time)}
                </div>
              </div>

              <div className="nats-field">
                <label>Данные сообщения (Payload):</label>
                <pre className="nats-code-box" style={{ maxHeight: "380px" }}>
                  {dialog.msg.data || "— (пустое тело)"}
                </pre>
              </div>
            </div>
            <div className="nats-modal-foot">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => copyText("msg-body", dialog.msg.data)}
              >
                {copiedKey === "msg-body" ? "✓ Скопировано!" : "📋 Скопировать тело"}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>Закрыть</button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* 4. Danger Confirmation Modal */}
      {dialog?.kind === "confirm-danger" && (
        <ModalBackdrop onClose={() => setDialog(null)}>
          <div className="nats-modal-window nats-danger-window" onClick={(e) => e.stopPropagation()}>
            <div className="nats-modal-head nats-danger-head">
              <h3>⚠️ {dialog.title}</h3>
              <button type="button" className="nats-modal-close" onClick={() => setDialog(null)}>✕</button>
            </div>
            <div className="nats-modal-body">
              <p className="nats-danger-prompt">{dialog.prompt}</p>
            </div>
            <div className="nats-modal-foot">
              <button type="button" className="secondary-btn" onClick={() => setDialog(null)}>Отмена</button>
              <button
                type="button"
                className="danger-btn"
                disabled={busy}
                onClick={async () => {
                  const fn = dialog.onConfirm;
                  setDialog(null);
                  await run(fn);
                }}
              >
                {dialog.actionName}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
