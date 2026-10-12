import { NicknameMaxLength, nicknameSchema } from './nickname-schema';

describe('nicknameSchema', () => {
  it('trims the name it accepts', () => {
    expect(nicknameSchema.parse({ nickname: '  다연  ' })).toEqual({ nickname: '다연' });
  });

  // The server takes no empty nickname, so a blank field has nowhere to fall back to.
  it('refuses a blank name in the user’s words', () => {
    const result = nicknameSchema.safeParse({ nickname: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('이름을 입력해 주세요.');
  });

  it('refuses a name past the server’s limit', () => {
    expect(nicknameSchema.safeParse({ nickname: 'a'.repeat(NicknameMaxLength + 1) }).success).toBe(
      false,
    );
  });
});
