import { formatCityEmailSubline } from './ops-subline.utils';

describe('formatCityEmailSubline', () => {
  it('shows email only when city is missing', () => {
    expect(formatCityEmailSubline('', 'a@b.co')).toBe('a@b.co');
    expect(formatCityEmailSubline(null, 'a@b.co')).toBe('a@b.co');
  });

  it('joins city and email when both present', () => {
    expect(formatCityEmailSubline('Durban', 'a@b.co')).toBe('Durban · a@b.co');
  });
});
