<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';

    let players = $state<Player[]>([]);
    let inventoryCount = $state(0);
    
    // Subscribe to player data
    $effect(() => {
        const sub = liveQuery(() => db.player.toArray()).subscribe(p => {
            players = p;
        });
        return () => sub.unsubscribe();
    });

    // Subscribe to inventory count
    $effect(() => {
        if (players.length === 0 || !players[0].id) return;
        const sub = liveQuery(() => 
            db.inventory.where('player_id').equals(players[0].id!).count()
        ).subscribe(c => {
            inventoryCount = c;
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
            const newItems = shuffled.slice(0, 4);

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

    async function buyItem(item: any) {
        if (!player || !player.id) return;

        if (coins < item.cost) {
            alert('Not enough coins!');
            return;
        }

        if (inventoryCount >= 3) {
            alert('Inventory is full (max 3 items)!');
            return;
        }

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
        } catch (e) {
            console.error('Transaction failed', e);
            alert('Purchase failed');
        }
    }
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <div>
            <h2 class="text-2xl font-bold">Store</h2>
            <p class="text-xs text-base-content/60">Updates daily</p>
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
                <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-shadow">
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
                                onclick={() => buyItem(item)}
                            >
                                {#if item.purchased}
                                    <span class="text-xs">Purchased</span>
                                {:else if inventoryCount >= 3}
                                    <span class="text-xs">Full</span>
                                {:else if coins < item.cost}
                                    <span class="text-xs">Need {item.cost} 🪙</span>
                                {:else}
                                    Buy {item.cost} 🪙
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
            <span>Your inventory is full! Use items to buy more.</span>
        </div>
    {/if}
</div>
