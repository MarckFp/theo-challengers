import Dexie, {type Table} from 'dexie';
import type {Player} from './models/player';
import type {Leaderboard} from './models/leaderboard';
import type {Inventory} from './models/inventory';
import type {Challenge} from './models/challenge';
import type {SentChallenge} from './models/sentChallenge';

class MyDatabaseDexie extends Dexie {
    player!: Table<Player>;
    leaderboard!: Table<Leaderboard>;
    inventory!: Table<Inventory>;
    challenge!: Table<Challenge>;
    sentChallenge!: Table<SentChallenge>;

    constructor() {
        super('theochallengers'); // Correct DB name
        this.version(1).stores({
            player: '++id, nickname, score', 
            leaderboard: '++id, &nickname, score', // Indeces
            inventory: '++id, playerId', // camelCase keys
            challenge: '++id, playerId, uuid, fromPlayer, completedAt', 
            sentChallenge: '++id, uuid, playerId, status'
        });
    }
}

export const db = new MyDatabaseDexie();
