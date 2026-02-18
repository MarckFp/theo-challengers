export interface Challengue {
    id?: number
    uuid?: string // Unique ID from sender
    player_id: number
    title: string
    description: string
    points: number
    reward: number
    completed_at?: Date
    from_player?: string
    message?: string
}