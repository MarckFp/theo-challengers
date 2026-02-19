export interface Challenge {
    id?: number
    uuid?: string // Unique ID from sender
    playerId: number
    title: string
    description: string
    points: number
    reward: number
    completedAt?: Date
    fromPlayer?: string
    message?: string
}