export interface Challengue {
    id?: number
    player_id: number
    title: string
    description: string
    points: number
    reward: number
    completed_at?: Date // If exists, it's history. If undefined, it's active.
    from_player?: string // Nickname of challenger
    message?: string // Message from challenger
}