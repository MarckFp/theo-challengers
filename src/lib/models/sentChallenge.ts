export interface SentChallenge {
    id?: number
    uuid: string
    player_id: number
    title: string
    description: string
    points: number
    message?: string
    created_at: Date
    claimed_by?: string
    status: 'pending' | 'accepted' | 'rejected'
}
