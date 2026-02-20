// src/lib/services/proximity-verify.ts
// Proximity-based challenge verification using a single QR scan.
//
// Flow (Player A = sender/verifier, Player B = receiver/completer):
//   1. Player A clicks "Approve" on a sent challenge → sentChallenge is
//      marked accepted and an approval QR is displayed.
//   2. Player B scans the QR → their challenge is completed and rewards
//      (points, coins, streak) are awarded.
//
// Player B cannot self-verify because rewards require scanning Player A's
// approval QR. No servers, no network — just one QR shown and scanned.

import { db } from '$lib/db';
import type { Player } from '$lib/models/player';
import type { SentChallenge } from '$lib/models/sentChallenge';

// ── QR prefix for instant type detection ────────────────────────────
const APPROVAL_PREFIX = 'TA:';   // Theo Approval

// ── Payload type ────────────────────────────────────────────────────
interface ApprovalPayload {
    i: string;   // challenge UUID (shared between sender & receiver)
    n: string;   // approver nickname (Player A)
    p: number;   // challenge points (for display only)
}

// ── Link helpers ────────────────────────────────────────────────────

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

// ── Detection ───────────────────────────────────────────────────────

/** Check whether a scanned string is a proximity-approval QR. */
export function isProximityApprovalQR(data: string): boolean {
    return data.startsWith(APPROVAL_PREFIX);
}

/** Check whether a URL is an approval link. */
export function isApprovalLink(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        return url.searchParams.has('approve');
    } catch {
        return false;
    }
}

/** Extract approval data from a URL (returns the raw TA: prefixed string). */
export function extractApprovalFromLink(rawUrl: string): string | null {
    try {
        const url = new URL(rawUrl);
        const data = url.searchParams.get('approve');
        if (!data) return null;
        return APPROVAL_PREFIX + data;
    } catch {
        return null;
    }
}

/** Strip the prefix and return the raw base-64 payload. */
function stripPrefix(data: string): string {
    return data.startsWith(APPROVAL_PREFIX) ? data.slice(APPROVAL_PREFIX.length) : data;
}

// ── Build approval payload (shared by QR and link) ──────────────────

function buildApprovalPayload(sentChallenge: SentChallenge, currentUser: Player): { qrData: string; link: string } {
    const payload: ApprovalPayload = {
        i: sentChallenge.uuid,
        n: currentUser.nickname,
        p: sentChallenge.points,
    };
    const b64 = btoa(JSON.stringify(payload));
    return {
        qrData: APPROVAL_PREFIX + b64,
        link: buildShareLink('approve', b64),
    };
}

// ── Player A: approve sent challenge & generate QR ──────────────────

export interface ApprovalResult {
    success: boolean;
    qrData?: string;
    link?: string;
    error?: string;
}

/**
 * Player A clicks "Approve" → marks their sentChallenge as accepted
 * and returns both a QR and a share-link for Player B.
 */
export async function generateApprovalQR(
    sentChallenge: SentChallenge,
    currentUser: Player
): Promise<ApprovalResult> {
    try {
        if (!sentChallenge.uuid)                return { success: false, error: 'missing_details' };
        if (sentChallenge.status !== 'pending') return { success: false, error: 'already_claimed' };

        // Mark sent challenge as accepted on Player A's side
        await db.sentChallenge.update(sentChallenge.id!, {
            status: 'accepted',
        });

        const { qrData, link } = buildApprovalPayload(sentChallenge, currentUser);
        return { success: true, qrData, link };
    } catch (e) {
        console.error('[proximity] generateApprovalQR error', e);
        return { success: false, error: 'verification_failed' };
    }
}

/**
 * Re-generate the QR / link for an already-accepted sent challenge.
 * This is used when Player A closed the modal before Player B could scan.
 */
export function regenerateApproval(
    sentChallenge: SentChallenge,
    currentUser: Player
): ApprovalResult {
    if (!sentChallenge.uuid) return { success: false, error: 'missing_details' };
    const { qrData, link } = buildApprovalPayload(sentChallenge, currentUser);
    return { success: true, qrData, link };
}

// ── Player B: scan approval QR → get rewards ────────────────────────

export interface VerifyResult {
    success: boolean;
    challengeTitle?: string;
    multiplier?: number;
    isStreakBonus?: boolean;
    approverName?: string;
    error?: string;
}

/**
 * Player B scans the approval QR → finds their challenge, awards
 * points / coins / streak, and marks the challenge as completed.
 */
export async function processApprovalQR(
    rawData: string,
    currentUser: Player
): Promise<VerifyResult> {
    try {
        const json = atob(stripPrefix(rawData));
        const data: ApprovalPayload = JSON.parse(json);

        // Find the matching challenge on Player B's device
        const challenge = await db.challenge
            .where('uuid').equals(data.i)
            .and(c => c.playerId === currentUser.id!)
            .first();

        if (!challenge)         return { success: false, error: 'challenge_not_found' };
        if (challenge.completedAt) return { success: false, error: 'already_achievement' };

        // Streak / multiplier
        const currentStreak = currentUser.streak || 0;
        const isStreakBonus  = currentStreak >= 3;
        const multiplier     = isStreakBonus ? 2 : 1;
        const pointsEarned   = challenge.points * multiplier;

        // Mark challenge complete
        await db.challenge.update(challenge.id!, { completedAt: new Date() });

        // Award score, lifetime score, coins, streak
        const newScore = (currentUser.score || 0) + pointsEarned;
        await db.player.update(currentUser.id!, {
            score:         newScore,
            lifetimeScore: (currentUser.lifetimeScore ?? currentUser.score ?? 0) + pointsEarned,
            coins:         (currentUser.coins || 0) + challenge.reward,
            streak:        currentStreak + 1,
        });

        return {
            success: true,
            challengeTitle: challenge.title,
            multiplier,
            isStreakBonus,
            approverName: data.n,
        };
    } catch (e) {
        console.error('[proximity] processApprovalQR error', e);
        return { success: false, error: 'verification_failed' };
    }
}
