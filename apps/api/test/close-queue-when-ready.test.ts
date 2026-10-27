/**
 * 큐를 닫는 순서를 고정한다 — 연결 초기화가 끝난 뒤에 닫는다(backlog E-69).
 *
 * 초기화 중에 닫힌 큐는 오류 리스너를 잃고, 이어서 공유 Redis 연결이 끊기면 남은 초기화 명령의
 * `Connection is closed` 가 처리되지 않은 거절이 되어 테스트 실행이 실패했다. 그 경쟁은 CI 의 Redis
 * 타이밍에서만 나 그대로 재현할 수 없으므로, 닫기 전에 준비를 기다리는지 · 기다림에 끝이 있는지를 본다.
 *
 * DB·Redis 를 쓰지 않는 순수 검사다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeQueueWhenReady } from '../src/lib/redis.js';

function fakeQueue(ready: Promise<unknown>) {
  const calls: string[] = [];
  return {
    calls,
    waitUntilReady: vi.fn(() => ready.then(() => calls.push('ready')) as never),
    close: vi.fn(async () => {
      calls.push('close');
    }),
  };
}

describe('closeQueueWhenReady', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes only after the connection finished initializing', async () => {
    let markReady!: () => void;
    const queue = fakeQueue(new Promise<void>((resolve) => (markReady = resolve)));

    const closing = closeQueueWhenReady(queue);
    await Promise.resolve();
    expect(queue.close).not.toHaveBeenCalled();

    markReady();
    await closing;
    expect(queue.calls).toEqual(['ready', 'close']);
  });

  it('still closes when the connection never gets ready — shutdown must not hang on a dead Redis', async () => {
    vi.useFakeTimers();
    const queue = fakeQueue(new Promise<void>(() => undefined));

    const closing = closeQueueWhenReady(queue);
    await vi.advanceTimersByTimeAsync(5_000);
    await closing;

    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it('still closes when initializing failed', async () => {
    const queue = fakeQueue(Promise.reject(new Error('Connection is closed.')));

    await closeQueueWhenReady(queue);

    expect(queue.close).toHaveBeenCalledTimes(1);
  });
});
