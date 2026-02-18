import Dexie, {type Table} from 'dexie'
import type {Player} from './models/player'
import type {Leaderboard} from './models/leaderboard'
import type {Inventory} from './models/inventory'
import type {Challengue} from './models/challengue'

export class MyDatabaseDexie extends Dexie {
    player!: Table<Player>
    leaderboard!: Table<Leaderboard>
    inventory!: Table<Inventory>
    challengue!: Table<Challengue>

    constructor() {
        super('theochallenguers')
        this.version(1).stores({
            player: '++id, nickname',
            leaderboard: '++id',
            inventory: '++id, player_id',
            challengue: '++id, player_id'
        })
        this.version(4).stores({
            player: '++id, nickname, score', 
            inventory: '++id, player_id',
            challengue: '++id, player_id, completed_at' // Index completed_at to easily filter active/history
        })
    }
}

export const db = new MyDatabaseDexie()