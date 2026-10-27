import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { RedisConfig } from '../config.js';

let connections: Redis[] = [];
let redisUrl: string | null = null;

export function initRedis(config: RedisConfig): void {
  redisUrl = config.url;
}

/**
 * 새 ioredis 연결을 만든다. BullMQ와 pub/sub 구독자는 각각 전용 연결이 필요하다.
 * maxRetriesPerRequest: null 은 BullMQ 권장 설정.
 */
export function createRedisConnection(): Redis {
  if (!redisUrl) {
    throw new Error('redis가 초기화되지 않았습니다. initRedis(config)를 먼저 호출하세요.');
  }
  const conn = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connections.push(conn);
  return conn;
}

let publisher: Redis | null = null;

/** Pub/Sub 발행 전용 공유 연결 (구독과 달리 발행은 연결 하나를 재사용해도 된다). */
export function getRedisPublisher(): Redis {
  if (!publisher) {
    publisher = createRedisConnection();
  }
  return publisher;
}

/** 연결 초기화를 기다리는 상한 — Redis 가 죽어 있어도 종료가 멈추지 않게 한다. */
const QUEUE_READY_WAIT_MS = 5_000;

/**
 * BullMQ 큐를 닫는다 — 연결 초기화가 끝난 뒤에(최대 `QUEUE_READY_WAIT_MS`).
 * 큐는 이 모듈의 공유 연결을 쓴다. 초기화 중에 닫으면 BullMQ 는 연결을 그대로 둔 채 오류 리스너만 떼고,
 * 이어서 `disconnectRedis()` 가 연결을 끊으면 남은 초기화 명령의 `Connection is closed` 를 받을 곳이 없어
 * 처리되지 않은 거절이 된다(짧은 테스트 파일이 CI 를 실패시켰다 — backlog E-69).
 */
export async function closeQueueWhenReady(queue: Pick<Queue, 'waitUntilReady' | 'close'>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    queue.waitUntilReady().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, QUEUE_READY_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
  await queue.close();
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all(connections.map((c) => c.quit().catch(() => undefined)));
  connections = [];
  publisher = null;
}

export function editProgressChannel(jobId: string): string {
  return `edit-progress:${jobId}`;
}
