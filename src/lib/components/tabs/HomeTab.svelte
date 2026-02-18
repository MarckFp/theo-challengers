<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';
    import QRCode from 'qrcode';
    import { Html5QrcodeScanner } from 'html5-qrcode';
    import { onMount } from 'svelte';

    let players = $state<Player[]>([]);
    let inventory = $state<Inventory[]>([]);
    let activeChallenges = $state<Challengue[]>([]);
    let currentUser = $derived(players[0]);
    
    // Modal State
    let isSendModalOpen = $state(false);
    let isReceiveModalOpen = $state(false);
    
    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');
    let generatedQRUrl = $state<string | null>(null);

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

    // Fetch Active Challenges
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


    function openSendModal() {
        isSendModalOpen = true;
        (document.getElementById('send_challenge_modal') as HTMLDialogElement)?.showModal();
    }

    function closeSendModal() {
        isSendModalOpen = false;
        generatedQRUrl = null;
        selectedItemId = null;
        customMessage = '';
        (document.getElementById('send_challenge_modal') as HTMLDialogElement)?.close();
    }

    function openReceiveModal() {
        isReceiveModalOpen = true;
        (document.getElementById('receive_challenge_modal') as HTMLDialogElement)?.showModal();
        startScanner();
    }

    function closeReceiveModal() {
        isReceiveModalOpen = false;
        (document.getElementById('receive_challenge_modal') as HTMLDialogElement)?.close();
    }

    async function generateChallengeQR() {
        if (!selectedItemId || !currentUser) return;
        
        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) return;

        const payload = {
            type: 'theo-challenge-v1',
            from: currentUser.nickname,
            item: {
                title: item.title,
                points: item.points,
                id: item.id // To remove later if needed
            },
            message: customMessage || "I challenge you!"
        };

        try {
            generatedQRUrl = await QRCode.toDataURL(JSON.stringify(payload));
            // Opt: Remove item from inventory immediately? Or wait for confirmation?
            // For now, let's just keep it simple - generating the code "spends" the item visually
             await db.inventory.delete(item.id!);
        } catch (err) {
            console.error(err);
        }
    }
    
    let scanner: Html5QrcodeScanner | null = null;

    function startScanner() {
        // Wait for modal to render
        setTimeout(() => {
            if (scanner) { scanner.clear(); }
            scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );
            scanner.render(onScanSuccess, onScanFailure);
        }, 300);
    }

    async function onScanSuccess(decodedText: string, decodedResult: any) {
        try {
            const data = JSON.parse(decodedText);
            if (data.type === 'theo-challenge-v1' && currentUser?.id) {
                // Add challenge
                await db.challengue.add({
                    player_id: currentUser.id,
                    title: data.item.title,
                    description: data.message,
                    points: data.item.points,
                    reward: data.item.points, // Or logic for reward
                    from_player: data.from,
                    message: data.message
                });

                alert(`Challenge received from ${data.from}!`);
                if (scanner) scanner.clear();
                closeReceiveModal();
            } else {
                console.warn("Invalid QR Code content", data);
            }
        } catch (e) {
            console.error("Failed to parse QR", e);
        }
    }

    function onScanFailure(error: any) {
        // console.warn(`Code scan error = ${error}`);
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
                <div class="card-actions justify-end gap-2">
                    <button class="btn btn-secondary btn-sm" onclick={openReceiveModal}>Scan QR</button>
                    <button class="btn btn-primary btn-sm" onclick={openSendModal}>Send Challenge</button>
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

     <!-- Active Challenges List -->
    <div class="divider text-base-content/50 font-medium">Active Challenges</div>
    
    {#if activeChallenges.length === 0}
        <div class="text-center py-8 text-base-content/50 text-sm bg-base-100 rounded-box border border-dashed border-base-300">
            <p>No active challenges yet.</p>
            <p class="text-xs mt-1">Visit the Store or scan a friend's challenge!</p>
        </div>
    {:else}
        <div class="grid grid-cols-1 gap-4">
            {#each activeChallenges as challenge}
            <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all cursor-pointer group">
                <div class="card-body p-4 flex-row items-center gap-4">
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <h3 class="font-bold group-hover:text-primary transition-colors">{challenge.title}</h3>
                            <span class="badge badge-sm badge-ghost">{challenge.points} pts</span>
                        </div>
                        <p class="text-xs text-base-content/80 mt-1 italic">"{challenge.message || challenge.description}"</p>
                        <p class="text-[10px] text-base-content/50 mt-1">From: {challenge.from_player || 'System'}</p>
                    </div>
                    <button 
                        class="btn btn-sm btn-ghost btn-circle text-success hover:bg-success/10" 
                        onclick={() => completeActiveChallenge(challenge)}
                        title="Mark Complete"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    </button>
                </div>
            </div>
            {/each}
        </div>
    {/if}

    <!-- SEND Challenge Modal -->
    <dialog id="send_challenge_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <h3 class="font-bold text-lg text-center">Send a Challenge!</h3>
            
            {#if !generatedQRUrl}
                <p class="py-4 text-sm text-center text-base-content/70">Pick an item from your inventory to generate a QR code.</p>
                <div class="form-control w-full gap-4">
                    <!-- Select Item -->
                    <div>
                        <label class="label">
                            <span class="label-text">Select Item (use item)</span>
                        </label>
                        <select class="select select-bordered w-full" bind:value={selectedItemId}>
                            <option disabled selected value={null}>Pick an item</option>
                            {#each inventory as item}
                                <option value={item.id}>{item.icon || '📜'} {item.title} ({item.points} pts)</option>
                            {/each}
                        </select>
                        {#if inventory.length === 0}
                            <div class="label">
                                <span class="label-text-alt text-warning">Your inventory is empty! Visit the store.</span>
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
                        <button class="btn btn-ghost" onclick={closeSendModal}>Cancel</button>
                        <button 
                            class="btn btn-primary"
                            onclick={generateChallengeQR}
                            disabled={!selectedItemId}
                        >
                            Generate QR Code
                        </button>
                    </form>
                </div>
            {:else}
                <div class="flex flex-col items-center justify-center py-6 gap-4">
                    <div class="bg-white p-4 rounded-xl">
                        <img src={generatedQRUrl} alt="Challenge QR Code" class="w-64 h-64" />
                    </div>
                    <p class="text-sm text-center text-info">
                        Ask your friend to scan this code via the "Scan QR" button!
                    </p>
                    <button class="btn btn-outline btn-block" onclick={() => generatedQRUrl = null}>Create Another</button>
                </div>
                 <div class="modal-action">
                    <form method="dialog">
                        <button class="btn" onclick={closeSendModal}>Close</button>
                    </form>
                </div>
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeSendModal}>close</button>
        </form>
    </dialog>

    <!-- RECEIVE Challenge Modal -->
    <dialog id="receive_challenge_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box relative">
             <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick={closeReceiveModal}>✕</button>
            <h3 class="font-bold text-lg mb-4 text-center">Scan Challenge QR</h3>
            
            <div id="reader" class="w-full"></div>
            
            <p class="text-xs text-center mt-4 opacity-50">Point camera at friend's screen</p>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeReceiveModal}>close</button>
        </form>
    </dialog>
</div>
