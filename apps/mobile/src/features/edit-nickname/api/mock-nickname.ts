let stored: string | null = null;

/** Mock mode keeps the nickname in memory, the way the server would keep it. */
export function mockReadNickname(): Promise<string | null> {
  return Promise.resolve(stored);
}

export function mockUpdateNickname(nickname: string): Promise<string | null> {
  stored = nickname;
  return Promise.resolve(stored);
}
