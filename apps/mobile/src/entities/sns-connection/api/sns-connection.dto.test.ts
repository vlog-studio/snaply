import { mapSnsConnections } from './sns-connection.dto';

describe('mapSnsConnections', () => {
  it('keeps an unknown expiry as unknown rather than as never', () => {
    const [connection] = mapSnsConnections([
      {
        platform: 'instagram',
        platformUsername: 'snaply',
        connectedAt: '2026-10-11T01:00:00.000Z',
        tokenExpiresAt: null,
      },
    ]);
    expect(connection).toEqual({
      platform: 'instagram',
      username: 'snaply',
      connectedAt: new Date('2026-10-11T01:00:00.000Z'),
      tokenExpiresAt: null,
    });
  });

  // A platform the server adds later must not fail the read or reach the screens.
  it('drops a platform this build does not know', () => {
    expect(
      mapSnsConnections([
        {
          platform: 'youtube',
          platformUsername: null,
          connectedAt: '2026-10-11T01:00:00.000Z',
          tokenExpiresAt: null,
        },
      ]),
    ).toEqual([]);
  });
});
