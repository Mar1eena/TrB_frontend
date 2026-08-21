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
  type NatsMessageRow,
  type NatsSettingsFile,
  type NatsStream,
  type NatsStreamWrite,
} from "../api/nats";
import "../styles/tables.css";
import "./SchedulerPanel.css";
import "./NatsAdminPanel.css";
import { useNotify } from "../notifications";

type DetailTab = "overview" | "config" | "consumers" | "messages";

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

const STREAM_HINTS = {
  name: "Уникальное имя стрима. После создания не меняется.",
  description: "Свободный комментарий. На работу стрима не влияет.",
  subjects:
    "Шаблоны NATS: какие сообщения попадают в стрим. Несколько значений — через запятую или пробел.",
  retention:
    "Когда NATS может удалять сообщения: по лимитам, пока они нужны consumers, или как очередь задач.",
  storage: "Где хранить данные. File переживает рестарт, Memory быстрее, но теряется.",
  discard:
    "Что делать при достижении лимита: вытеснять самые старые или отклонять новые публикации.",
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
  numDeleted:
    "Сообщения, вырезанные из стрима. Из-за них в нумерации seq появляются дыры.",
  maxMsgs: "Максимум сообщений в стриме. 0 или пусто — без лимита.",
  maxBytes: "Максимальный объём стрима. 0 или пусто — без лимита.",
  maxAge: "Как долго хранить сообщение. 0 — без ограничения по времени.",
  maxConsumers: "Потолок числа consumer'ов. 0 — без лимита.",
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
  allowRollup:
    "Разрешить заголовок Nats-Rollup: свернуть историю subject до одного сообщения.",
  allowMsgTtl: "Разрешить TTL на отдельные сообщения через заголовок Nats-TTL.",
  subjectDeleteMarkerTtl: "Как долго хранить маркер удаления subject после rollup или TTL.",
  metadata: "Произвольные пары ключ=значение. На логику JetStream не влияют.",
  cluster: "Raft-группа стрима и текущий лидер, который принимает записи.",
  created: "Когда стрим создали на сервере.",
} as const;

const CONSUMER_HINTS = {
  durable: "Имя durable consumer. После создания не меняется.",
  description: "Свободный комментарий. На доставку не влияет.",
  filterSubject: "Один subject-фильтр. Consumer видит только подходящие сообщения.",
  filterSubjects: "Несколько фильтров через запятую. Вместо одного filter subject.",
  deliver:
    "Откуда начать читать: все сообщения, только новые, последнее, с seq или с времени.",
  replay: "Как отдавать историю: сразу (instant) или в темпе оригинальной записи.",
  ack: "Как подтверждать: каждое сообщение, пакетом или без ack.",
  ackWait: "Сколько ждать ack, прежде чем отдать сообщение снова.",
  maxDeliver: "Сколько раз можно передоставить одно сообщение. 0 — без лимита.",
  maxAckPending: "Сколько сообщений можно держать без ack одновременно.",
  maxWaiting: "Сколько pull-запросов может ждать в очереди.",
  optStartSeq: "Начать с этого stream seq, если deliver = by start sequence.",
  optStartTime: "Начать с этого времени, если deliver = by start time.",
  deliverSubject: "Push: куда NATS будет публиковать сообщения consumer'у.",
  deliverGroup: "Push queue-group: несколько подписчиков делят нагрузку.",
  backoff: "Паузы между повторными доставками, в секундах через запятую.",
  rateLimit: "Ограничение скорости выдачи, байт/с.",
  sampleFreq: "Какой процент сообщений семплировать для мониторинга.",
  maxRequestBatch: "Максимум сообщений в одном pull-запросе.",
  maxRequestExpires: "Максимальный expire у pull-запроса, сек.",
  maxRequestMaxBytes: "Максимальный объём одного pull-ответа.",
  idleHeartbeat: "Интервал heartbeat'ов, если нет сообщений. Для push.",
  inactiveThreshold: "Удалить inactive consumer спустя столько секунд простоя.",
  replicas: "Сколько копий consumer state в кластере. 0 — как у стрима.",
  memoryStorage: "Держать состояние consumer в RAM, а не на диске.",
  headersOnly: "Доставлять только заголовки, без тела сообщения.",
  flowControl: "Push: не слать новые сообщения, пока клиент не подтвердит поток.",
  metadata: "Произвольные пары ключ=значение.",
} as const;

function retentionNote(value: number): string {
  if (value === 1) return "Хранится, пока нужно хотя бы одному consumer.";
  if (value === 2) return "Удаляется сразу после ack — очередь задач.";
  return "Удаляется по лимитам msgs / bytes / age.";
}

function discardNote(value: number): string {
  if (value === 1) return "Новые публикации отклоняются, старые остаются.";
  return "Самые старые сообщения вытесняются.";
}

function limitText(value: number, format?: (n: number) => string): string {
  if (!value || value < 0) return "без лимита";
  return format ? format(value) : value.toLocaleString("ru-RU");
}

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
    maxMsgsPerSubject: stream.max_msgs_per_subject
      ? String(stream.max_msgs_per_subject)
      : "",
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

function jsonFileName(prefix: string, id: string): string {
  const safe = id.replace(/[^\w.-]+/g, "_") || "settings";
  return `${prefix}-${safe}.json`;
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


export default function NatsAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const [account, setAccount] = useState<NatsAccount | null>(null);
  const [streams, setStreams] = useState<NatsStream[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [detail, setDetail] = useState<NatsStream | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [consumers, setConsumers] = useState<NatsConsumer[]>([]);
  const [selectedConsumer, setSelectedConsumer] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [streamForm, setStreamForm] = useState<StreamFormState>(emptyStreamForm);
  const [consumerForm, setConsumerForm] = useState<ConsumerFormState>(emptyConsumerForm);
  const [publishForm, setPublishForm] = useState({ subject: "", data: "" });
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingConsumer, setCreatingConsumer] = useState(false);
  const [msgPage, setMsgPage] = useState(1);
  const [msgPageSize, setMsgPageSize] = useState(25);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgSeqFrom, setMsgSeqFrom] = useState("");
  const [msgSeqTo, setMsgSeqTo] = useState("");
  const [msgPayload, setMsgPayload] = useState("");
  const [msgHideMissing, setMsgHideMissing] = useState(true);
  const [msgRows, setMsgRows] = useState<NatsMessageRow[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgOpenSeq, setMsgOpenSeq] = useState<number | null>(null);

  const selected = useMemo(
    () => detail ?? streams.find((s) => s.name === selectedName) ?? null,
    [detail, streams, selectedName],
  );

  const consumerDetail = useMemo(
    () =>
      consumers.find((c) => (c.name || c.durable) === selectedConsumer) ?? null,
    [consumers, selectedConsumer],
  );

  const filteredStreams = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return streams;
    return streams.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.subjects.some((sub) => sub.toLowerCase().includes(q)),
    );
  }, [streams, filter]);

  const msgWindow = useMemo(() => {
    const first = selected?.first_seq ?? 0;
    const last = selected?.last_seq ?? 0;
    if (!selected || last <= 0 || last < first) {
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
  }, [selected, msgSeqFrom, msgSeqTo, msgPage, msgPageSize]);

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

  const openMessage = useMemo(
    () => msgRows.find((row) => row.seq === msgOpenSeq)?.msg ?? null,
    [msgRows, msgOpenSeq],
  );

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
      setSelectedName((prev) => {
        if (opts?.select) return opts.select;
        if (opts?.keepSelection === false) return "";
        if (prev && items.some((s) => s.name === prev)) return prev;
        return "";
      });
      if (opts?.select) setCreating(false);
      notify.clear();
      if (opts?.fresh) {
        setDetail((prev) => {
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

  useEffect(() => {
    if (!selectedName) {
      setDetail(null);
      setConsumers([]);
      setSelectedConsumer("");
      setCreatingConsumer(false);
      return;
    }
    const fromList = streams.find((s) => s.name === selectedName);
    if (fromList) {
      setDetail(fromList);
      setStreamForm(streamFormFrom(fromList));
    }
    let cancelled = false;
    fetchConsumers(selectedName)
      .then((cons) => {
        if (!cancelled) setConsumers(cons);
      })
      .catch((e) => {
        if (!cancelled) {
          setConsumers([]);
          notify.error(e instanceof Error ? e.message : "Не удалось загрузить consumers");
        }
      });
    return () => {
      cancelled = true;
    };
    // Список стримов уже загружен — StreamInfo и ConsumerNames не нужны.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только смена стрима
  }, [selectedName]);

  useEffect(() => {
    if (consumerDetail) setConsumerForm(consumerFormFrom(consumerDetail));
  }, [consumerDetail]);

  useEffect(() => {
    setMsgPage(1);
    setMsgOpenSeq(null);
    setMsgRows([]);
  }, [selectedName]);

  useEffect(() => {
    if (tab !== "messages" || !selectedName || msgWindow.span <= 0) {
      if (tab !== "messages") return;
      setMsgRows([]);
      setMsgLoading(false);
      return;
    }
    let cancelled = false;
    setMsgLoading(true);
    fetchMessageRange(selectedName, msgWindow.start, msgWindow.end)
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
  }, [tab, selectedName, msgWindow.start, msgWindow.end, msgWindow.span, notify]);

  useEffect(() => {
    if (msgPage > msgWindow.pages) setMsgPage(msgWindow.pages);
  }, [msgPage, msgWindow.pages]);

  async function run(action: () => Promise<void>, ok?: string) {
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
  }

  function onSaveStream(e: FormEvent) {
    e.preventDefault();
    const body = toStreamWrite(streamForm);
    if (!body.name || body.subjects.length === 0) {
      notify.error("Укажите имя стрима и хотя бы один subject");
      return;
    }
    const isUpdate = Boolean(selected && selected.name === body.name);
    void run(async () => {
      const saved = isUpdate
        ? await updateStream(body.name!, body)
        : await createStream(body);
      setCreating(false);
      await loadOverview({ select: saved.name });
    }, isUpdate ? `Стрим ${body.name} обновлён` : `Стрим ${body.name} создан`);
  }

  function onSaveConsumer(e: FormEvent) {
    e.preventDefault();
    if (!selectedName) {
      notify.error("Сначала выберите стрим");
      return;
    }
    const body = toConsumerWrite(consumerForm);
    if (!body.durable) {
      notify.error("Укажите durable-имя consumer");
      return;
    }
    const isUpdate = consumers.some((c) => (c.name || c.durable) === body.durable);
    void run(async () => {
      const saved = isUpdate
        ? await updateConsumer(selectedName, body)
        : await createConsumer(selectedName, body);
      setConsumers(await fetchConsumers(selectedName));
      setSelectedConsumer(saved.name || saved.durable);
      setCreatingConsumer(false);
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
      await loadOverview();
    }, `Опубликовано в ${subject}`);
  }

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const subject = subjectQuery.trim();
    if (!subject) return;
    void run(async () => {
      const name = await streamNameBySubject(subject);
      setSelectedName(name);
      setCreating(false);
      setTab("overview");
      notify.success(`Subject «${subject}» → стрим ${name}`);
    });
  }

  function refreshSelectedStream() {
    if (!selectedName) return;
    void run(async () => {
      const info = await fetchStream(selectedName, { fresh: true });
      setDetail(info);
      setStreams((prev) => prev.map((s) => (s.name === info.name ? info : s)));
      setStreamForm(streamFormFrom(info));
      setConsumers(await fetchConsumers(selectedName));
    }, `Стрим ${selectedName} обновлён`);
  }

  function refreshSelectedConsumer() {
    if (!selectedName) return;
    void run(async () => {
      const list = await fetchConsumers(selectedName);
      setConsumers(list);
      if (!selectedConsumer) return;
      const found = list.find((c) => (c.name || c.durable) === selectedConsumer);
      if (found) setConsumerForm(consumerFormFrom(found));
    }, selectedConsumer ? `Consumer ${selectedConsumer} обновлён` : "Consumers обновлены");
  }

  function goBack() {
    if (tab === "consumers" && (selectedConsumer || creatingConsumer)) {
      setSelectedConsumer("");
      setCreatingConsumer(false);
      return;
    }
    setCreating(false);
    setSelectedName("");
    setTab("overview");
    setSelectedConsumer("");
    setCreatingConsumer(false);
  }

  function openStream(name: string) {
    setCreating(false);
    setSelectedName(name);
    setTab("overview");
  }

  function limitLabel(value: number, max: number): string {
    if (max < 0) return `${value} / ∞`;
    if (max > 0) return `${value} / ${max}`;
    return String(value);
  }

  const consumerSettingsOpen =
    tab === "consumers" && (Boolean(selectedConsumer) || creatingConsumer);

  async function applySettingsFile(file: NatsSettingsFile, okPrefix: string) {
    if (
      !confirm(
        "Применить JSON к JetStream? Существующие стримы и consumers обновятся, новые создадутся. Сообщения не изменятся.",
      )
    ) {
      throw new Error("cancelled");
    }
    const result = await applyNatsSettings(file);
    await loadOverview({ keepSelection: false });
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
      const consumers = (await fetchConsumers(stream.name)).map(consumerToWrite);
      downloadJson(
        jsonFileName("consumers", stream.name),
        buildNatsSettings([{ config: streamToWrite(stream), consumers }]),
      );
      notify.success(`Consumers ${stream.name}: ${consumers.length}`);
    });
  }

  function onDeleteStreamRow(stream: NatsStream) {
    if (stream.deny_delete) return;
    if (!confirm(`Удалить стрим ${stream.name}?`)) return;
    void run(async () => {
      await deleteStream(stream.name);
      await loadOverview({ keepSelection: false });
    }, `Стрим ${stream.name} удалён`);
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
    <section className="panel-page nats-panel">
      <header className="nats-bar">
        {creating || selectedName ? (
          <button type="button" className="btn" onClick={goBack} disabled={busy}>
            Назад
          </button>
        ) : null}
        <h1>
          {creating
            ? "Новый стрим"
            : creatingConsumer && tab === "consumers"
              ? "Новый consumer"
              : selectedConsumer && tab === "consumers"
                ? selectedConsumer
                : selectedName || "Админка NATS"}
        </h1>
        {account && !creating && !selectedName ? (
          <div className="nats-stats" aria-label="Аккаунт JetStream">
            <span className="nats-chip" title="Стримы на аккаунте / лимит">
              <span>стримы</span>
              {limitLabel(account.streams, account.max_streams)}
            </span>
            <span className="nats-chip" title="Consumers / лимит">
              <span>cons</span>
              {limitLabel(account.consumers, account.max_consumers)}
            </span>
            <span className="nats-chip" title="Память JetStream">
              <span>RAM</span>
              {formatBytes(account.memory)}
            </span>
            <span className="nats-chip" title="Диск JetStream">
              <span>диск</span>
              {formatBytes(account.storage)}
            </span>
            <span
              className="nats-chip"
              title="Запросы к JetStream API этого аккаунта и сколько из них с ошибкой"
            >
              <span>JS API</span>
              {account.api_total}/{account.api_errors}
            </span>
          </div>
        ) : null}
        <div className="nats-actions">
          {!creating && !selectedName ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={loading || busy}
                onClick={() => void loadOverview({ fresh: true })}
              >
                Обновить
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                title="Скачать все стримы и consumers в JSON"
                onClick={onExportJson}
              >
                Выгрузить JSON
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                title="Загрузить настройки из JSON"
                onClick={onImportJson}
              >
                Загрузить JSON
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  setCreating(true);
                  setSelectedName("");
                  setTab("config");
                  setStreamForm(emptyStreamForm());
                }}
              >
                Новый стрим
              </button>
            </>
          ) : (
            <>
              {!creating && selectedName && !consumerSettingsOpen ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || loading}
                  onClick={() => {
                    if (tab === "config") {
                      void refreshSelectedStream();
                      return;
                    }
                    if (tab === "consumers") {
                      void run(async () => {
                        setConsumers(await fetchConsumers(selectedName));
                      }, "Consumers обновлены");
                      return;
                    }
                    void loadOverview({ fresh: true });
                  }}
                >
                  Обновить
                </button>
              ) : null}
              {consumerSettingsOpen && !creatingConsumer ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void refreshSelectedConsumer()}
                >
                  Обновить
                </button>
              ) : null}
              {creating || tab === "config" ? (
                <button
                  type="submit"
                  form="nats-stream-form"
                  className="btn primary"
                  disabled={busy}
                >
                  {selected && selected.name === streamForm.name.trim() ? "Сохранить" : "Создать"}
                </button>
              ) : null}
              {consumerSettingsOpen ? (
                <button
                  type="submit"
                  form="nats-consumer-form"
                  className="btn primary"
                  disabled={busy}
                >
                  {selectedConsumer ? "Сохранить" : "Создать"}
                </button>
              ) : null}
              {tab === "consumers" && selectedName && !creating && !consumerSettingsOpen ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => {
                    setSelectedConsumer("");
                    setCreatingConsumer(true);
                    setConsumerForm(emptyConsumerForm());
                  }}
                >
                  Новый consumer
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>


      {creating || selectedName ? (
        <div className="nats-page">
          <div className="nats-detail">
            <div className="nats-tabs">
              {(
                [
                  ["overview", "Обзор"],
                  ["config", "Конфиг"],
                  ["consumers", "Consumers"],
                  ["messages", "Сообщения"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? "is-active" : ""}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "overview" ? (
              selected ? (
                <div className="nats-pane">
                  <StreamOverview stream={selected} />
                  <div className="nats-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || selected.deny_purge}
                      title={
                        selected.deny_purge
                          ? STREAM_HINTS.denyPurge
                          : "Удалить все сообщения, конфигурация стрима останется"
                      }
                      onClick={() => {
                        if (!confirm(`Очистить стрим ${selected.name}?`)) return;
                        void run(async () => {
                          await purgeStream(selected.name);
                          await loadOverview();
                        }, `Стрим ${selected.name} очищен`);
                      }}
                    >
                      Purge
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy || selected.deny_delete}
                      title={
                        selected.deny_delete
                          ? STREAM_HINTS.denyDelete
                          : "Удалить стрим вместе с сообщениями и consumers"
                      }
                      onClick={() => {
                        if (!confirm(`Удалить стрим ${selected.name}?`)) return;
                        void run(async () => {
                          await deleteStream(selected.name);
                          goBack();
                          await loadOverview({ keepSelection: false });
                        }, `Стрим ${selected.name} удалён`);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ) : (
                <p className="hint">Выберите стрим слева или создайте новый на вкладке «Конфиг».</p>
              )
            ) : null}

            {tab === "config" ? (
              <form id="nats-stream-form" className="nats-pane nats-form" onSubmit={onSaveStream}>
                <div className="nats-form-head">
                  <h3>{selected && selected.name === streamForm.name.trim() ? "Настройки стрима" : "Новый стрим"}</h3>
                </div>

                <FormSection title="Основные" hint="Имя, описание и какие subject попадают в стрим" defaultOpen>
                  <div className="filters-row">
                    <Field label="Имя" hint={STREAM_HINTS.name}>
                      <input
                        value={streamForm.name}
                        disabled={Boolean(selected && selected.name === streamForm.name)}
                        onChange={(e) => setStreamForm({ ...streamForm, name: e.target.value })}
                      />
                    </Field>
                    <Field label="Описание" hint={STREAM_HINTS.description}>
                      <input
                        value={streamForm.description}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, description: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Subjects" hint={STREAM_HINTS.subjects}>
                    <textarea
                      value={streamForm.subjects}
                      onChange={(e) => setStreamForm({ ...streamForm, subjects: e.target.value })}
                      placeholder="TrB.HistoricCandle.Task.*.*"
                    />
                  </Field>
                </FormSection>

                <FormSection title="Политика хранения" hint="Как и где хранить сообщения, что делать при переполнении" defaultOpen>
                  <div className="filters-row">
                    <Select
                      label="Retention"
                      hint={STREAM_HINTS.retention}
                      value={streamForm.retention}
                      options={RETENTION_OPTIONS}
                      onChange={(v) => setStreamForm({ ...streamForm, retention: v })}
                    />
                    <Select
                      label="Storage"
                      hint={STREAM_HINTS.storage}
                      value={streamForm.storage}
                      options={STORAGE_OPTIONS}
                      onChange={(v) => setStreamForm({ ...streamForm, storage: v })}
                    />
                    <Select
                      label="Discard"
                      hint={STREAM_HINTS.discard}
                      value={streamForm.discard}
                      options={DISCARD_OPTIONS}
                      onChange={(v) => setStreamForm({ ...streamForm, discard: v })}
                    />
                    <Select
                      label="Compression"
                      hint={STREAM_HINTS.compression}
                      value={streamForm.compression}
                      options={COMPRESSION_OPTIONS}
                      onChange={(v) => setStreamForm({ ...streamForm, compression: v })}
                    />
                    <Field label="Replicas" hint={STREAM_HINTS.replicas}>
                      <input
                        value={streamForm.replicas}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, replicas: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </FormSection>

                <FormSection title="Лимиты" hint="Пороги, после которых retention и discard начинают вытеснять данные. Пусто = без лимита">
                  <div className="filters-row">
                    <Field label="Max consumers" hint={STREAM_HINTS.maxConsumers}>
                      <input
                        value={streamForm.maxConsumers}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, maxConsumers: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Max msgs" hint={STREAM_HINTS.maxMsgs}>
                      <input
                        value={streamForm.maxMsgs}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, maxMsgs: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Max bytes" hint={STREAM_HINTS.maxBytes}>
                      <input
                        value={streamForm.maxBytes}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, maxBytes: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Max age, сек" hint={STREAM_HINTS.maxAge}>
                      <input
                        value={streamForm.maxAgeSec}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, maxAgeSec: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Max msgs/subject" hint={STREAM_HINTS.maxMsgsPerSubject}>
                      <input
                        value={streamForm.maxMsgsPerSubject}
                        onChange={(e) =>
                          setStreamForm({
                            ...streamForm,
                            maxMsgsPerSubject: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Max msg size" hint={STREAM_HINTS.maxMsgSize}>
                      <input
                        value={streamForm.maxMsgSize}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, maxMsgSize: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </FormSection>

                <FormSection title="Дедупликация и нумерация" hint="Окно Nats-Msg-Id и стартовый sequence">
                  <div className="filters-row">
                    <Field label="Duplicate window, сек" hint={STREAM_HINTS.duplicateWindow}>
                      <input
                        value={streamForm.duplicateWindowSec}
                        onChange={(e) =>
                          setStreamForm({
                            ...streamForm,
                            duplicateWindowSec: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="First seq" hint={STREAM_HINTS.firstSeqCfg}>
                      <input
                        value={streamForm.firstSeq}
                        onChange={(e) =>
                          setStreamForm({ ...streamForm, firstSeq: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Subject delete marker TTL, сек" hint={STREAM_HINTS.subjectDeleteMarkerTtl}>
                      <input
                        value={streamForm.subjectDeleteMarkerTtlSec}
                        onChange={(e) =>
                          setStreamForm({
                            ...streamForm,
                            subjectDeleteMarkerTtlSec: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </FormSection>

                <FormSection title="Доступ и защита" hint="Ограничения на чтение, запись и удаление">
                  <div className="nats-flag-grid">
                    <Check
                      label="Allow direct"
                      hint={STREAM_HINTS.allowDirect}
                      checked={streamForm.allowDirect}
                      onChange={(v) => setStreamForm({ ...streamForm, allowDirect: v })}
                    />
                    <Check
                      label="No ack"
                      hint={STREAM_HINTS.noAck}
                      checked={streamForm.noAck}
                      onChange={(v) => setStreamForm({ ...streamForm, noAck: v })}
                    />
                    <Check
                      label="Discard new per subject"
                      hint={STREAM_HINTS.discardNewPerSubject}
                      checked={streamForm.discardNewPerSubject}
                      onChange={(v) =>
                        setStreamForm({ ...streamForm, discardNewPerSubject: v })
                      }
                    />
                    <Check
                      label="Sealed"
                      hint={STREAM_HINTS.sealed}
                      checked={streamForm.sealed}
                      onChange={(v) => setStreamForm({ ...streamForm, sealed: v })}
                    />
                    <Check
                      label="Deny delete"
                      hint={STREAM_HINTS.denyDelete}
                      checked={streamForm.denyDelete}
                      onChange={(v) => setStreamForm({ ...streamForm, denyDelete: v })}
                    />
                    <Check
                      label="Deny purge"
                      hint={STREAM_HINTS.denyPurge}
                      checked={streamForm.denyPurge}
                      onChange={(v) => setStreamForm({ ...streamForm, denyPurge: v })}
                    />
                    <Check
                      label="Allow rollup"
                      hint={STREAM_HINTS.allowRollup}
                      checked={streamForm.allowRollup}
                      onChange={(v) => setStreamForm({ ...streamForm, allowRollup: v })}
                    />
                    <Check
                      label="Allow msg TTL"
                      hint={STREAM_HINTS.allowMsgTtl}
                      checked={streamForm.allowMsgTtl}
                      onChange={(v) => setStreamForm({ ...streamForm, allowMsgTtl: v })}
                    />
                  </div>
                </FormSection>

                <FormSection title="Metadata" hint={STREAM_HINTS.metadata}>
                  <Field label="key=value, по строке" hint={STREAM_HINTS.metadata}>
                    <textarea
                      value={streamForm.metadata}
                      onChange={(e) =>
                        setStreamForm({ ...streamForm, metadata: e.target.value })
                      }
                    />
                  </Field>
                </FormSection>
              </form>
            ) : null}

            {tab === "consumers" ? (
              <div className="nats-pane">
                {!selected ? (
                  <p className="hint">Выберите стрим.</p>
                ) : consumerSettingsOpen ? (
                    <form id="nats-consumer-form" className="nats-form" onSubmit={onSaveConsumer}>
                      <div className="nats-form-head">
                        <h3>
                          {selectedConsumer
                            ? `Настройки ${selectedConsumer}`
                            : "Новый consumer"}
                        </h3>
                      </div>
                      {consumerDetail ? (
                        <FormSection title="Состояние" hint="Текущие счётчики выбранного consumer" defaultOpen>
                          <div className="nats-rows">
                            <div className="nats-row">
                              <span className="nats-row-k">Создан</span>
                              <span className="nats-row-v">{formatDateTime(consumerDetail.created)}</span>
                            </div>
                            <div className="nats-row">
                              <span className="nats-row-k">Delivered</span>
                              <span className="nats-row-v">
                                stream {consumerDetail.delivered_stream_seq} · consumer{" "}
                                {consumerDetail.delivered_consumer_seq}
                              </span>
                            </div>
                            <div className="nats-row">
                              <span className="nats-row-k">Ack floor</span>
                              <span className="nats-row-v">
                                stream {consumerDetail.ack_floor_stream_seq} · consumer{" "}
                                {consumerDetail.ack_floor_consumer_seq}
                              </span>
                            </div>
                            <div className="nats-row">
                              <span className="nats-row-k">Waiting</span>
                              <span className="nats-row-v">
                                {consumerDetail.num_waiting}
                                {consumerDetail.push_bound ? " · push-bound" : ""}
                              </span>
                            </div>
                          </div>
                        </FormSection>
                      ) : null}
                      <FormSection title="Основные" hint="Имя, описание и какие сообщения видит consumer" defaultOpen>
                        <div className="filters-row">
                          <Field label="Durable" hint={CONSUMER_HINTS.durable}>
                            <input
                              value={consumerForm.durable}
                              disabled={Boolean(selectedConsumer)}
                              onChange={(e) =>
                                setConsumerForm({ ...consumerForm, durable: e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Описание" hint={CONSUMER_HINTS.description}>
                            <input
                              value={consumerForm.description}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  description: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="filters-row">
                          <Field label="Filter subject" hint={CONSUMER_HINTS.filterSubject}>
                            <input
                              value={consumerForm.filterSubject}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  filterSubject: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Filter subjects" hint={CONSUMER_HINTS.filterSubjects}>
                            <input
                              value={consumerForm.filterSubjects}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  filterSubjects: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </FormSection>
                      <FormSection title="Доставка" hint="Откуда читать и в каком темпе отдавать">
                        <div className="filters-row">
                          <Select
                            label="Deliver"
                            hint={CONSUMER_HINTS.deliver}
                            value={consumerForm.deliverPolicy}
                            options={DELIVER_OPTIONS}
                            onChange={(v) =>
                              setConsumerForm({ ...consumerForm, deliverPolicy: v })
                            }
                          />
                          <Select
                            label="Replay"
                            hint={CONSUMER_HINTS.replay}
                            value={consumerForm.replayPolicy}
                            options={REPLAY_OPTIONS}
                            onChange={(v) =>
                              setConsumerForm({ ...consumerForm, replayPolicy: v })
                            }
                          />
                          <Field label="Opt start seq" hint={CONSUMER_HINTS.optStartSeq}>
                            <input
                              value={consumerForm.optStartSeq}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  optStartSeq: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Opt start time" hint={CONSUMER_HINTS.optStartTime}>
                            <input
                              value={consumerForm.optStartTime}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  optStartTime: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </FormSection>
                      <FormSection title="Push" hint="Если пусто — pull consumer. Иначе NATS сам публикует в deliver subject">
                        <div className="filters-row">
                          <Field label="Deliver subject" hint={CONSUMER_HINTS.deliverSubject}>
                            <input
                              value={consumerForm.deliverSubject}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  deliverSubject: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Deliver group" hint={CONSUMER_HINTS.deliverGroup}>
                            <input
                              value={consumerForm.deliverGroup}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  deliverGroup: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </FormSection>
                      <FormSection title="Подтверждения" hint="Как consumer подтверждает сообщения и сколько можно держать без ack">
                        <div className="filters-row">
                          <Select
                            label="Ack"
                            hint={CONSUMER_HINTS.ack}
                            value={consumerForm.ackPolicy}
                            options={ACK_OPTIONS}
                            onChange={(v) =>
                              setConsumerForm({ ...consumerForm, ackPolicy: v })
                            }
                          />
                          <Field label="Ack wait, сек" hint={CONSUMER_HINTS.ackWait}>
                            <input
                              value={consumerForm.ackWaitSec}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  ackWaitSec: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Max deliver" hint={CONSUMER_HINTS.maxDeliver}>
                            <input
                              value={consumerForm.maxDeliver}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  maxDeliver: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Max ack pending" hint={CONSUMER_HINTS.maxAckPending}>
                            <input
                              value={consumerForm.maxAckPending}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  maxAckPending: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Backoff, сек" hint={CONSUMER_HINTS.backoff}>
                            <input
                              value={consumerForm.backoffSec}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  backoffSec: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </FormSection>
                      <FormSection title="Лимиты pull" hint="Ограничения на pull-запросы и скорость выдачи">
                        <div className="filters-row">
                          <Field label="Max waiting" hint={CONSUMER_HINTS.maxWaiting}>
                            <input
                              value={consumerForm.maxWaiting}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  maxWaiting: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Max request batch" hint={CONSUMER_HINTS.maxRequestBatch}>
                            <input
                              value={consumerForm.maxRequestBatch}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  maxRequestBatch: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Max request expires, сек" hint={CONSUMER_HINTS.maxRequestExpires}>
                            <input
                              value={consumerForm.maxRequestExpiresSec}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  maxRequestExpiresSec: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Max request bytes" hint={CONSUMER_HINTS.maxRequestMaxBytes}>
                            <input
                              value={consumerForm.maxRequestMaxBytes}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  maxRequestMaxBytes: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Rate limit, B/s" hint={CONSUMER_HINTS.rateLimit}>
                            <input
                              value={consumerForm.rateLimitBps}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  rateLimitBps: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Sample freq" hint={CONSUMER_HINTS.sampleFreq}>
                            <input
                              value={consumerForm.sampleFreq}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  sampleFreq: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </FormSection>
                      <FormSection title="Надёжность" hint="Хранение состояния, heartbeat и ограничения на простой">
                        <div className="filters-row">
                          <Field label="Idle heartbeat, сек" hint={CONSUMER_HINTS.idleHeartbeat}>
                            <input
                              value={consumerForm.idleHeartbeatSec}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  idleHeartbeatSec: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Inactive threshold, сек" hint={CONSUMER_HINTS.inactiveThreshold}>
                            <input
                              value={consumerForm.inactiveThresholdSec}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  inactiveThresholdSec: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Replicas" hint={CONSUMER_HINTS.replicas}>
                            <input
                              value={consumerForm.replicas}
                              onChange={(e) =>
                                setConsumerForm({
                                  ...consumerForm,
                                  replicas: e.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <div className="nats-flag-grid">
                          <Check
                            label="Memory storage"
                            hint={CONSUMER_HINTS.memoryStorage}
                            checked={consumerForm.memoryStorage}
                            onChange={(v) =>
                              setConsumerForm({ ...consumerForm, memoryStorage: v })
                            }
                          />
                          <Check
                            label="Headers only"
                            hint={CONSUMER_HINTS.headersOnly}
                            checked={consumerForm.headersOnly}
                            onChange={(v) =>
                              setConsumerForm({ ...consumerForm, headersOnly: v })
                            }
                          />
                          <Check
                            label="Flow control"
                            hint={CONSUMER_HINTS.flowControl}
                            checked={consumerForm.flowControl}
                            onChange={(v) =>
                              setConsumerForm({ ...consumerForm, flowControl: v })
                            }
                          />
                        </div>
                      </FormSection>
                      <FormSection title="Metadata" hint={CONSUMER_HINTS.metadata}>
                        <Field label="key=value, по строке" hint={CONSUMER_HINTS.metadata}>
                          <textarea
                            value={consumerForm.metadata}
                            onChange={(e) =>
                              setConsumerForm({ ...consumerForm, metadata: e.target.value })
                            }
                          />
                        </Field>
                      </FormSection>
                    </form>
                ) : (
                  <div className="table-scroll table-scroll-fill">
                    <table className="data-table nats-data-table">
                      <thead>
                        <tr>
                          <th>Имя</th>
                          <th>Filter</th>
                          <th>Ack</th>
                          <th>Pending</th>
                          <th>Ack pend.</th>
                          <th>Redeliv.</th>
                          <th className="col-actions">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consumers.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="nats-empty">
                              Нет consumers
                            </td>
                          </tr>
                        ) : (
                          consumers.map((c) => {
                            const name = c.name || c.durable;
                            return (
                              <tr
                                key={name}
                                onClick={() => {
                                  setCreatingConsumer(false);
                                  setSelectedConsumer(name);
                                }}
                              >
                                <td className="nats-cell-name" title={name}>
                                  {name}
                                </td>
                                <td className="nats-cell mono" title={c.filter_subject || undefined}>
                                  {c.filter_subject || "—"}
                                </td>
                                <td className="nats-cell">{enumLabel(ACK_OPTIONS, c.ack_policy)}</td>
                                <td className="nats-num mono">{c.num_pending}</td>
                                <td className="nats-num mono">{c.num_ack_pending}</td>
                                <td className="nats-num mono">{c.num_redelivered}</td>
                                <td className="col-actions">
                                  <button
                                    type="button"
                                    className="nats-row-btn is-danger"
                                    disabled={busy}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      if (!confirm(`Удалить consumer ${name}?`)) return;
                                      void run(async () => {
                                        await deleteConsumer(selected.name, name);
                                        setSelectedConsumer("");
                                        setCreatingConsumer(false);
                                        setConsumers(await fetchConsumers(selected.name));
                                        await loadOverview();
                                      }, `Consumer ${name} удалён`);
                                    }}
                                  >
                                    Удалить
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "messages" ? (
              <div className="nats-pane nats-msg-page">
                {!selected ? (
                  <p className="hint">Выберите стрим.</p>
                ) : (
                  <>
                    <div className="nats-msg-toolbar">
                      <input
                        value={msgSubject}
                        onChange={(e) => setMsgSubject(e.target.value)}
                        placeholder="Subject"
                        title="Фильтр по subject на текущей странице"
                      />
                      <input
                        value={msgPayload}
                        onChange={(e) => setMsgPayload(e.target.value)}
                        placeholder="Payload"
                        title="Фильтр по тексту сообщения на текущей странице"
                      />
                      <input
                        className="nats-msg-seq"
                        value={msgSeqFrom}
                        onChange={(e) => {
                          setMsgSeqFrom(e.target.value);
                          setMsgPage(1);
                        }}
                        placeholder={String(selected.first_seq || "seq с")}
                        title="Начало диапазона seq"
                      />
                      <span className="nats-msg-sep">–</span>
                      <input
                        className="nats-msg-seq"
                        value={msgSeqTo}
                        onChange={(e) => {
                          setMsgSeqTo(e.target.value);
                          setMsgPage(1);
                        }}
                        placeholder={String(selected.last_seq || "seq по")}
                        title="Конец диапазона seq"
                      />
                      <select
                        value={msgPageSize}
                        title="Сообщений на странице"
                        onChange={(e) => {
                          setMsgPageSize(Number(e.target.value));
                          setMsgPage(1);
                        }}
                      >
                        {[10, 25, 50, 100].map((n) => (
                          <option key={n} value={n}>
                            {n}/стр
                          </option>
                        ))}
                      </select>
                      <label className="nats-check">
                        <input
                          type="checkbox"
                          checked={msgHideMissing}
                          onChange={(e) => setMsgHideMissing(e.target.checked)}
                        />
                        Без удалённых
                      </label>
                      <span className="nats-msg-status">
                        {msgLoading
                          ? "Загрузка…"
                          : msgWindow.span > 0
                            ? `${msgWindow.start}–${msgWindow.end} · ${Math.min(msgPage, msgWindow.pages)}/${msgWindow.pages}`
                            : "пусто"}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        disabled={msgLoading || msgPage <= 1}
                        onClick={() => setMsgPage((p) => Math.max(1, p - 1))}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={msgLoading || msgPage >= msgWindow.pages}
                        onClick={() => setMsgPage((p) => p + 1)}
                      >
                        →
                      </button>
                    </div>
                    <div className="table-scroll table-scroll-fill nats-msg-table">
                      <table className="data-table nats-data-table nats-msg-data">
                        <thead>
                          <tr>
                            <th>Seq</th>
                            <th>Subject</th>
                            <th>Время</th>
                            <th>Размер</th>
                            <th>Данные</th>
                            <th className="col-actions">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleMsgRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="nats-empty">
                                {msgLoading ? "Загрузка…" : "Нет сообщений на этой странице"}
                              </td>
                            </tr>
                          ) : (
                            visibleMsgRows.map((row) => {
                              const open = msgOpenSeq === row.seq;
                              return (
                                <tr
                                  key={row.seq}
                                  className={open ? "is-selected" : ""}
                                  onClick={() =>
                                    setMsgOpenSeq(open ? null : row.seq)
                                  }
                                >
                                  <td className="mono nats-num">{row.seq}</td>
                                  <td
                                    className="nats-cell mono"
                                    title={row.msg?.subject || undefined}
                                  >
                                    {row.msg?.subject || "—"}
                                  </td>
                                  <td className="nats-num mono table-datetime">
                                    {row.msg ? formatDateTime(row.msg.time) : "удалено"}
                                  </td>
                                  <td className="nats-num mono">
                                    {row.msg
                                      ? formatBytes(new TextEncoder().encode(row.msg.data).length)
                                      : "—"}
                                  </td>
                                  <td
                                    className="nats-msg-preview"
                                    title={row.msg ? previewText(row.msg.data) : undefined}
                                  >
                                    {row.msg
                                      ? previewText(row.msg.data)
                                      : "seq отсутствует"}
                                  </td>
                                  <td className="col-actions">
                                    {row.msg && !selected.deny_delete ? (
                                      <button
                                        type="button"
                                        className="nats-row-btn is-danger"
                                        disabled={busy}
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          if (!confirm(`Удалить seq=${row.seq}?`)) return;
                                          void run(async () => {
                                            await deleteMessage(selected.name, row.seq);
                                            setMsgRows((prev) =>
                                              prev.map((item) =>
                                                item.seq === row.seq
                                                  ? { seq: row.seq, msg: null }
                                                  : item,
                                              ),
                                            );
                                            if (msgOpenSeq === row.seq) setMsgOpenSeq(null);
                                            await loadOverview();
                                          }, `Сообщение ${row.seq} удалено`);
                                        }}
                                      >
                                        Удалить
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    {openMessage ? (
                      <pre className="nats-msg">
                        {`seq ${openMessage.seq}  ${openMessage.subject}
${formatDateTime(openMessage.time)}${openMessage.data_base64 ? "  (base64)" : ""}

${openMessage.data || "—"}`}
                      </pre>
                    ) : null}
                    <form className="nats-msg-publish" onSubmit={onPublish}>
                      <details>
                        <summary>Опубликовать</summary>
                        <div className="nats-msg-publish-row">
                          <input
                            value={publishForm.subject}
                            onChange={(e) =>
                              setPublishForm({ ...publishForm, subject: e.target.value })
                            }
                            placeholder={selected.subjects[0] || "subject"}
                            title="Subject"
                          />
                          <input
                            value={publishForm.data}
                            onChange={(e) =>
                              setPublishForm({ ...publishForm, data: e.target.value })
                            }
                            placeholder="payload"
                            title="Тело сообщения"
                          />
                          <button type="submit" className="btn primary" disabled={busy}>
                            Отправить
                          </button>
                        </div>
                      </details>
                    </form>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="nats-list">
          <form className="nats-filters" onSubmit={onLookup}>
            <label className="filter-field">
              <span>Фильтр</span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="имя, subject"
              />
            </label>
            <label className="filter-field">
              <span>Subject → стрим</span>
              <input
                value={subjectQuery}
                onChange={(e) => setSubjectQuery(e.target.value)}
                placeholder="TrB.HistoricCandle.Task.>"
              />
            </label>
            <button type="submit" className="btn" disabled={busy}>
              Найти
            </button>
          </form>
          <div className="table-scroll table-scroll-fill">
            <table className="data-table nats-data-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Msgs</th>
                  <th>Размер</th>
                  <th>Consumers</th>
                  <th>Storage</th>
                  <th className="col-actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredStreams.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="nats-empty">
                      {loading ? "Загрузка…" : "Стримов нет"}
                    </td>
                  </tr>
                ) : (
                  filteredStreams.map((stream) => (
                    <tr key={stream.name} onClick={() => openStream(stream.name)}>
                      <td className="nats-cell-name" title={stream.name}>
                        {stream.name}
                      </td>
                      <td className="nats-num mono">{stream.msgs.toLocaleString()}</td>
                      <td className="nats-num mono">{formatBytes(stream.bytes)}</td>
                      <td className="nats-num mono">{stream.consumer_count}</td>
                      <td className="nats-cell">{enumLabel(STORAGE_OPTIONS, stream.storage)}</td>
                      <td className="col-actions">
                        <div className="col-act-group">
                          <button
                            type="button"
                            className="nats-row-btn"
                            disabled={busy}
                            title="Скачать JSON-конфиг этого стрима"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onExportStreamRow(stream);
                            }}
                          >
                            Стрим
                          </button>
                          <button
                            type="button"
                            className="nats-row-btn"
                            disabled={busy}
                            title="Скачать JSON consumers этого стрима"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onExportConsumersRow(stream);
                            }}
                          >
                            Cons.
                          </button>
                          <button
                            type="button"
                            className="nats-row-btn is-danger"
                            disabled={busy || stream.deny_delete}
                            title={
                              stream.deny_delete
                                ? STREAM_HINTS.denyDelete
                                : "Удалить стрим вместе с сообщениями и consumers"
                            }
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onDeleteStreamRow(stream);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function HintLabel({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <span className="nats-tip" tabIndex={0}>
      {children}
      <span className="nats-tip-box">{hint}</span>
    </span>
  );
}

function StatCard({
  label,
  hint,
  value,
  sub,
  used,
  max,
}: {
  label: string;
  hint: string;
  value: ReactNode;
  sub?: ReactNode;
  used?: number;
  max?: number;
}) {
  const pct =
    max != null && used != null && max > 0
      ? Math.max(0, Math.min(100, (used / max) * 100))
      : null;
  return (
    <div className="nats-stat">
      <div className="nats-stat-label">
        <HintLabel hint={hint}>{label}</HintLabel>
      </div>
      <div className="nats-stat-value">{value}</div>
      {sub ? <div className="nats-stat-sub">{sub}</div> : null}
      {pct != null ? (
        <div className="nats-meter">
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="nats-row">
      <span className="nats-row-k">
        <HintLabel hint={hint}>{label}</HintLabel>
      </span>
      <span className="nats-row-v">{children}</span>
    </div>
  );
}

function StreamOverview({ stream }: { stream: NatsStream }) {
  const flags = [
    { on: stream.allow_direct, label: "direct", hint: STREAM_HINTS.allowDirect },
    { on: stream.no_ack, label: "no-ack", hint: STREAM_HINTS.noAck },
    { on: stream.sealed, label: "sealed", hint: STREAM_HINTS.sealed },
    { on: stream.deny_delete, label: "deny-delete", hint: STREAM_HINTS.denyDelete },
    { on: stream.deny_purge, label: "deny-purge", hint: STREAM_HINTS.denyPurge },
    { on: stream.allow_rollup, label: "rollup", hint: STREAM_HINTS.allowRollup },
    { on: stream.allow_msg_ttl, label: "msg-ttl", hint: STREAM_HINTS.allowMsgTtl },
    {
      on: stream.discard_new_per_subject,
      label: "discard/subject",
      hint: STREAM_HINTS.discardNewPerSubject,
    },
  ];
  const meta = Object.entries(stream.metadata ?? {});

  return (
    <div className="nats-ov">
      <div className="nats-ov-lead">
        {stream.description ? (
          <p className="nats-ov-desc">{stream.description}</p>
        ) : (
          <p className="nats-ov-desc is-empty">Без описания</p>
        )}
        <div className="nats-subjects">
          {stream.subjects.length ? (
            stream.subjects.map((subject) => (
              <HintLabel key={subject} hint={STREAM_HINTS.subjects}>
                <span className="nats-subject">{subject}</span>
              </HintLabel>
            ))
          ) : (
            <span className="nats-ov-desc is-empty">Нет subjects</span>
          )}
        </div>
      </div>

      <div className="nats-stat-grid">
        <StatCard
          label="Сообщения"
          hint={STREAM_HINTS.msgs}
          value={stream.msgs.toLocaleString("ru-RU")}
          sub={limitText(stream.max_msgs, (n) => `лимит ${n.toLocaleString("ru-RU")}`)}
          used={stream.msgs}
          max={stream.max_msgs}
        />
        <StatCard
          label="Размер"
          hint={STREAM_HINTS.bytes}
          value={formatBytes(stream.bytes)}
          sub={limitText(stream.max_bytes, (n) => `лимит ${formatBytes(n)}`)}
          used={stream.bytes}
          max={stream.max_bytes}
        />
        <StatCard
          label="Consumers"
          hint={STREAM_HINTS.consumers}
          value={stream.consumer_count.toLocaleString("ru-RU")}
          sub={limitText(stream.max_consumers, (n) => `лимит ${n.toLocaleString("ru-RU")}`)}
          used={stream.consumer_count}
          max={stream.max_consumers}
        />
        <StatCard
          label="Subjects"
          hint={STREAM_HINTS.numSubjects}
          value={stream.num_subjects.toLocaleString("ru-RU")}
          sub={limitText(
            stream.max_msgs_per_subject,
            (n) => `макс. ${n.toLocaleString("ru-RU")} на subject`,
          )}
        />
      </div>

      <div className="nats-ov-grid">
        <section className="nats-card">
          <h3>Последовательность</h3>
          <div className="nats-seq">
            <div className="nats-seq-ends">
              <div>
                <HintLabel hint={STREAM_HINTS.firstSeq}>Первый seq</HintLabel>
                <strong>{stream.first_seq.toLocaleString("ru-RU")}</strong>
                <span>
                  <HintLabel hint={STREAM_HINTS.firstTs}>
                    {formatDateTime(stream.first_ts)}
                  </HintLabel>
                </span>
              </div>
              <div>
                <HintLabel hint={STREAM_HINTS.lastSeq}>Последний seq</HintLabel>
                <strong>{stream.last_seq.toLocaleString("ru-RU")}</strong>
                <span>
                  <HintLabel hint={STREAM_HINTS.lastTs}>
                    {formatDateTime(stream.last_ts)}
                  </HintLabel>
                </span>
              </div>
            </div>
            <div className="nats-seq-line" />
            <div className="nats-seq-meta">
              <HintLabel hint={STREAM_HINTS.numDeleted}>
                удалено {stream.num_deleted.toLocaleString("ru-RU")}
              </HintLabel>
              {stream.max_age > 0 ? (
                <>
                  <span>·</span>
                  <HintLabel hint={STREAM_HINTS.maxAge}>
                    возраст {formatAgeNs(stream.max_age)}
                  </HintLabel>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <section className="nats-card">
          <h3>Политика</h3>
          <div className="nats-rows">
            <InfoRow label="Retention" hint={STREAM_HINTS.retention}>
              <strong>{enumLabel(RETENTION_OPTIONS, stream.retention)}</strong>
              <em>{retentionNote(stream.retention)}</em>
            </InfoRow>
            <InfoRow label="Storage" hint={STREAM_HINTS.storage}>
              <strong>{enumLabel(STORAGE_OPTIONS, stream.storage)}</strong>
              <em>
                {stream.storage === 1
                  ? "Только RAM, пропадёт при рестарте."
                  : "На диске, переживает рестарт."}
              </em>
            </InfoRow>
            <InfoRow label="Discard" hint={STREAM_HINTS.discard}>
              <strong>{enumLabel(DISCARD_OPTIONS, stream.discard)}</strong>
              <em>{discardNote(stream.discard)}</em>
            </InfoRow>
            <InfoRow label="Compression" hint={STREAM_HINTS.compression}>
              {enumLabel(COMPRESSION_OPTIONS, stream.compression)}
            </InfoRow>
            <InfoRow label="Replicas" hint={STREAM_HINTS.replicas}>
              {stream.replicas || 1}
            </InfoRow>
            <InfoRow label="Dedup window" hint={STREAM_HINTS.duplicateWindow}>
              {stream.duplicate_window > 0
                ? formatAgeNs(stream.duplicate_window)
                : "по умолчанию"}
            </InfoRow>
          </div>
        </section>

        <section className="nats-card">
          <h3>Лимиты</h3>
          <div className="nats-rows">
            <InfoRow label="Max msgs" hint={STREAM_HINTS.maxMsgs}>
              {limitText(stream.max_msgs)}
            </InfoRow>
            <InfoRow label="Max bytes" hint={STREAM_HINTS.maxBytes}>
              {limitText(stream.max_bytes, formatBytes)}
            </InfoRow>
            <InfoRow label="Max age" hint={STREAM_HINTS.maxAge}>
              {formatAgeNs(stream.max_age)}
            </InfoRow>
            <InfoRow label="Max consumers" hint={STREAM_HINTS.maxConsumers}>
              {limitText(stream.max_consumers)}
            </InfoRow>
            <InfoRow label="Max msgs/subject" hint={STREAM_HINTS.maxMsgsPerSubject}>
              {limitText(stream.max_msgs_per_subject)}
            </InfoRow>
            <InfoRow label="Max msg size" hint={STREAM_HINTS.maxMsgSize}>
              {limitText(stream.max_msg_size, formatBytes)}
            </InfoRow>
          </div>
        </section>
      </div>

      <section className="nats-card">
        <h3>Флаги</h3>
        <div className="nats-flags">
          {flags.map((flag) => (
            <HintLabel key={flag.label} hint={flag.hint}>
              <span className={flag.on ? "nats-flag is-on" : "nats-flag"}>
                {flag.label}
              </span>
            </HintLabel>
          ))}
        </div>
      </section>

      <section className="nats-card nats-card-foot">
        <div className="nats-rows">
          <InfoRow label="Кластер" hint={STREAM_HINTS.cluster}>
            {stream.cluster_name || "—"}
            {stream.cluster_leader ? ` · лидер ${stream.cluster_leader}` : ""}
          </InfoRow>
          <InfoRow label="Создан" hint={STREAM_HINTS.created}>
            {formatDateTime(stream.created)}
          </InfoRow>
          {stream.first_seq_cfg ? (
            <InfoRow label="First seq (cfg)" hint={STREAM_HINTS.firstSeqCfg}>
              {stream.first_seq_cfg.toLocaleString("ru-RU")}
            </InfoRow>
          ) : null}
          {meta.length ? (
            <InfoRow label="Metadata" hint={STREAM_HINTS.metadata}>
              <div className="nats-subjects">
                {meta.map(([key, value]) => (
                  <span key={key} className="nats-subject">
                    {key}={value}
                  </span>
                ))}
              </div>
            </InfoRow>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function previewText(value: string, max = 72): string {
  const one = value.replace(/\s+/g, " ").trim();
  if (!one) return "—";
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

function FormSection({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="nats-card nats-form-section"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        {hint ? <HintLabel hint={hint}>{title}</HintLabel> : title}
      </summary>
      <div className="nats-form-section-body">{children}</div>
    </details>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="filter-field">
      <span>{hint ? <HintLabel hint={hint}>{label}</HintLabel> : label}</span>
      {children}
    </label>
  );
}

function Select({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  options: readonly { value: number; label: string }[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="filter-field">
      <span>{hint ? <HintLabel hint={hint}>{label}</HintLabel> : label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="nats-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {hint ? <HintLabel hint={hint}>{label}</HintLabel> : label}
    </label>
  );
}
