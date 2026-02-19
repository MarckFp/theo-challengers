// src/lib/services/leaderboard.ts
import { db } from '$lib/db';
import type { Player } from '$lib/models/player';

export interface LeaderboardEntry {
    nickname: string;
    score: number;
    updatedAt: Date;
}

export async function getGossipData(limit = 10): Promise<LeaderboardEntry[]> {
    try {
        const top = await db.leaderboard.orderBy('score').reverse().limit(limit).toArray();
        return top.map(u => ({ 
            nickname: u.nickname, 
            score: u.score, 
            updatedAt: u.updatedAt || new Date() 
        }));
    } catch {
        return [];
    }
}

export async function processLeaderboardUpdate(nickname: string, score: number, updatedAt: Date = new Date()) {
    try {
        const existing = await db.leaderboard.where('nickname').equals(nickname).first();
        if (existing) {
             // Conflict resolution: only update if score changed or newer
             if (existing.score !== score || (existing.updatedAt && existing.updatedAt < updatedAt)) {
                await db.leaderboard.update(existing.id!, { score, updatedAt });
             }
        } else {
             // Avoid adding invalid entries
             if (!score && score !== 0) return;
             await db.leaderboard.add({ nickname, score, updatedAt });
        }
    } catch (e) {
        console.error('Failed to update leaderboard entry for', nickname, e);
    }
}

export async function processGossip(data: any, currentUser: Player | null) {
    if (!data) return;

    // 1. Process singular sender/claimer if present
    const externalUser = data.from || data.claimer;
    const externalScore = data.senderScore ?? data.claimerScore;
    
    if (externalUser && externalScore !== undefined) {
         if (!currentUser || externalUser !== currentUser.nickname) {
            await processLeaderboardUpdate(externalUser, externalScore, new Date());
         }
    }

    // 2. Process yourself
    if (currentUser?.nickname) {
        await processLeaderboardUpdate(currentUser.nickname, currentUser.score, new Date());
    }

    if (!data.gossip || !Array.isArray(data.gossip)) return;

    // 3. Process gossip array
    for (const entry of data.gossip) {
        if (!entry.nickname || entry.score === undefined) continue;
        if (currentUser && entry.nickname === currentUser.nickname) {
             continue; // Don't overwrite correct local score with potentially outdated gossip about self
        }
        
        const timestamp = entry.updatedAt ? new Date(entry.updatedAt) : (entry.updated_at ? new Date(entry.updated_at) : new Date());
        await processLeaderboardUpdate(entry.nickname, entry.score, timestamp);
    }
}
