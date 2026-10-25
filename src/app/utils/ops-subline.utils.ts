/** Secondary table line: city and email without a stray "— ·" when city is missing. */
export function formatCityEmailSubline(city: unknown, email: unknown): string {
  const cityText = String(city ?? '').trim();
  const emailText = String(email ?? '').trim();
  if (cityText && emailText) return `${cityText} · ${emailText}`;
  if (emailText) return emailText;
  if (cityText) return cityText;
  return '—';
}
