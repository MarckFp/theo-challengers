export type ChallengeExpiryKey = 'none' | '72h' | '24h' | '6h' | '1h';

export interface ChallengeExpiryOption {
  key: ChallengeExpiryKey;
  hours: number | null;
  cost: number;
  labelKey: string;
}

export const CHALLENGE_EXPIRY_OPTIONS: ChallengeExpiryOption[] = [
  { key: 'none', hours: null, cost: 0, labelKey: 'home.expiry_none' },
  { key: '72h', hours: 72, cost: 1, labelKey: 'home.expiry_72h' },
  { key: '24h', hours: 24, cost: 2, labelKey: 'home.expiry_24h' },
  { key: '6h', hours: 6, cost: 4, labelKey: 'home.expiry_6h' },
  { key: '1h', hours: 1, cost: 6, labelKey: 'home.expiry_1h' }
];

export function resolveExpiryOption(key: string): ChallengeExpiryOption {
  return CHALLENGE_EXPIRY_OPTIONS.find((opt) => opt.key === key) ?? CHALLENGE_EXPIRY_OPTIONS[0];
}

export function computeExpiresAt(hours: number | null): Date | null {
  if (!hours) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function isExpired(expiresAt?: Date | string | null): boolean {
  if (!expiresAt) return false;
  const value = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return value.getTime() <= Date.now();
}
