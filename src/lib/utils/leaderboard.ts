import { db } from '$lib/db';
import type { Leaderboard } from '$lib/models/leaderboard';

export async function updateLeaderboard(nickname: string, score: number) {
    if (!nickname || score === undefined) return;

    try {
        const existing = await db.leaderboard.where('nickname').equals(nickname).first();
        if (existing) {
            await db.leaderboard.update(existing.id!, {
                score,
                updated_at: new Date()
            });
        } else {
            await db.leaderboard.add({
                nickname,
                score,
                updated_at: new Date()
            });
        }
    } catch (e) {
        console.error('Failed to update leaderboard', e);
    }
}
