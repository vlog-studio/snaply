import { coverSubjectRect } from './capture-guide';

describe('coverSubjectRect', () => {
  it('places the subject where the cover-fitted frame puts it', () => {
    // A 9:16 frame into a taller 9:20 area: scaled by height, cropped at the sides.
    const rect = coverSubjectRect(
      { cx: 0.5, cy: 0.5, size: 0.25 },
      { width: 1080, height: 1920 },
      { width: 360, height: 800 },
    );
    const scale = 800 / 1920;
    const side = 0.25 * 1080 * scale;

    expect(rect.width).toBeCloseTo(side);
    expect(rect.left + rect.width / 2).toBeCloseTo(180);
    expect(rect.top + rect.height / 2).toBeCloseTo(400);
  });

  it('keeps an off-centre subject off-centre by the same share of the frame', () => {
    const rect = coverSubjectRect(
      { cx: 0.25, cy: 0.75, size: 0.1 },
      { width: 1000, height: 1000 },
      { width: 500, height: 500 },
    );

    expect(rect.left + rect.width / 2).toBeCloseTo(125);
    expect(rect.top + rect.height / 2).toBeCloseTo(375);
  });
});
