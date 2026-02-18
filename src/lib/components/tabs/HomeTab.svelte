<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';

    let players = $state<Player[]>([]);
    let inventory = $state<Inventory[]>([]);
    let currentUser = $derived(players[0]);
    
    // Modal State
    let isModalOpen = $state(false);
    let selectedPlayerId = $state<number | null>(null);
    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');

    // Fetch Players
    $effect(() => {
        const subscription = liveQuery(() => db.player.toArray()).subscribe(result => {
            players = result;
        });
        return () => subscription.unsubscribe();
    });

    // Fetch Inventory for Current User
    $effect(() => {
        if (!currentUser?.id) return;
        const subscription = liveQuery(() => 
            db.inventory.where('player_id').equals(currentUser.id!).toArray()
        ).subscribe(result => {
            inventory = result;
        });
        return () => subscription.unsubscribe();
    });

    // Generate fake players if needed (for demo purposes if only 1 exists)
    let targetPlayers = $derived(players.length > 1 
        ? players.filter(p => p.id !== currentUser?.id)
        : [{id: 999, nickname: 'Rival/Bot (Demo)'}] 
    );

    function openModal() {
        isModalOpen = true;
        (document.getElementById('challenge_modal') as HTMLDialogElement)?.showModal();
    }

    function closeModal() {
        isModalOpen = false;
        (document.getElementById('challenge_modal') as HTMLDialogElement)?.close();
    }

    async function handleSendChallenge() {
        if (!selectedItemId) return;
        
        // Logic will be implemented later
        alert(`Sending challenge... to Player ${selectedPlayerId} with item ${selectedItemId}`);
        closeModal();
    }
</script>

<div class="space-y-6 relative">
    <div class="navbar bg-base-100/50 backdrop-blur-md rounded-2xl shadow-sm sticky top-0 z-10">
        <div class="flex-1">
            <a class="btn btn-ghost text-xl font-bold tracking-tight">
                Theo <span class="text-primary">Challengers</span>
            </a>
        </div>
        <div class="flex-none">
            <div class="avatar placeholder">
                <div class="bg-primary text-primary-content rounded-full w-10 flex items-center justify-center">
                    <span class="text-lg font-bold">{(currentUser?.nickname || 'P').charAt(0).toUpperCase()}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Stats/Welcome -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card bg-base-100 shadow-xl border border-base-200">
            <div class="card-body">
                <h2 class="card-title">Welcome back, {currentUser?.nickname || 'Player'}!</h2>
                <p>Ready for a new challenge today?</p>
                <div class="card-actions justify-end">
                    <button class="btn btn-primary btn-sm" onclick={openModal}>Start Challenge</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
             <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div class="stat-title text-xs">Completed</div>
                    <div class="stat-value text-secondary text-2xl">42</div>
                    <div class="stat-desc">Total finished</div>
                </div>
            </div>

            <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <div class="stat-title text-xs">Streak</div>
                    <div class="stat-value text-primary text-2xl">5</div>
                    <div class="stat-desc">In a row</div>
                </div>
            </div>
        </div>
    </div>

     <!-- Active Challenges Placeholder -->
    <div class="divider text-base-content/50 font-medium">Active Challenges</div>
    
    <div class="grid grid-cols-1 gap-4">
        {#each [1, 2, 3] as i}
        <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all cursor-pointer group">
            <div class="card-body p-4 flex-row items-center gap-4">
                 <div class="checkbox checkbox-primary"></div>
                 <div class="flex-1">
                     <h3 class="font-bold group-hover:text-primary transition-colors">Complete {5 * i} Pushups</h3>
                     <p class="text-xs text-base-content/60">Fitness • +{10 * i} xp</p>
                 </div>
                 <div class="badge badge-ghost">Daily</div>
            </div>
        </div>
        {/each}
    </div>

    <!-- Start Challenge Modal -->
    <dialog id="challenge_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <h3 class="font-bold text-lg">Send a Challenge!</h3>
            <p class="py-4 text-sm text-base-content/70">Select a player and an item from your inventory to challenge them.</p>
            
            <div class="form-control w-full gap-4">
                <!-- Select Player -->
                 <div>
                    <label class="label">
                        <span class="label-text">To Player</span>
                    </label>
                    <select class="select select-bordered w-full" bind:value={selectedPlayerId}>
                        <option disabled selected value={null}>Pick a player</option>
                        {#each targetPlayers as p}
                            <option value={p.id}>{p.nickname}</option>
                        {/each}
                    </select>
                </div>

                <!-- Select Item -->
                <div>
                    <label class="label">
                        <span class="label-text">Select Item (from Inventory)</span>
                    </label>
                    <select class="select select-bordered w-full" bind:value={selectedItemId}>
                        <option disabled selected value={null}>Pick an item</option>
                        {#each inventory as item}
                            <option value={item.id}>{item.icon || '📜'} {item.title}</option>
                        {/each}
                    </select>
                    {#if inventory.length === 0}
                        <div class="label">
                            <span class="label-text-alt text-warning">Your inventory is empty! Visit the store first.</span>
                        </div>
                    {/if}
                </div>

                <!-- Custom Message -->
                <div>
                    <label class="label">
                        <span class="label-text">Message</span>
                    </label>
                    <textarea 
                        class="textarea textarea-bordered h-24 w-full" 
                        placeholder="I dare you to complete this challenge..."
                        bind:value={customMessage}
                    ></textarea>
                </div>
            </div>

            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost" onclick={closeModal}>Cancel</button>
                    <button 
                        class="btn btn-primary"
                        onclick={handleSendChallenge}
                        disabled={!selectedItemId || selectedPlayerId === null}
                    >
                        Send Challenge
                    </button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeModal}>close</button>
        </form>
    </dialog>
</div>
