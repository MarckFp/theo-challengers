export interface Leaderboard {
    id?: number;
    nickname: string;
    score: number;
    updatedAt: Date;
    // Optional: last seen via gossip from 'source'
}
