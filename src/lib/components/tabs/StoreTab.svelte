<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import { _ } from 'svelte-i18n';

    let players = $state<Player[]>([]);
    let inventoryCount = $state(0);
    let purchasingItem = $state<string | null>(null);
    let inventoryItems = $state<Inventory[]>([]);
    
    let isConfirmModalOpen = $state(false);
    let isRefreshConfirmOpen = $state(false);
    let itemToBuy = $state<any>(null);

    // Subscribe to player data
    $effect(() => {
        const sub = liveQuery(() => db.player.toArray()).subscribe(p => {
            players = p;
        });
        return () => sub.unsubscribe();
    });

    // Subscribe to inventory items
    $effect(() => {
        if (players.length === 0 || !players[0].id) return;
        const sub = liveQuery(() => 
            db.inventory.where('player_id').equals(players[0].id!).toArray()
        ).subscribe(items => {
            inventoryItems = items;
            inventoryCount = items.length;
        });
        return () => sub.unsubscribe();
    });

    let player = $derived(players[0]);
    let coins = $derived(player?.coins ?? 0);
    let shopItems = $derived(player?.shopItems ?? []);

    // Daily Shop Logic
    $effect(() => {
        if (!player) return;

        const today = new Date().toISOString().split('T')[0];
        
        if (player.lastShopUpdate !== today) {
            refreshShop(player, today);
        }
    });

    async function refreshShop(p: Player, dateStr: string) {
        try {
            const res = await fetch('/challengues.json');
            const data = await res.json();
            const allChallenges = data.challengues;

            // Simple shuffle
            const shuffled = [...allChallenges].sort(() => 0.5 - Math.random());
            const newItemsRaw = shuffled.slice(0, 4);

            // Check if items are already in inventory (for daily refresh)
            // Note: During daily refresh, we might not have inventoryItems populated yet if this runs on mount immediately
            // But we can check db directly if needed, or rely on the UI to disable them later.
            // However, store items are persisted in player object. 
            // Better to let them be 'fresh' but when rendered, we check if they are purchased.
            // Actually, the UI logic {item.purchased} relies on the property in the item object.
            // So we should probably check inventory here.
            
            // To keep it simple for daily refresh, we just store raw items.
            // The UI should ideally check against inventory for 'disabled' state properly, 
            // but currently it checks `item.purchased` which is a property WE set.
            
            // Let's stick to the current pattern: we set purchased: true if they buy it.
            // For refresh, if they already own it, we should probably set purchased: true immediately so they can't buy it again.
            
            // Re-fetching inventory to be sure
            const currentInventory = await db.inventory.where('player_id').equals(p.id!).toArray();
            
            const newItems = newItemsRaw.map((item: any) => {
                 const alreadyOwned = currentInventory.some((i: any) => i.title === item.title && i.description === item.description);
                 return alreadyOwned ? { ...item, purchased: true } : item;
            });

            if (p.id) {
                await db.player.update(p.id, {
                    lastShopUpdate: dateStr,
                    shopItems: newItems
                });
            }
        } catch (e) {
            console.error('Failed to refresh shop', e);
        }
    }

    function initiateRefresh() {
        if (coins < 3) {
            // alert($_('store.refresh_not_enough')); // Using UI alert might be better but simple alert works
            return; 
        }
        isRefreshConfirmOpen = true;
    }

    async function confirmRefresh() {
        if (!player || !player.id) return;
        if (coins < 3) {
             isRefreshConfirmOpen = false;
             return;
        }

        isRefreshConfirmOpen = false;
        
        try {
            const res = await fetch('/challengues.json');
            const data = await res.json();
            const allChallenges = data.challengues;

            // Simple shuffle
            const shuffled = [...allChallenges].sort(() => 0.5 - Math.random());
            const newItemsRaw = shuffled.slice(0, 4);
            
            // Mark items as purchased if in inventory
            const newItems = newItemsRaw.map((item: any) => {
                 const alreadyOwned = inventoryItems.some(i => i.title === item.title && i.description === item.description);
                 return alreadyOwned ? { ...item, purchased: true } : item;
            });

            await db.player.update(player.id, {
                coins: player.coins - 3,
                shopItems: newItems
            });

        } catch (e) {
            console.error('Failed to manual refresh shop', e);
        }
    }

    function initiateBuy(item: any) {
        if (!player || !player.id) return;
        if (coins < item.cost) {
            alert($_('store.not_enough_coins'));
            return;
        }
        if (inventoryCount >= 3) {
            alert($_('store.inventory_full'));
            return;
        }
        itemToBuy = item;
        isConfirmModalOpen = true;
    }

    async function confirmBuy() {
        if (!itemToBuy || !player || !player.id) return;
        
        const item = itemToBuy;
        isConfirmModalOpen = false;
        
        // Trigger Animation
        purchasingItem = item.title;

        try {
            await db.transaction('rw', db.player, db.inventory, async () => {
                // Clone the arrays/objects to ensure they are plain JS objects (not Svelte 5 Proxies)
                const currentShopItems = JSON.parse(JSON.stringify(player.shopItems || []));
                
                // Determine new shopItems state with purchased flag
                const updatedShopItems = currentShopItems.map((i: any) => 
                    (i.title === item.title && i.description === item.description) 
                        ? { ...i, purchased: true } 
                        : i
                );

                // Deduct coins & update shopItems
                await db.player.update(player.id!, {
                    coins: player.coins - item.cost,
                    shopItems: updatedShopItems
                });

                // Add to inventory
                const inventoryItem: Inventory = {
                    player_id: player.id!,
                    title: item.title,
                    description: item.description,
                    points: item.points,
                    cost: item.cost,
                    reward: item.reward,
                    icon: item.icon
                };
                
                await db.inventory.add(inventoryItem);
            });
            
            setTimeout(() => {
                purchasingItem = null;
                itemToBuy = null;
            }, 1000);

        } catch (e) {
            console.error('Transaction failed', e);
            purchasingItem = null;
            alert('Purchase failed');
        }
    }
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <div>
            <h2 class="text-2xl font-bold">{$_('store.title')}</h2>
            <p class="text-xs text-base-content/60">{$_('store.description')}</p>
        </div>
        <div class="badge badge-primary badge-lg gap-2 font-bold shadow-sm">
            <span class="text-yellow-200">🪙</span>
            {coins}
        </div>
    </div>

    {#if !shopItems || shopItems.length === 0}
        <div class="flex flex-col items-center justify-center p-12 text-base-content/50 gap-4">
            <span class="loading loading-spinner loading-md"></span>
            <p>Loading shop...</p>
        </div>
    {:else}
        <div class="grid grid-cols-2 gap-4">
            {#each shopItems as item}
                <div class={`card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all 
                            ${purchasingItem === item.title ? 'shake border-success bg-success/10' : ''}`}>
                    <figure class="px-4 pt-4">
                        <div class={`aspect-square w-full rounded-xl bg-base-200/50 flex flex-col items-center justify-center gap-2 relative group ${item.purchased ? 'opacity-50 grayscale' : ''}`}>
                            <span class="text-4xl drop-shadow-sm transform group-hover:scale-110 transition-transform duration-300">{item.icon || '🎁'}</span>
                            <div class="badge badge-sm absolute top-2 right-2 badge-ghost opacity-80">{item.points} 🏆</div>
                        </div>
                    </figure>
                    <div class="card-body p-3 items-center text-center">
                        <h3 class="font-bold text-sm leading-tight min-h-[2.5em] flex items-center justify-center line-clamp-2">{item.title}</h3>
                        <p class="text-xs text-base-content/80 leading-tight min-h-[3rem]">{item.description}</p>
                        <div class="card-actions mt-3 w-full">
                            <button 
                                class="btn btn-primary btn-sm w-full font-bold gap-1"
                                disabled={coins < item.cost || inventoryCount >= 3 || item.purchased}
                                onclick={() => initiateBuy(item)}
                            >
                                {#if item.purchased}
                                    <span class="text-xs">{$_('store.purchased')}</span>
                                {:else if inventoryCount >= 3}
                                    <span class="text-xs">{$_('store.full')}</span>
                                {:else if coins < item.cost}
                                    <span class="text-xs">{$_('store.need', { values: { cost: item.cost } })}</span>
                                {:else}
                                    {$_('store.buy')} {item.cost} 🪙
                                {/if}
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
    
    {#if inventoryCount >= 3}
        <div role="alert" class="alert alert-warning py-2 text-sm shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>{$_('store.inventory_full')}</span>
        </div>
    {/if}

    <div class="divider my-0"></div>

    <div class="flex justify-center pb-4">
        <button 
            class="btn btn-secondary btn-outline w-full gap-2"
            disabled={coins < 3}
            onclick={initiateRefresh}
        >
            <span class="text-xl">🔄</span>
            {$_('store.refresh_button')}
        </button>
    </div>

    <!-- Purchase Confirmation Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isConfirmModalOpen}>
        <div class="modal-box">
             <h3 class="font-bold text-lg">{$_('store.confirm_title')}</h3>
             {#if itemToBuy}
                <p class="py-4">
                    {$_('store.buy_confirm', { values: { item: itemToBuy.title, cost: itemToBuy.cost } })}
                </p>
            {/if}
            <div class="modal-action">
                <button class="btn" onclick={() => isConfirmModalOpen = false}>Close</button>
                <button class="btn btn-primary" onclick={confirmBuy}>{$_('store.buy')}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isConfirmModalOpen = false}>close</button>
        </form>
    </dialog>

    <!-- Refresh Confirmation Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isRefreshConfirmOpen}>
        <div class="modal-box">
             <h3 class="font-bold text-lg">{$_('store.refresh_button')}</h3>
             <p class="py-4">
                {$_('store.refresh_store_confirm')}
             </p>
            <div class="modal-action">
                <button class="btn" onclick={() => isRefreshConfirmOpen = false}>{$_('store.cancel')}</button>
                <button class="btn btn-secondary" onclick={confirmRefresh}>{$_('store.buy')} 3 🪙</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isRefreshConfirmOpen = false}>close</button>
        </form>
    </dialog>
</div>
