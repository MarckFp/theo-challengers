// src/lib/services/challenge.ts
import { db } from '$lib/db';
import type { Player } from '$lib/models/player';
import type { Inventory } from '$lib/models/inventory';
import type { Challengue } from '$lib/models/challengue';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

// Helper to update leaderboard when interacting with peers
export async function updatePeerScore(nickname: string, score: number) {
    if (!nickname || score === undefined) return;
    try {
        const existing = await db.leaderboard.where('nickname').equals(nickname).first();
        if (existing) {
            await db.leaderboard.update(existing.id!, { score, updated_at: new Date() });
        } else {
            await db.leaderboard.add({ nickname, score, updated_at: new Date() });
        }
    } catch (e) {
        console.error('Leaderboard update failed', e);
    }
}

// ----------------------------------------------------
// SENDER LOGIC (Creating Challenges)
// ----------------------------------------------------

export async function createChallengeLink(
    currentUser: Player, 
    item: Inventory, 
    customMessage: string
): Promise<string | null> {
    if (!currentUser?.id || !item?.id) return null;

    const uniqueId = crypto.randomUUID();

    // 1. Save locally as pending
    await db.sentChallenge.add({
        uuid: uniqueId,
        player_id: currentUser.id!,
        title: item.title,
        description: item.description,
        points: item.points,
        message: customMessage,
        created_at: new Date(),
        status: 'pending'
    });

    // 2. Remove from inventory
    await db.inventory.delete(item.id!);

    // 3. Generate Link Payload
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
        message: customMessage
    };

    try {
        const jsonPayload = JSON.stringify(payload);
        const base64 = btoa(jsonPayload);
        return `${window.location.origin}?challenge=${base64}`;
    } catch (err) {
        console.error("Link generation failed", err);
        return null;
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

        // Update peer score
        if (data.claimerScore !== undefined) {
            await updatePeerScore(data.claimer, data.claimerScore);
        }

        // Find Challenge
        const challenge = await db.sentChallenge.where('uuid').equals(data.cid).first();
        if (!challenge) return { success: false, error: 'challenge_not_found' };
        
        if (challenge.status !== 'pending') {
             return { success: false, error: 'already_claimed' };
        }

        // Mark Accepted
        await db.sentChallenge.update(challenge.id!, {
            status: 'accepted',
            claimed_by: data.claimer
        });

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
            from: currentUser.nickname
        };

        const confirmB64 = btoa(JSON.stringify(authPayload));
        const link = `${window.location.origin}?finalize=${confirmB64}`;
        
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

    const existing = await db.challengue.where('uuid').equals(data.id).first();
    if (existing) {
        throw new Error('store.already_accepted_error');
    }

    if (data.fromScore !== undefined) {
        await updatePeerScore(data.from, data.fromScore);
    }

    return data; // Helper just validates, caller handles UI modal
}

export async function acceptChallenge(challengeData: any, currentUser: Player) {
    if (!currentUser?.id) return;
    
    await db.challengue.add({
        uuid: challengeData.id,
        player_id: currentUser.id!,
        title: challengeData.item.title,
        description: challengeData.item.description,
        points: challengeData.item.points,
        reward: challengeData.item.points, // Simplified reward logic
        from_player: challengeData.from,
        message: challengeData.message,
        // created_at missing in type but nice to have
    });
}

export async function generateVerificationLink(challenge: Challengue, currentUser: Player): Promise<string> {
    const claimPayload = {
        type: 'theo-claim-v1',
        cid: challenge.uuid,
        claimer: currentUser.nickname,
        claimerScore: currentUser.score || 0
    };
    const claimB64 = btoa(JSON.stringify(claimPayload));
    return `${window.location.origin}?verify_claim=${claimB64}`;
}

export async function finalizeChallengeClaim(authData: any, currentUser: Player) {
    if (authData.type !== 'theo-auth-v1' || !authData.valid) {
        throw new Error('Invalid Authorization Key');
    }

    const existing = await db.challengue.where('uuid').equals(authData.cid).first();
    if (!existing) throw new Error('store.challenge_not_found_error');
    if (existing.completed_at) throw new Error('store.already_achievement_error');

    if (authData.senderScore !== undefined && authData.from) {
        await updatePeerScore(authData.from, authData.senderScore);
    }

    // Apply Rewards & Streak
    const currentStreak = currentUser.streak || 0;
    const isStreakBonus = currentStreak >= 3;
    const multiplier = isStreakBonus ? 2 : 1;

    await db.challengue.update(existing.id!, {
        completed_at: new Date()
    });

    await db.player.update(currentUser.id!, {
        score: (currentUser.score || 0) + (existing.points * multiplier),
        coins: (currentUser.coins || 0) + existing.reward,
        streak: currentStreak + 1
    });

    return { multiplier, isStreakBonus };
}
