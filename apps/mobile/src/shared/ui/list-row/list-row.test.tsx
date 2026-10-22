import { render, screen } from '@testing-library/react-native';

import { ListRow } from './list-row';

describe('ListRow', () => {
  // Beside its name at large system text on a narrow phone the value ran off
  // the row (the movie detail sheet's 완성 at 2x on a 360dp phone). The line
  // wraps instead: the value moves whole to its own line, right-aligned.
  it('lets a value with no room beside its name move to its own line', async () => {
    await render(<ListRow name="완성" value="10월 19일 오후 11:31" />);

    const value = screen.getByText('10월 19일 오후 11:31');
    expect(value).toHaveStyle({ marginLeft: 'auto', textAlign: 'right' });
    expect(value).not.toHaveProp('numberOfLines');
  });
});
