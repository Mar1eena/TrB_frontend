import { Nats_AdminClient } from "@marleena/trb-proto/nats/NatsServiceClientPb";
import { getGrpcBaseUrl } from "../common/client";
import { globalApiCache } from "../common/cache";
import { isAbsentMessage } from "../common/errors";
import {
  natsPb,
  mapAccount,
  mapStream,
  mapConsumer,
  mapMessage,
  asStreamName,
  asConsumerName,
  asMsg,
  streamConfigFromWrite,
  consumerFromWrite,
} from "./helpers";
import type {
  NatsAccount,
  NatsConsumer,
  NatsConsumerWrite,
  NatsFetchOpts,
  NatsMessage,
  NatsMessageRow,
  NatsStream,
  NatsStreamWrite,
} from "./types";

export const natsClient = new Nats_AdminClient(getGrpcBaseUrl());

export async function fetchAccount(opts?: NatsFetchOpts): Promise<NatsAccount> {
  return globalApiCache.read("nats:account", async () => mapAccount(await natsClient.accountInfo(new natsPb.JsOpts())), opts);
}

export async function fetchStreams(opts?: NatsFetchOpts): Promise<NatsStream[]> {
  return globalApiCache.read(
    "nats:streams",
    async () => (await natsClient.streams(new natsPb.JsOpts())).getItemsList().map(mapStream),
    opts,
  );
}

export async function fetchStreamsInfo(opts?: NatsFetchOpts): Promise<NatsStream[]> {
  return globalApiCache.read(
    "nats:streamsInfo",
    async () => (await natsClient.streamsInfo(new natsPb.JsOpts())).getItemsList().map(mapStream),
    opts,
  );
}

export async function fetchStreamNames(opts?: NatsFetchOpts): Promise<string[]> {
  return globalApiCache.read(
    "nats:streamNames",
    async () => (await natsClient.streamNames(new natsPb.JsOpts())).getNamesList(),
    opts,
  );
}

export async function fetchStream(name: string, opts?: NatsFetchOpts): Promise<NatsStream> {
  return globalApiCache.read(
    `nats:stream:${name}`,
    async () => mapStream(await natsClient.streamInfo(asStreamName(name))),
    opts,
  );
}

export async function createStream(body: NatsStreamWrite): Promise<NatsStream> {
  const name = body.name?.trim() ?? "";
  const created = await globalApiCache.write(async () =>
    mapStream(await natsClient.addStream(streamConfigFromWrite(body, name, { sealed: false }))),
  );
  if (body.sealed) {
    return updateStream(name, body);
  }
  return created;
}

export async function updateStream(name: string, body: NatsStreamWrite): Promise<NatsStream> {
  return globalApiCache.write(async () => mapStream(await natsClient.updateStream(streamConfigFromWrite(body, name))));
}

export async function deleteStream(name: string): Promise<void> {
  await globalApiCache.write(async () => natsClient.deleteStream(asStreamName(name)));
}

export async function purgeStream(name: string): Promise<void> {
  await globalApiCache.write(async () => natsClient.purgeStream(asStreamName(name)));
}

export async function fetchConsumers(stream: string, opts?: NatsFetchOpts): Promise<NatsConsumer[]> {
  return globalApiCache.read(
    `nats:consumers:${stream}`,
    async () => (await natsClient.consumers(asStreamName(stream))).getItemsList().map(mapConsumer),
    opts,
  );
}

export async function fetchConsumersInfo(stream: string, opts?: NatsFetchOpts): Promise<NatsConsumer[]> {
  return globalApiCache.read(
    `nats:consumersInfo:${stream}`,
    async () => (await natsClient.consumersInfo(asStreamName(stream))).getItemsList().map(mapConsumer),
    opts,
  );
}

export async function fetchConsumerNames(stream: string, opts?: NatsFetchOpts): Promise<string[]> {
  return globalApiCache.read(
    `nats:consumerNames:${stream}`,
    async () => (await natsClient.consumerNames(asStreamName(stream))).getNamesList(),
    opts,
  );
}

export async function fetchConsumer(stream: string, consumer: string, opts?: NatsFetchOpts): Promise<NatsConsumer> {
  return globalApiCache.read(
    `nats:consumer:${stream}:${consumer}`,
    async () => mapConsumer(await natsClient.consumerInfo(asConsumerName(stream, consumer))),
    opts,
  );
}

export async function createConsumer(stream: string, body: NatsConsumerWrite): Promise<NatsConsumer> {
  return globalApiCache.write(async () => mapConsumer(await natsClient.addConsumer(consumerFromWrite(stream, body))));
}

export async function updateConsumer(stream: string, body: NatsConsumerWrite): Promise<NatsConsumer> {
  return globalApiCache.write(async () => mapConsumer(await natsClient.updateConsumer(consumerFromWrite(stream, body))));
}

export async function deleteConsumer(stream: string, consumer: string): Promise<void> {
  await globalApiCache.write(async () => natsClient.deleteConsumer(asConsumerName(stream, consumer)));
}

export async function publishMessage(subject: string, data: string): Promise<string> {
  const req = new natsPb.PublishRequest();
  req.setSubject(subject);
  req.setData(data);
  const res = await globalApiCache.write(async () => natsClient.publish(req));
  return res.getResponse() ?? "";
}

export async function getMessage(stream: string, seq: number): Promise<NatsMessage> {
  return globalApiCache.read(
    `nats:msg:${stream}:${seq}`,
    async () => mapMessage(await natsClient.getMsg(asMsg(stream, seq))),
    { ttlMs: 10000 },
  );
}

export async function getMessageOrNull(stream: string, seq: number): Promise<NatsMessage | null> {
  try {
    return await getMessage(stream, seq);
  } catch (err) {
    if (isAbsentMessage(err)) return null;
    throw err;
  }
}

export async function fetchMessageRange(
  stream: string,
  fromSeq: number,
  toSeq: number,
): Promise<NatsMessageRow[]> {
  if (toSeq < fromSeq) return [];
  const req = new natsPb.MsgRange();
  req.setName(stream);
  req.setFromSeq(fromSeq);
  req.setToSeq(toSeq);
  const items = await globalApiCache.read(
    `nats:msgs:${stream}:${fromSeq}:${toSeq}`,
    async () => (await natsClient.getMsgs(req)).getItemsList(),
    { ttlMs: 5000 },
  );
  const bySeq = new Map<number, NatsMessage>();
  for (const item of items) {
    const msg = mapMessage(item);
    bySeq.set(msg.seq, msg);
  }
  const rows: NatsMessageRow[] = [];
  for (let seq = fromSeq; seq <= toSeq; seq += 1) {
    rows.push({ seq, msg: bySeq.get(seq) ?? null });
  }
  return rows;
}

export async function getLastMessage(stream: string, subject: string): Promise<NatsMessage> {
  const req = new natsPb.LastMsg();
  req.setName(stream);
  req.setSubject(subject);
  return globalApiCache.read(
    `nats:lastMsg:${stream}:${subject}`,
    async () => mapMessage(await natsClient.getLastMsg(req)),
    { ttlMs: 3000 },
  );
}

export async function deleteMessage(stream: string, seq: number, secure = false): Promise<void> {
  const req = asMsg(stream, seq);
  if (secure) {
    await globalApiCache.write(async () => natsClient.secureDeleteMsg(req));
    return;
  }
  await globalApiCache.write(async () => natsClient.deleteMsg(req));
}

export async function streamNameBySubject(subject: string): Promise<string> {
  const req = new natsPb.SubjectQuery();
  req.setSubject(subject);
  return globalApiCache.read(
    `nats:streamBySubject:${subject}`,
    async () => (await natsClient.streamNameBySubject(req)).getName() ?? "",
  );
}
