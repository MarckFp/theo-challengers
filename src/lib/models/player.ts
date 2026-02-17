export interface Player {
    id?: number
    nickname: string
    coins: number
    score: number // Leaderboard points
    lastShopUpdate?: string // Date string to track daily shop refresh
    shopItems?: any[] // Store current daily shop items
}