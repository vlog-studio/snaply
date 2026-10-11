import { readConnectResult } from './connect-result';

describe('readConnectResult', () => {
  it('reads the backend’s success return as connected', () => {
    expect(readConnectResult('snaplyapp://sns/connected?platform=instagram')).toEqual({
      kind: 'connected',
    });
  });

  // The one refusal the user can fix themselves (SNS-2): switch the account type.
  it('tells a personal account apart from other failures', () => {
    expect(
      readConnectResult('snaplyapp://sns/error?platform=instagram&reason=account_type'),
    ).toEqual({ kind: 'personal-account' });
  });

  it.each([
    'snaplyapp://sns/error?platform=instagram&reason=exchange_failed',
    'snaplyapp://sns/error?platform=instagram&reason=invalid_state',
    'snaplyapp://sns/error?platform=instagram',
    'snaplyapp://somewhere-else',
  ])('reads %s as a plain failure', (url) => {
    expect(readConnectResult(url)).toEqual({ kind: 'failed' });
  });
});
