export interface Player {
    id?: number
    nickname: string
    coins: number
    score: number // Leaderboard points
    streak: number // Consecutive challenges completed
    lastShopUpdate?: string // Date string to track daily shop refresh
    lastWeeklyBonus?: string // Date string to track weekly login bonus
    lastMonthlyReset?: string // Date string (YYYY-MM) to track monthly score reset
    shopItems?: any[] // Store current daily shop items
    badges?: string[] // IDs of owned badges
    lifetimeScore?: number // Accumulated score for Rank/Level persistence
    tutorialSeen?: boolean // Whether the user has seen the tutorial
}