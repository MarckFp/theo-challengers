<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Inventory } from '$lib/models/inventory';
    import { _ } from 'svelte-i18n';
    import { useUser } from '$lib/stores/user.svelte';
    import { I18N } from '$lib/i18n-keys';

    import { createChallengeLink } from '$lib/services/challenge';

    const userStore = useUser();
    let player = $derived(userStore.value);
    
    let inventoryItems = $state<Inventory[]>([]);

    let isDeleteModalOpen = $state(false);
    let itemToDelete = $state<Inventory | null>(null);

    // Challenge Modal State
    let isChallengeModalOpen = $state(false);
    let challengeLink = $state('');
    let challengeItem = $state<Inventory | null>(null);

    // View Modal State
    let isViewModalOpen = $state(false);
    let viewingItem = $state<Inventory | null>(null);

    function openViewModal(item: Inventory) {
        viewingItem = item;
        isViewModalOpen = true;
    }

    // Subscribe to inventory items
    $effect(() => {
        if (!player || !player.id) return;
        const sub = liveQuery(() => 
            db.inventory.where('player_id').equals(player!.id!).toArray()
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

    async function handleShareChallenge(item: Inventory) {
        if (!item) return;
        const link = await createChallengeLink(player!, item, "Let's play!");
        if (link) {
            challengeLink = link;
            challengeItem = item;
            isChallengeModalOpen = true;
            isViewModalOpen = false;
        }
    }
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <div>
            <h2 class="text-2xl font-bold">{$_(I18N.inventory.title)}</h2>
            <p class="text-xs text-base-content/60">
                {$_(I18N.inventory.count, { values: { count: inventoryItems.length } })}
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
                <h3 class="font-bold text-lg">{$_(I18N.inventory.empty_title)}</h3>
                <p>{$_(I18N.inventory.empty_desc)}</p>
            </div>
         </div>
    {:else}
        <div class="grid gap-4">
            {#each inventoryItems as item}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="card card-side bg-base-100 shadow-sm border border-base-200 p-2 cursor-pointer transition-all hover:bg-base-200/50"
                     onclick={() => openViewModal(item)}>
                    <figure class="w-20 bg-base-200 rounded-xl flex items-center justify-center text-3xl shrink-0">
                        {item.icon || '📜'}
                    </figure>
                    <div class="card-body p-3 w-full">
                        <div class="flex justify-between items-start w-full gap-2">
                            <h3 class="card-title text-base">{$_(item.title)}</h3>
                             <div class="badge badge-sm badge-ghost shrink-0">+{item.points} 🏆</div>
                        </div>
                        <p class="text-xs text-base-content/80">{$_(item.description)}</p>
                        <div class="card-actions justify-end mt-2">
                            <button class="btn btn-xs btn-outline btn-error" onclick={(e) => { e.stopPropagation(); initiateDelete(item); }}>
                                {$_(I18N.inventory.remove_title)}
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
            <span>{$_(I18N.inventory.slots_available, { values: { count: 3 - inventoryItems.length } })}</span>
        </div>
    {/if}

    <!-- Delete Confirmation Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isDeleteModalOpen}>
        <div class="modal-box">
             <h3 class="font-bold text-lg text-error">{$_(I18N.inventory.remove_confirm_title)}</h3>
             <p class="py-4">{$_(I18N.inventory.remove_confirm_desc)}</p>
            <div class="modal-action">
                <button class="btn" onclick={() => isDeleteModalOpen = false}>{$_(I18N.common.cancel)}</button>
                <button class="btn btn-error" onclick={confirmDelete}>{$_(I18N.inventory.confirm_remove)}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isDeleteModalOpen = false}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>
    <!-- View Item Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isViewModalOpen}>
        <div class="modal-box">
             {#if viewingItem}
                <div class="flex flex-col items-center gap-4 py-4">
                    <div class="text-8xl drop-shadow-md pb-4">{viewingItem.icon || '📜'}</div>
                    <h3 class="font-bold text-2xl text-center">{$_(viewingItem.title)}</h3>
                    <div class="badge badge-lg badge-ghost">+{viewingItem.points} 🏆</div>
                    <p class="text-center text-lg text-base-content/80">{$_(viewingItem.description)}</p>
                    
                    <div class="divider my-0"></div>

                    <div class="flex w-full gap-2">
                        <button 
                            class="btn btn-primary flex-1 shadow-lg shadow-primary/20"
                            onclick={() => handleShareChallenge(viewingItem!)}
                        >
                             🚀 {$_(I18N.inventory.challenge_btn || 'Challenge!')}
                        </button>
                    </div>

                    <div class="flex w-full gap-2">
                         <button class="btn btn-outline btn-error flex-1" onclick={() => { isViewModalOpen = false; initiateDelete(viewingItem!); }}>
                                {$_(I18N.inventory.remove_title)}
                        </button>
                        <button class="btn btn-ghost flex-1" onclick={() => isViewModalOpen = false}>
                            {$_(I18N.common.cancel)}
                        </button>
                    </div>
                </div>
             {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isViewModalOpen = false}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>
    
    <!-- Challenge Link Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" class:modal-open={isChallengeModalOpen}>
        <div class="modal-box text-center">
             <h3 class="font-bold text-lg text-secondary">Ready to Challenge!</h3>
             <p class="py-4">Share this link with your friend:</p>
             <div class="bg-base-200 p-2 rounded-lg break-all text-xs mb-4 select-all font-mono">
                {challengeLink}
             </div>
             <p class="text-xs text-base-content/50 mb-4">(In real app, just share this!)</p>
             <div class="modal-action justify-center">
                 <button class="btn btn-primary w-full" onclick={() => {
                     navigator.clipboard.writeText(challengeLink);
                     alert("Copied!");
                     isChallengeModalOpen = false;
                 }}>
                    📋 Copy Link
                 </button>
             </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isChallengeModalOpen = false}>close</button>
        </form>
    </dialog>
</div>
