import type { Player } from '$lib/models/player';
import type { Badge } from '$lib/models/badge';

export interface ProfileCardSnapshot {
  nickname: string;
  avatarChar: string;
  avatarImage?: string;
  level: number;
  title: string;
  score: number;
  badges: Array<{ id: string; icon: string; name: string }>;
  theme?: string;
  createdAt: string;
}

type CompactBadgeV2 = [id: string, icon: string, name: string];
type CompactSnapshotV2 = [
  nickname: string,
  avatarChar: string,
  avatarImage: string,
  level: number,
  title: string,
  score: number,
  badges: CompactBadgeV2[],
  theme: string,
  createdAtEpochMs: number
];

const PROFILE_CARD_VERSION = 'v2';

function getShareLinkBase(): string {
  const configuredBase = (
    import.meta.env.PUBLIC_URL_BASE_LINK ??
    import.meta.env.PUBLIC_CHALLENGE_LINK_BASE
  )?.trim();
  if (configuredBase) return configuredBase;

  const currentOrigin = window.location.origin;
  const currentProtocol = window.location.protocol;
  if (currentProtocol === 'http:' || currentProtocol === 'https:') {
    return currentOrigin;
  }

  return 'https://head.theo-challengers.pages.dev';
}

function buildShareLink(paramName: string, encodedPayload: string): string {
  const url = new URL(getShareLinkBase());
  url.searchParams.set(paramName, encodedPayload);
  return url.toString();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlUtf8(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingLength);
  const bytes = base64ToBytes(padded);
  return new TextDecoder().decode(bytes);
}

function snapshotToCompactV2(snapshot: ProfileCardSnapshot): CompactSnapshotV2 {
  return [
    snapshot.nickname,
    snapshot.avatarChar,
    snapshot.avatarImage ?? '',
    snapshot.level,
    snapshot.title,
    snapshot.score,
    snapshot.badges.map((badge) => [badge.id, badge.icon, badge.name]),
    snapshot.theme ?? '',
    Date.parse(snapshot.createdAt) || Date.now()
  ];
}

function compactV2ToSnapshot(compact: unknown): ProfileCardSnapshot | null {
  if (!Array.isArray(compact) || compact.length < 9) return null;
  const [nickname, avatarChar, avatarImage, level, title, score, badges, theme, createdAtEpochMs] = compact;
  if (typeof nickname !== 'string' || typeof avatarChar !== 'string' || typeof title !== 'string') {
    return null;
  }

  const parsedBadges = Array.isArray(badges)
    ? badges
        .filter(
          (badge): badge is CompactBadgeV2 =>
            Array.isArray(badge) &&
            badge.length >= 3 &&
            typeof badge[0] === 'string' &&
            typeof badge[1] === 'string' &&
            typeof badge[2] === 'string'
        )
        .map(([id, icon, name]) => ({ id, icon, name }))
    : [];

  const createdAtDate =
    typeof createdAtEpochMs === 'number' && Number.isFinite(createdAtEpochMs)
      ? new Date(createdAtEpochMs)
      : new Date();

  return {
    nickname,
    avatarChar,
    avatarImage: typeof avatarImage === 'string' && avatarImage.length > 0 ? avatarImage : undefined,
    level: typeof level === 'number' ? level : 1,
    title,
    score: typeof score === 'number' ? score : 0,
    badges: parsedBadges,
    theme: typeof theme === 'string' && theme.length > 0 ? theme : undefined,
    createdAt: createdAtDate.toISOString()
  };
}

export function buildProfileCardSnapshot(
  player: Player,
  level: number,
  title: string,
  ownedBadges: Badge[],
  theme?: string
): ProfileCardSnapshot {
  return {
    nickname: player.nickname,
    avatarChar: (player.nickname || 'P').charAt(0).toUpperCase(),
    avatarImage: player.avatarImage,
    level,
    title,
    score: player.score || 0,
    badges: ownedBadges.slice(0, 6).map((badge) => ({
      id: badge.id,
      icon: badge.icon,
      name: badge.name
    })),
    theme,
    createdAt: new Date().toISOString()
  };
}

export function generateProfileCardLink(snapshot: ProfileCardSnapshot): string {
  const compact = snapshotToCompactV2(snapshot);
  const payload = `${PROFILE_CARD_VERSION}.${toBase64UrlUtf8(JSON.stringify(compact))}`;
  return buildShareLink('profile_card', payload);
}

export function isProfileCardLink(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.searchParams.has('profile_card');
  } catch {
    return false;
  }
}

export function extractProfileCardFromLink(rawUrl: string): ProfileCardSnapshot | null {
  try {
    const url = new URL(rawUrl);
    const data = url.searchParams.get('profile_card');
    if (!data) return null;

    if (!data.startsWith(`${PROFILE_CARD_VERSION}.`)) return null;
    const encoded = data.slice(PROFILE_CARD_VERSION.length + 1);
    if (!encoded) return null;
    const json = fromBase64UrlUtf8(encoded);
    const parsed = JSON.parse(json);
    return compactV2ToSnapshot(parsed);
  } catch {
    return null;
  }
}
