// src/lib/services/leaderboard.ts
import { db } from '$lib/db';

export async function getGossipData(limit = 10) {
    try {
        const top = await db.leaderboard.orderBy('score').reverse().limit(limit).toArray();
        return top.map(u => ({ nickname: u.nickname, score: u.score, updated_at: u.updated_at }));
    } catch {
        return [];
    }
}

export async function processGossip(data: any, currentUser: any) {
    // 1. Process singular sender/claimer if present
    const externalUser = data.from || data.claimer;
    const externalScore = data.senderScore ?? data.claimerScore;
    
    if (externalUser && externalScore !== undefined) {
         try {
             if (!currentUser || externalUser !== currentUser.nickname) {
                const existing = await db.leaderboard.where({ nickname: externalUser }).first();
                if (existing) {
                    if (existing.score < externalScore) {
                        await db.leaderboard.update(existing.id!, { score: externalScore, updated_at: new Date() });
                    }
                } else {
                    await db.leaderboard.add({ nickname: externalUser, score: externalScore, updated_at: new Date() });
                }
             }
         } catch(e) { console.error("Error processing external gossip user", e); }
    }

    // 2. Process yourself
    if (currentUser) {
         try {
             const existingMe = await db.leaderboard.where({ nickname: currentUser.nickname }).first();
             if (existingMe && existingMe.score < currentUser.score) {
                 await db.leaderboard.update(existingMe.id!, { score: currentUser.score, updated_at: new Date() });
             } else if (!existingMe) {
                 await db.leaderboard.add({ nickname: currentUser.nickname, score: currentUser.score, updated_at: new Date() });
             }
         } catch {}
    }

    if (!data?.gossip || !Array.isArray(data.gossip)) return;

    // 3. Process gossip array
    for (const entry of data.gossip) {
        if (!entry.nickname || entry.score === undefined) continue;
        if (currentUser && entry.nickname === currentUser.nickname) {
             continue;
        }

        try {
            const existing = await db.leaderboard.where({ nickname: entry.nickname }).first();
            if (existing) {
                if (entry.score > existing.score) {
                    await db.leaderboard.update(existing.id!, { 
                        score: entry.score, 
                        updated_at: new Date(entry.updated_at || Date.now()) 
                    });
                }
            } else {
                await db.leaderboard.add({
                    nickname: entry.nickname,
                    score: entry.score,
                    updated_at: new Date(entry.updated_at || Date.now())
                });
            }
        } catch (e) {
            console.error('Failed to process gossip for', entry.nickname, e);
        }
    }
}
