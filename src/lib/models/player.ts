export interface Player {
    id?: number
    nickname: string
    coins: number
    score: number // Leaderboard points
    streak: number // Consecutive challenges completed
    lastShopUpdate?: string // Date string to track daily shop refresh
    lastDailyBonus?: string // Date string to track daily login bonus
    shopItems?: any[] // Store current daily shop items
    badges?: string[] // IDs of owned badges
}