import { db } from '$lib/db';
import { liveQuery } from 'dexie';
import type { Player } from '$lib/models/player';

// Global rune for the current user
let currentUser = $state<Player | null>(null);
let initialized = $state(false);

// Subscribe once when the module is first imported/instantiated (Effectively a singleton store in Svelte 5 logic)
// Since this is a module scope variable, we need an initialization function that can be called 
// or we can rely on `liveQuery` being setup outside of a component.
// However, `liveQuery` needs to run.

// Using a factory pattern for the store
export function useUser() {
    // Only subscribe once
    if (!initialized) {
        liveQuery(() => db.player.toArray()).subscribe({
            next: (players) => {
                if (players.length > 0) {
                    currentUser = players[0];
                } else {
                    currentUser = null;
                }
                initialized = true;
            },
            error: (err) => {
                console.error("Failed to load user", err);
                initialized = true; 
            }
        });
    }

    return {
        get value() { return currentUser; },
        get loading() { return !initialized; }
    };
}
