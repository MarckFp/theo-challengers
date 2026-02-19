// src/lib/services/challenge.ts
import { db } from '$lib/db';
import type { Player } from '$lib/models/player';
import type { Inventory } from '$lib/models/inventory';
import type { Challenge } from '$lib/models/challenge';
import { getGossipData, processGossip } from './leaderboard';

function getShareLinkBase(): string {
    const configuredBase = (
        import.meta.env.PUBLIC_URL_BASE_LINK ??
        import.meta.env.PUBLIC_CHALLENGE_LINK_BASE
    )?.trim();
    if (configuredBase) return configuredBase;

    const currentOrigin = window.location.origin;
    if (currentOrigin.includes('tauri.localhost')) {
        return 'theochallengers://challenge';
    }

    return currentOrigin;
}

function buildShareLink(paramName: string, encodedPayload: string): string {
    const url = new URL(getShareLinkBase());
    url.searchParams.set(paramName, encodedPayload);
    return url.toString();
}

// Helper to update leaderboard when interacting with peers
export async function updatePeerScore(nickname: string, score: number) {
    // Deprecated in favor of processGossip, but kept for compatibility
    if (!nickname || score === undefined) return;
    await processGossip({ gossip: [{ nickname, score, updatedAt: new Date() }] }, null);
}

// ----------------------------------------------------
// SENDER LOGIC (Creating Challenges)
// ----------------------------------------------------

export async function createChallengeLink(
    currentUser: Player, 
    item: Inventory, 
    customMessage: string
): Promise<{ id: string; link: string } | null> {
    if (!currentUser?.id || !item?.id) return null;

    const uniqueId = crypto.randomUUID();

    // Generate draft only. Commit happens when user actually shares.
    const gossip = await getGossipData();

    // Generate Link Payload
    const payload = {
        type: 'theo-challenge-req-v1',
        id: uniqueId,
        from: currentUser.nickname,
        fromScore: currentUser.score,
        item: {
            title: item.title,
            points: item.points,
            description: item.description
        },
        message: customMessage,
        gossip: gossip // Piggyback leaderboard
    };

    try {
        const jsonPayload = JSON.stringify(payload);
        const base64 = btoa(jsonPayload);
        return {
            id: uniqueId,
            link: buildShareLink('challenge', base64)
        };
    } catch (err) {
        console.error("Link generation failed", err);
        return null;
    }
}

export async function commitChallengeLink(
    currentUser: Player,
    item: Inventory,
    customMessage: string,
    challengeId: string
): Promise<boolean> {
    if (!currentUser?.id || !item?.id || !challengeId) return false;

    const existing = await db.sentChallenge.where('uuid').equals(challengeId).first();
    if (!existing) {
        await db.sentChallenge.add({
            uuid: challengeId,
            playerId: currentUser.id!,
            title: item.title,
            description: item.description,
            points: item.points,
            message: customMessage,
            createdAt: new Date(),
            status: 'pending'
        });
    }

    await db.inventory.delete(item.id);
    return true;
}

export async function rollbackChallengeLink(
    item: Inventory,
    challengeId: string
): Promise<void> {
    if (challengeId) {
        await db.sentChallenge.where('uuid').equals(challengeId).delete();
    }

    if (!item.id) return;

    const inventoryItem = await db.inventory.get(item.id);
    if (!inventoryItem) {
        await db.inventory.put(item);
    }
}

export async function verifyClaimCode(
    currentUser: Player, 
    codeOrUrl: string
): Promise<{ success: boolean; authRawLink?: string; error?: string }> {
    try {
        let code = codeOrUrl;
        if (code.includes('verify_claim=')) {
            code = code.split('verify_claim=')[1];
        }

        const json = atob(code);
        const data = JSON.parse(json);

        if (data.type !== 'theo-claim-v1') return { success: false, error: 'invalid_code' };

        // Process Gossip & Peer Score
        await processGossip(data, currentUser);

        // Find Challenge
        const challenge = await db.sentChallenge.where('uuid').equals(data.cid).first();
        if (!challenge) return { success: false, error: 'challenge_not_found' };
        
        if (challenge.status !== 'pending') {
             return { success: false, error: 'already_claimed' };
        }

        // Mark Accepted
        await db.sentChallenge.update(challenge.id!, {
            status: 'accepted',
            claimedBy: data.claimer
        });

        // Get Gossip
        const gossip = await getGossipData();

        // Generate Final Authorization Link
        const authPayload = {
            type: 'theo-auth-v1',
            cid: data.cid,
            valid: true,
            senderScore: currentUser.score || 0,
            item: {
                title: challenge.title,
                description: challenge.description,
                points: challenge.points
            },
            message: challenge.message,
            from: currentUser.nickname,
            gossip: gossip
        };

        const confirmB64 = btoa(JSON.stringify(authPayload));
        const link = buildShareLink('finalize', confirmB64);
        
        return { success: true, authRawLink: link };

    } catch (e) {
        console.error(e);
        return { success: false, error: 'verification_failed' };
    }
}


// ----------------------------------------------------
// RECEIVER LOGIC (Accepting & Completing Challenges)
// ----------------------------------------------------

export async function processIncomingChallengeLink(data: any, currentUser: Player) {
    if (data.type !== 'theo-challenge-req-v1') return null;
    
    if (data.from === currentUser.nickname) {
        throw new Error('store.accept_own_error');
    }

    const existing = await db.challenge.where('uuid').equals(data.id).first();
    if (existing) {
        throw new Error('store.already_accepted_error');
    }

    // Process gossip
    await processGossip(data, currentUser);

    return data; // Helper just validates, caller handles UI modal
}

export async function acceptChallenge(challengeData: any, currentUser: Player) {
    if (!currentUser?.id) return;
    
    await db.challenge.add({
        uuid: challengeData.id,
        playerId: currentUser.id!,
        title: challengeData.item.title,
        description: challengeData.item.description,
        points: challengeData.item.points,
        reward: challengeData.item.points, // Simplified reward logic
        fromPlayer: challengeData.from,
        message: challengeData.message,
        // created_at missing in type but nice to have
    });
}

export async function generateVerificationLink(challenge: Challenge, currentUser: Player): Promise<string> {
    const gossip = await getGossipData();
    const claimPayload = {
        type: 'theo-claim-v1',
        cid: challenge.uuid,
        claimer: currentUser.nickname,
        claimerScore: currentUser.score || 0, // kept for legacy
        gossip: gossip
    };
    const claimB64 = btoa(JSON.stringify(claimPayload));
    return buildShareLink('verify_claim', claimB64);
}

export async function finalizeChallengeClaim(authData: any, currentUser: Player) {
    if (authData.type !== 'theo-auth-v1' || !authData.valid) {
        throw new Error('Invalid Authorization Key');
    }

    const existing = await db.challenge.where('uuid').equals(authData.cid).first();
    if (!existing) throw new Error('store.challenge_not_found_error');
    if (existing.completedAt) throw new Error('store.already_achievement_error');

    // Process gossip
    await processGossip(authData, currentUser);

    // Apply Rewards & Streak
    const currentStreak = currentUser.streak || 0;
    const isStreakBonus = currentStreak >= 3;
    const multiplier = isStreakBonus ? 2 : 1;

    await db.challenge.update(existing.id!, {
        completedAt: new Date()
    });

    await db.player.update(currentUser.id!, {
        score: (currentUser.score || 0) + (existing.points * multiplier),
        lifetimeScore: (currentUser.lifetimeScore ?? currentUser.score ?? 0) + (existing.points * multiplier),
        coins: (currentUser.coins || 0) + existing.reward,
        streak: currentStreak + 1
    });

    return { multiplier, isStreakBonus };
}
