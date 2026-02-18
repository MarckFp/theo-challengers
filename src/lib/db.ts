import Dexie, {type Table} from 'dexie'
import type {Player} from './models/player'
import type {Leaderboard} from './models/leaderboard'
import type {Inventory} from './models/inventory'
import type {Challengue} from './models/challengue'
import type {SentChallenge} from './models/sentChallenge'

export class MyDatabaseDexie extends Dexie {
    player!: Table<Player>
    leaderboard!: Table<Leaderboard>
    inventory!: Table<Inventory>
    challengue!: Table<Challengue>
    sentChallenge!: Table<SentChallenge>

    constructor() {
        super('theochallenguers')
        this.version(1).stores({
            player: '++id, nickname',
            leaderboard: '++id',
            inventory: '++id, player_id',
            challengue: '++id, player_id'
        })
        this.version(3).stores({
            player: '++id, nickname, score', // Index score for leaderboard
            inventory: '++id, player_id',
            challengue: '++id, player_id'
        })
        this.version(4).stores({
            player: '++id, nickname, score', // Index score for leaderboard
            inventory: '++id, player_id',
             challengue: '++id, player_id, uuid', // uuid index for preventing duplicates
             sentChallenge: '++id, uuid, player_id',
             leaderboard: '++id, &nickname' // Unique nickname for efficient updates
        })
        this.version(5).stores({
            leaderboard: '++id, &nickname, score' // Index score for ordering
        })
    }
}

export const db = new MyDatabaseDexie()