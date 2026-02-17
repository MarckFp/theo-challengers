<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';

    let players = $state<Player[]>([]);
    let inventoryItems = $state<Inventory[]>([]);

    // Subscribe to player
    $effect(() => {
        const sub = liveQuery(() => db.player.toArray()).subscribe(p => {
            players = p;
        });
        return () => sub.unsubscribe();
    });

    let player = $derived(players[0]);

    // Subscribe to inventory items
    $effect(() => {
        if (!player || !player.id) return;
        const sub = liveQuery(() => 
            db.inventory.where('player_id').equals(player.id!).toArray()
        ).subscribe(items => {
            inventoryItems = items;
        });
        return () => sub.unsubscribe();
    });

    // async function completeChallenge(item: Inventory) {
    //     if (!player || !player.id || !item.id) return;

    //     if (!confirm(`Complete "${item.title}"? You will define your own success.`)) return;

    //     try {
    //         await db.transaction('rw', db.player, db.inventory, db.challengue, async () => {
    //             // 1. Add History
    //             await db.challengue.add({
    //                 player_id: player.id!,
    //                 title: item.title,
    //                 description: item.description,
    //                 points: item.points,
    //                 reward: item.reward,
    //                 completed_at: new Date()
    //             });

    //             // 2. Update Player (Score + Reward)
    //             await db.player.update(player.id!, {
    //                 score: (player.score || 0) + item.points,
    //                 coins: (player.coins || 0) + item.reward
    //             });

    //             // 3. Remove from Inventory
    //             await db.inventory.delete(item.id!);
    //         });
    //     } catch (e) {
    //         console.error('Failed to complete challenge', e);
    //         alert('Something went wrong.');
    //     }
    // }
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <div>
            <h2 class="text-2xl font-bold">Inventory</h2>
            <p class="text-xs text-base-content/60">
                {inventoryItems.length} / 3 Items
            </p>
        </div>
        {#if player}
        <div class="flex gap-2">
           <div class="badge badge-secondary badge-lg gap-2 font-bold shadow-sm">
                <span>🏆</span>
                {player.score || 0}
            </div>
        </div>
        {/if}
    </div>

    {#if inventoryItems.length === 0}
         <div class="card bg-base-100 shadow-sm border border-base-200 py-12 text-center">
            <div class="card-body items-center justify-center text-base-content/70">
                <span class="text-6xl mb-4">🎒</span>
                <h3 class="font-bold text-lg">Empty Inventory</h3>
                <p>Buy challenges from the store to fill your slots.</p>
            </div>
         </div>
    {:else}
        <div class="grid gap-4">
            {#each inventoryItems as item}
                <div class="card card-side bg-base-100 shadow-sm border border-base-200 p-2">
                    <figure class="w-20 bg-base-200 rounded-xl flex items-center justify-center text-3xl shrink-0">
                        {item.icon || '📜'}
                    </figure>
                    <div class="card-body p-3 w-full">
                        <div class="flex justify-between items-start w-full gap-2">
                            <h3 class="card-title text-base">{item.title}</h3>
                             <div class="badge badge-sm badge-ghost shrink-0">+{item.points} 🏆</div>
                        </div>
                        <p class="text-xs text-base-content/80">{item.description}</p>
                        <!-- No interactions for now -->
                    </div>
                </div>
            {/each}
        </div>
    {/if}
    
    {#if inventoryItems.length < 3}
         <div class="alert alert-info py-2 text-sm shadow-sm bg-base-200/50 border-base-300 text-base-content">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>You have {3 - inventoryItems.length} slots available.</span>
        </div>
    {/if}
</div>
