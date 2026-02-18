<script lang="ts">
    import { db } from '$lib/db';
    import BadgesComponent from './BadgesTab.svelte'; 
    import { liveQuery } from 'dexie';
    import { _ } from 'svelte-i18n';
    import { useUser } from '$lib/stores/user.svelte';
    import { I18N } from '$lib/i18n-keys';
    import { fade } from 'svelte/transition';
    import { CHALLENGES_CATALOG } from '$lib/data/challenges';

    const userStore = useUser();
    let player = $derived(userStore.value);
    
    // Sub-Tabs
    type StoreSection = 'items' | 'badges';
    let activeSection = $state<StoreSection>('items');

    // --- ITEM STORE LOGIC ---
    let inventoryItemsCount = $state(0);
    let isRefreshConfirmOpen = $state(false);
    let viewingItem = $state<any>(null);
    let isViewModalOpen = $state(false); 

    let coins = $derived(player?.coins ?? 0);
    let score = $derived(player?.score ?? 0);
    
    // Inventory Check
    $effect(() => {
        if (!player?.id) return;
        liveQuery(() => db.inventory.where('player_id').equals(player.id!).count())
            .subscribe(count => inventoryItemsCount = count);
    });

    // Daily Shop Refresh Logic
    $effect(() => {
        if (!player) return;
        const today = new Date().toISOString().split('T')[0];
        if (player.lastShopUpdate !== today) {
            refreshShop(player.id!, today);
        }
    });

    async function refreshShop(playerId: number, dateStr: string) {
        try {
            const all = CHALLENGES_CATALOG;
            const shuffled = [...all].sort(() => 0.5 - Math.random()).slice(0, 4);
            
            // Check owned
            const inventory = await db.inventory.where('player_id').equals(playerId).toArray();
            const newItems = shuffled.map((item: any) => {
                 const isOwned = inventory.some(i => i.title === item.title);
                 return { ...item, purchased: isOwned }; 
            });

            await db.player.update(playerId, {
                lastShopUpdate: dateStr,
                shopItems: newItems
            });
        } catch (e) { console.error(e); }
    }

    async function handleBuyItem(item: any) {
         if (!player?.id) return;
         if (coins < item.cost) { alert($_(I18N.store.not_enough_coins)); return; }
         if (inventoryItemsCount >= 3) { alert($_(I18N.store.inventory_full)); return; }

         if (confirm($_(I18N.store.buy_confirm, { values: { item: $_(item.title), cost: item.cost } }))) {
              try {
                await db.inventory.add({
                    player_id: player.id!,
                    title: item.title,
                    description: item.description,
                    points: item.points,
                    cost: item.cost,
                    icon: item.icon || '📦'
                });
                
                // Update player coins and mark item as purchased
                const newShopItems = (player.shopItems || []).map((i: any) => 
                   i.title === item.title ? { ...i, purchased: true } : i
                );
    
                await db.player.update(player.id, {
                    coins: coins - item.cost,
                    shopItems: newShopItems
                });
                alert($_(I18N.store.purchased));
                isViewModalOpen = false;
             } catch (e) { console.error(e); }
         }
    }

    async function manualRefresh() {
        if (!player?.id) return;
        if (coins < 3) { 
            alert($_(I18N.store.refresh_not_enough)); 
            return; 
        }
        
        await db.player.update(player.id, { coins: coins - 3 });
        
        // Force refresh
        try {
            const all = CHALLENGES_CATALOG;
            const shuffled = [...all].sort(() => 0.5 - Math.random()).slice(0, 4);
            const newItems = shuffled.map((i: any) => ({ ...i, purchased: false }));
            
            await db.player.update(player.id, { 
                shopItems: newItems,
                lastShopUpdate: new Date().toISOString().split('T')[0] // Ensure date is current
            });
             isRefreshConfirmOpen = false;
        } catch(e) { console.error(e); }
    }

</script>

<div class="space-y-4">
    <!-- Store Header with Tabs -->
    <div class="navbar bg-base-100/50 backdrop-blur-md rounded-2xl shadow-sm sticky top-2 z-10 transition-all p-0 min-h-12">
        <div class="flex-1">
             <div class="tabs tabs-boxed bg-transparent p-1">
                <button 
                    class="tab tab-md {activeSection === 'items' ? 'tab-active font-bold' : ''}" 
                    onclick={() => activeSection = 'items'}
                >
                    {$_(I18N.store.title)}
                </button>
                <button 
                    class="tab tab-md {activeSection === 'badges' ? 'tab-active font-bold' : ''}" 
                    onclick={() => activeSection = 'badges'}
                >
                    {$_(I18N.badges.title)}
                </button>
            </div>
        </div>
        <div class="flex-none px-2">
             {#if activeSection === 'items'}
                <div class="badge badge-lg badge-primary gap-1 font-bold animate-pulse shadow-sm">
                    {coins} 🪙
                </div>
             {:else}
                <div class="badge badge-lg badge-secondary gap-1 font-bold animate-pulse shadow-sm">
                    {score} 🏆
                </div>
             {/if}
        </div>
    </div>

    {#if activeSection === 'items'}
        <!-- ITEMS STORE VIEW -->
        <div class="space-y-4">
             <!-- Intro Card -->
            <div class="card bg-base-100 shadow-sm border border-base-200">
                <div class="card-body p-4 text-center text-sm text-base-content/60">
                    {$_(I18N.store.description)}
                </div>
            </div>

            <!-- Refresh Button (Full Width) -->
            <button class="btn btn-secondary btn-block gap-2 shadow-sm" onclick={() => isRefreshConfirmOpen = true}>
                🔄 {$_(I18N.store.refresh_button)}
            </button>

            <!-- Items Grid -->
            <div class="card bg-base-100 shadow-sm border border-base-200">
                <div class="card-body p-4">
                    
                    <div class="grid grid-cols-2 gap-3">
                        {#if player?.shopItems?.length}
                            {#each player.shopItems as item}
                                <div class="indicator w-full"> 
                                    {#if item.purchased}
                                        <span class="indicator-item badge badge-secondary badge-md top-2 right-2 rotate-12 font-bold shadow-sm">Out</span>
                                    {/if}
                                    <button 
                                        class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer w-full border border-base-300 relative aspect-square"
                                        class:opacity-50={item.purchased}
                                        disabled={item.purchased}
                                        onclick={() => {
                                            viewingItem = item;
                                            isViewModalOpen = true;
                                        }}
                                    >
                                        <div class="card-body p-2 flex flex-col items-center justify-center text-center gap-2">
                                            <div class="text-6xl transition-transform hover:scale-110 duration-200 drop-shadow-sm">
                                                {item.icon || '📦'}
                                            </div>
                                            <div class="w-full">
                                                <h4 class="font-bold text-sm line-clamp-1 w-full truncate leading-tight">{$_(item.title)}</h4>
                                                <div class="badge badge-lg badge-neutral mt-2 font-mono font-bold shadow-sm">{item.cost} 🪙</div>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            {/each}
                        {:else}
                            <div class="col-span-2 text-center py-8 opacity-50">
                                {$_(I18N.common.loading)}...
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
        
        <!-- MODALS for Item Store -->
    
        <!-- Item Details & Buy Modal -->
        <dialog class="modal modal-bottom sm:modal-middle" class:modal-open={isViewModalOpen}>
            <div class="modal-box">
                 {#if viewingItem}
                    <div class="flex justify-center mb-4 mt-8 text-6xl animate-bounce">
                        {viewingItem.icon || '📦'}
                    </div>
                    <h3 class="font-bold text-lg text-center">{$_(viewingItem.title)}</h3>
                    <p class="py-4 text-center text-sm opacity-80">{$_(viewingItem.description)}</p>
                    
                    <div class="flex justify-center gap-4 text-xs font-bold uppercase tracking-widest opacity-60 mb-6">
                        <div class="badge badge-lg badge-outline gap-1">
                            {$_(I18N.store.reward)}: {viewingItem.points} 🏆
                        </div>
                        <div class="badge badge-lg badge-outline gap-1">
                            {$_(I18N.store.cost)}: {viewingItem.cost} 🪙
                        </div>
                    </div>
    
                    <div class="grid grid-cols-2 gap-4">
                        <button class="btn btn-outline" onclick={() => isViewModalOpen = false}>{$_(I18N.common.cancel)}</button>
                        <button 
                            class="btn btn-primary" 
                            disabled={viewingItem.purchased || coins < viewingItem.cost}
                            onclick={() => handleBuyItem(viewingItem)}
                        >
                             {#if viewingItem.purchased}
                                {$_(I18N.store.sold_out)}
                             {:else if coins < viewingItem.cost}
                                {$_(I18N.store.need, { values: { cost: viewingItem.cost - coins } })}
                             {:else}
                                {$_(I18N.store.buy)}
                             {/if}
                        </button>
                    </div>
                {/if}
            </div>
            <form method="dialog" class="modal-backdrop">
                <button onclick={() => isViewModalOpen = false}>close</button>
            </form>
        </dialog>
    
         <!-- Refresh Confirm Modal -->
        <dialog class="modal modal-bottom sm:modal-middle" class:modal-open={isRefreshConfirmOpen}>
            <div class="modal-box">
                 <h3 class="font-bold text-lg">{$_(I18N.store.confirm_title)}</h3>
                 <p class="py-4">{$_(I18N.store.refresh_store_confirm)}</p>
                 <div class="modal-action">
                    <button class="btn" onclick={() => isRefreshConfirmOpen = false}>{$_(I18N.common.cancel)}</button>
                    <button class="btn btn-primary" onclick={manualRefresh}>
                        {$_(I18N.store.refresh_button)}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button onclick={() => isRefreshConfirmOpen = false}>close</button>
            </form>
        </dialog>
    
    {:else}
        <!-- BADGES STORE VIEW -->
        <!-- Just render the component -->
        <div in:fade={{ duration: 200 }}>
             <BadgesComponent />
        </div>
    {/if}

</div>
