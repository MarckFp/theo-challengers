<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';
    import { invoke } from '@tauri-apps/api/core';
    import { listen } from '@tauri-apps/api/event';

    let players = $state<Player[]>([]);
    let inventory = $state<Inventory[]>([]);
    let activeChallenges = $state<Challengue[]>([]);
    let currentUser = $derived(players[0]);
    
    // Modal State
    let isModalOpen = $state(false);
    let selectedPeerId = $state<string | null>(null);
    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');

    // Discovery State
    type Peer = { id: string; ip: string; port: number; nickname: string; last_seen: number };
    let discoveredPeers = $state<Peer[]>([]);
    let isDiscovering = $state(false);

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

    // Fetch Active Challenges (where completed_at is undefined)
    $effect(() => {
        if (!currentUser?.id) return;
        const subscription = liveQuery(() => 
            db.challengue
                .where('player_id').equals(currentUser.id!)
                .filter(c => c.completed_at === undefined || c.completed_at === null)
                .toArray()
        ).subscribe(result => {
            activeChallenges = result;
        });
        return () => subscription.unsubscribe();
    });

    // Start Discovery when User is Loaded
    $effect(() => {
        if (currentUser?.nickname && !isDiscovering) {
            setupDiscovery(currentUser.nickname);
        }
    });

    async function setupDiscovery(nickname: string) {
        try {
            isDiscovering = true;
            await invoke('start_discovery', { nickname });
            
            await listen<Peer>('peer-found', (event) => {
                const peer = event.payload;
                if (!discoveredPeers.some(p => p.id === peer.id)) {
                    discoveredPeers = [...discoveredPeers, peer];
                }
            });

            await listen<string>('peer-lost', (event) => {
                discoveredPeers = discoveredPeers.filter(p => p.id !== event.payload);
            });

            await listen<{from_player: string, item_title: string, item_points: number, message: string}>('challenge-received', async (event) => {
                const payload = event.payload;
                if (currentUser?.id) {
                     await db.challengue.add({
                        player_id: currentUser.id,
                        title: payload.item_title,
                        description: payload.message || `Challenge from ${payload.from_player}`,
                        points: payload.item_points,
                        reward: payload.item_points, 
                        from_player: payload.from_player,
                        message: payload.message
                    });
                    
                    if ('Notification' in window && Notification.permission === 'granted') {
                         new Notification(`Challenge from ${payload.from_player}`, {
                            body: payload.item_title
                        });
                    }
                }
            });
        } catch (e) {
            console.warn("Discovery failed (likely running in browser, not app)", e);
            discoveredPeers = [{ id: 'mock', ip: '127.0.0.1', port: 0, nickname: 'Mock Peer (Browser)', last_seen: 0 }];
        }
    }

    function openModal() {
        isModalOpen = true;
        (document.getElementById('challenge_modal') as HTMLDialogElement)?.showModal();
    }

    function closeModal() {
        isModalOpen = false;
        (document.getElementById('challenge_modal') as HTMLDialogElement)?.close();
    }

    async function handleSendChallenge() {
        if (!selectedItemId || !selectedPeerId) return;
        
        const peer = discoveredPeers.find(p => p.id === selectedPeerId);
        const item = inventory.find(i => i.id === selectedItemId);

        if (!peer || !item) return;

        try {
            if (peer.id === 'mock') {
                alert("Simulated sending challenge to Mock Peer!");
                 await db.inventory.delete(item.id!);
                 closeModal();
                 return;
            }

            const url = `http://${peer.ip}:${peer.port}/challenge`;
            const payload = {
                from_player: currentUser.nickname,
                item_title: item.title,
                item_points: item.points,
                message: customMessage
            };

            await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });

            alert(`Challenge sent to ${peer.nickname}!`);
            await db.inventory.delete(item.id!);
            closeModal();
            selectedItemId = null;
            customMessage = '';
        } catch (e) {
            console.error("Failed to send challenge", e);
            alert("Failed to reach player. Are they still online?");
        }
    }
    
    async function completeActiveChallenge(challenge: Challengue) {
        if (!currentUser?.id || !challenge.id) return;
        
         if (!confirm(`Did you complete "${challenge.title}"?`)) return;

         await db.transaction('rw', db.player, db.challengue, async () => {
             await db.challengue.update(challenge.id!, {
                 completed_at: new Date()
             });
             await db.player.update(currentUser.id!, {
                 score: (currentUser.score || 0) + challenge.points,
                 coins: (currentUser.coins || 0) + challenge.reward
             });
         });
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
                    <button class="btn btn-primary btn-sm" onclick={openModal}>Send Challenge</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
             <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                     <div class="stat-figure text-secondary">
                        <span class="text-2xl">🏆</span>
                    </div>
                    <div class="stat-title text-xs">Score</div>
                    <div class="stat-value text-secondary text-2xl">{currentUser?.score || 0}</div>
                    <div class="stat-desc">Points</div>
                </div>
            </div>

            <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                     <div class="stat-figure text-primary">
                        <span class="text-2xl">🪙</span>
                    </div>
                    <div class="stat-title text-xs">Coins</div>
                    <div class="stat-value text-primary text-2xl">{currentUser?.coins || 0}</div>
                    <div class="stat-desc">Available</div>
                </div>
            </div>
        </div>
    </div>

     <!-- Active Challenges Placeholder -->
    <div class="divider text-base-content/50 font-medium">Active Challenges</div>
    
    {#if activeChallenges.length === 0}
        <div class="text-center py-8 text-base-content/50 text-sm">
            No active challenges. Wait for a friend to send you one!
        </div>
    {:else}
        <div class="grid grid-cols-1 gap-4">
            {#each activeChallenges as challenge}
            <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all cursor-pointer group">
                <div class="card-body p-4 flex-row items-center gap-4">
                    <div class="flex-1">
                        <div class="flex justify-between">
                            <h3 class="font-bold group-hover:text-primary transition-colors">{challenge.title}</h3>
                            <span class="text-xs text-primary font-bold">From: {challenge.from_player || 'Trainer'}</span>
                        </div>
                        <p class="text-xs text-base-content/60">{challenge.message || challenge.description}</p>
                    </div>
                    <button class="btn btn-sm btn-ghost btn-circle" onclick={() => completeActiveChallenge(challenge)}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    </button>
                </div>
            </div>
            {/each}
        </div>
    {/if}

    <!-- Send Challenge Modal -->
    <dialog id="challenge_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <h3 class="font-bold text-lg">Send a Challenge!</h3>
            <p class="py-4 text-sm text-base-content/70">Searching for nearby players...</p>
            
            <div class="form-control w-full gap-4">
                <!-- Select Player -->
                 <div>
                    <label class="label">
                        <span class="label-text">To Nearby Player</span>
                        {#if isDiscovering}
                            <span class="loading loading-dots loading-xs"></span>
                        {/if}
                    </label>
                    <select class="select select-bordered w-full" bind:value={selectedPeerId}>
                        <option disabled selected value={null}>
                            {discoveredPeers.length === 0 ? 'Scanning...' : 'Pick a player'}
                        </option>
                        {#each discoveredPeers as p}
                            <option value={p.id}>{p.nickname} ({p.ip})</option>
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
                        <span class="label-text">Message (Optional)</span>
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
                        disabled={!selectedItemId || !selectedPeerId}
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
