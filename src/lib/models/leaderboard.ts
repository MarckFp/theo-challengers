export interface Leaderboard {
    id?: number;
    nickname: string;
    score: number;
    updated_at: Date;
    // Optional: last seen via gossip from 'source'
}
