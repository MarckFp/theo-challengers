export interface SentChallenge {
    id?: number
    uuid: string
    playerId: number
    title: string
    description: string
    points: number
    message?: string
    createdAt: Date
    expiresAt?: Date
    expiryCost?: number
    claimedBy?: string
    status: 'pending' | 'accepted' | 'rejected'
}
