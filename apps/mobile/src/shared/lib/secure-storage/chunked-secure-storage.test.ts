import * as SecureStore from 'expo-secure-store';

import {
  chunkedSecureStorage,
  forgetChunkedSecureStorageMemory,
  splitByUtf8Bytes,
} from './chunked-secure-storage';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

const backingStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const encoder = new TextEncoder();
const utf8Bytes = (value: string): number => encoder.encode(value).length;

// A session-sized value with 3-byte (Korean) and 4-byte (emoji, surrogate pair)
// characters, well over SecureStore's ~2048-byte single-value limit.
const largeValue = '가나다'.repeat(1200) + '😀';

describe('splitByUtf8Bytes', () => {
  it('keeps every chunk within the byte budget and reassembles exactly', () => {
    const parts = splitByUtf8Bytes(largeValue, 1800);

    for (const part of parts) {
      expect(utf8Bytes(part)).toBeLessThanOrEqual(1800);
    }
    expect(parts.join('')).toBe(largeValue);
    expect(parts.length).toBeGreaterThan(1);
  });

  it('never splits a surrogate pair across a boundary', () => {
    // 500 emoji = 2000 UTF-8 bytes, forcing a boundary mid-run.
    const emojis = '😀'.repeat(500);
    const parts = splitByUtf8Bytes(emojis, 100);

    // A broken surrogate would corrupt on rejoin; exact equality proves it held.
    expect(parts.join('')).toBe(emojis);
  });
});

describe('chunkedSecureStorage', () => {
  beforeEach(() => {
    backingStore.clear();
    forgetChunkedSecureStorageMemory();
    jest.clearAllMocks();
  });

  it('round-trips a value larger than the single-value limit', async () => {
    await chunkedSecureStorage.setItem('sb-ref-auth-token', largeValue);

    expect(await chunkedSecureStorage.getItem('sb-ref-auth-token')).toBe(largeValue);
  });

  it('stores no individual chunk larger than the byte budget', async () => {
    await chunkedSecureStorage.setItem('sb-ref-auth-token', largeValue);

    for (const [key, value] of backingStore) {
      if (key.endsWith('.chunks')) continue;
      expect(utf8Bytes(value)).toBeLessThanOrEqual(1800);
    }
  });

  it('returns null for an absent key', async () => {
    expect(await chunkedSecureStorage.getItem('missing')).toBeNull();
  });

  it('removes every chunk on removeItem', async () => {
    await chunkedSecureStorage.setItem('sb-ref-auth-token', largeValue);
    await chunkedSecureStorage.removeItem('sb-ref-auth-token');

    expect(await chunkedSecureStorage.getItem('sb-ref-auth-token')).toBeNull();
    expect([...backingStore.keys()].some((key) => key.startsWith('sb-ref-auth-token'))).toBe(false);
  });

  it('replaces prior chunks when a shorter value is written', async () => {
    await chunkedSecureStorage.setItem('sb-ref-auth-token', largeValue);
    await chunkedSecureStorage.setItem('sb-ref-auth-token', 'small');

    expect(await chunkedSecureStorage.getItem('sb-ref-auth-token')).toBe('small');
  });

  it('persists a write so a fresh process reads it back', async () => {
    await chunkedSecureStorage.setItem('sb-ref-auth-token', largeValue);
    await chunkedSecureStorage.setItem('sb-ref-auth-token', 'small');
    forgetChunkedSecureStorageMemory();

    expect(await chunkedSecureStorage.getItem('sb-ref-auth-token')).toBe('small');
  });

  // E-30: a cold start's burst of requests each read the session; one native
  // read now answers all of them, and later reads none.
  it('reads the device once for concurrent and repeated reads', async () => {
    backingStore.set('k.chunks', '1');
    backingStore.set('k.0', 'session');

    const values = await Promise.all([1, 2, 3, 4].map(() => chunkedSecureStorage.getItem('k')));
    await chunkedSecureStorage.getItem('k');

    expect(values).toEqual(['session', 'session', 'session', 'session']);
    // One count read and one chunk read.
    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
  });

  it('answers from what was written without reading the device', async () => {
    await chunkedSecureStorage.setItem('k', 'fresh');
    jest.mocked(SecureStore.getItemAsync).mockClear();

    expect(await chunkedSecureStorage.getItem('k')).toBe('fresh');
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it('lets a write that lands during a read win over that read', async () => {
    backingStore.set('k.chunks', '1');
    backingStore.set('k.0', 'old');

    const read = chunkedSecureStorage.getItem('k');
    await chunkedSecureStorage.setItem('k', 'new');

    expect(await read).toBe('new');
    expect(await chunkedSecureStorage.getItem('k')).toBe('new');
  });

  it('remembers a removal', async () => {
    await chunkedSecureStorage.setItem('k', 'value');
    await chunkedSecureStorage.removeItem('k');

    expect(await chunkedSecureStorage.getItem('k')).toBeNull();
  });
});
