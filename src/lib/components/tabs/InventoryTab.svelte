<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';
    import { _ } from 'svelte-i18n';

    let players = $state<Player[]>([]);
    let inventoryItems = $state<Inventory[]>([]);

    let isDeleteModalOpen = $state(false);
    let itemToDelete = $state<Inventory | null>(null);

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

    function initiateDelete(item: Inventory) {
        itemToDelete = item;
        isDeleteModalOpen = true;
    }

    async function confirmDelete() {
        if (!itemToDelete || !itemToDelete.id) return;
        
        try {
            await db.inventory.delete(itemToDelete.id);
            isDeleteModalOpen = false;
            itemToDelete = null;
        } catch (e) {
            console.error('Failed to remove item', e);
        }
    }
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <div>
            <h2 class="text-2xl font-bold">{$_('inventory.title')}</h2>
            <p class="text-xs text-base-content/60">
                {$_('inventory.count', { values: { count: inventoryItems.length } })}
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
                <h3 class="font-bold text-lg">{$_('inventory.empty_title')}</h3>
                <p>{$_('inventory.empty_desc')}</p>
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
                        <div class="card-actions justify-end mt-2">
                            <button class="btn btn-xs btn-outline btn-error" onclick={() => initiateDelete(item)}>
                                {$_('inventory.remove_title')}
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
    
    {#if inventoryItems.length < 3}
         <div class="alert alert-info py-2 text-sm shadow-sm bg-base-200/50 border-base-300 text-base-content">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>{$_('inventory.slots_available', { values: { count: 3 - inventoryItems.length } })}</span>
        </div>
    {/if}

    <!-- Delete Confirmation Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isDeleteModalOpen}>
        <div class="modal-box">
             <h3 class="font-bold text-lg text-error">{$_('inventory.remove_confirm_title')}</h3>
             <p class="py-4">{$_('inventory.remove_confirm_desc')}</p>
            <div class="modal-action">
                <button class="btn" onclick={() => isDeleteModalOpen = false}>{$_('inventory.cancel')}</button>
                <button class="btn btn-error" onclick={confirmDelete}>{$_('inventory.confirm_remove')}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isDeleteModalOpen = false}>{$_('profile.close')}</button>
        </form>
    </dialog>
</div>
