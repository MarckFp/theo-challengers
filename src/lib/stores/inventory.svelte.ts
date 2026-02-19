import { db } from '$lib/db';
import { liveQuery } from 'dexie';
import type { Inventory } from '$lib/models/inventory';

let items = $state<Inventory[]>([]);
let loading = $state(true);

let currentSub: any = null;
let currentUserId: number | undefined = undefined;

export function initInventory(userId: number | undefined) {
    if (userId === currentUserId && currentSub) return;
    
    // Clean up if user changed
    if (currentSub) {
        currentSub.unsubscribe();
        currentSub = null;
    }
    
    currentUserId = userId;

    if (userId) {
        loading = true;
        currentSub = liveQuery(() => 
            db.inventory.where('playerId').equals(userId).toArray()
        ).subscribe({
            next: (result) => {
                items = result;
                loading = false;
            },
            error: (err) => {
                console.error('Inventory subscription error:', err);
                loading = false;
            }
        });
    } else {
        items = [];
        loading = false;
    }
}

export function useInventory() {
    return {
        get value() { return items },
        get loading() { return loading },
        get count() { return items.length }
    };
}
