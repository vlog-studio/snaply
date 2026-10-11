import { needsReconnect, type SnsConnection } from './sns-connection';

const now = Date.parse('2026-10-11T12:00:00.000Z');

function connection(tokenExpiresAt: Date | null): SnsConnection {
  return { platform: 'instagram', username: 'snaply', connectedAt: new Date(0), tokenExpiresAt };
}

describe('needsReconnect', () => {
  it('trusts a link whose access lasts past now', () => {
    expect(needsReconnect(connection(new Date(now + 60_000)), now)).toBe(false);
  });

  it.each([
    ['access that has run out', new Date(now - 60_000)],
    ['access ending exactly now', new Date(now)],
    // The contract: null is "unknown", which can lapse silently.
    ['an unknown expiry', null],
  ])('asks for a new link on %s', (_case, expiresAt) => {
    expect(needsReconnect(connection(expiresAt), now)).toBe(true);
  });
});
