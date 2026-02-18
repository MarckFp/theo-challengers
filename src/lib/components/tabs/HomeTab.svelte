<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';
    import { onMount } from 'svelte';
    
    // Helper to update leaderboard
    async function updatePeerScore(nickname: string, score: number) {
        if (!nickname || score === undefined) return;
        try {
            const existing = await db.leaderboard.where('nickname').equals(nickname).first();
            if (existing) {
                // Only update if score is higher or different? Or always take latest?
                // For now, always take latest as trusted
                await db.leaderboard.update(existing.id!, { score, updated_at: new Date() });
            } else {
                await db.leaderboard.add({ nickname, score, updated_at: new Date() });
            }
        } catch (e) { console.error('Leaderboard update failed', e); }
    }

    let players = $state<Player[]>([]);
    let inventory = $state<Inventory[]>([]);
    let activeChallenges = $state<Challengue[]>([]);
    let currentUser = $derived(players[0]);
    
    // Modal State
    let isSendModalOpen = $state(false);
    
    // Authorization Modal
    let isAuthModalOpen = $state(false);
    let authChallengeId = $state('');
    let authKeyInput = $state('');

    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');
    let generatedShareLink = $state<string | null>(null);
    
    // Pending claim request info (for Receiver)
    let pendingClaimRequest = $state<{id: string, from: string, item: any, message?: string} | null>(null);
    let generatedClaimCode = $state<string | null>(null);

    // Pending sent info (for Sender)
    let pendingVerificationId = $state<string | null>(null);
    let generatedAuthKey = $state<string | null>(null);

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


    // Check for incoming challenge via URL (Share Link)
    $effect(() => {
        const params = new URLSearchParams(window.location.search);
        const challengeData = params.get('challenge');
        if (challengeData && currentUser?.id) {
             try {
                 const json = atob(challengeData);
                 const data = JSON.parse(json);
                 handleIncomingShare(data);
                 // Clean URL
                 window.history.replaceState({}, document.title, window.location.pathname);
             } catch (e) {
                 console.error("Invalid challenge link", e);
             }
        }
    });

    function openSendModal() {
        isSendModalOpen = true;
        (document.getElementById('send_challenge_modal') as HTMLDialogElement)?.showModal();
    }

    function openVerifyModal() {
        (document.getElementById('verify_claim_modal') as HTMLDialogElement)?.showModal();
    }

    function closeVerifyModal() {
        pendingVerificationId = null;
        generatedAuthKey = null;
        (document.getElementById('verify_claim_modal') as HTMLDialogElement)?.close();
    }

    function closeSendModal() {
        isSendModalOpen = false;
        generatedShareLink = null;
        selectedItemId = null;
        customMessage = '';
        (document.getElementById('send_challenge_modal') as HTMLDialogElement)?.close();
    }
    
    function closeClaimModal() {
        pendingClaimRequest = null;
        generatedClaimCode = null;
        authKeyInput = '';
        (document.getElementById('claim_request_modal') as HTMLDialogElement)?.close();
    }

    async function generateChallengeLink() {
        if (!selectedItemId || !currentUser) return;
        
        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) return;

        const uniqueId = crypto.randomUUID();

        // Save locally as pending
        await db.sentChallenge.add({
            uuid: uniqueId,
            player_id: currentUser.id!,
            title: item.title,
            description: item.description,
            points: item.points,
            message: customMessage,
            created_at: new Date(),
            status: 'pending'
        });

        // Delete from inventory
        await db.inventory.delete(item.id!);

        const payload = {
            type: 'theo-challenge-req-v1',
            id: uniqueId,
            from: currentUser.nickname,
            fromScore: currentUser.score, // ADDED: Send my score
            item: {
                title: item.title,
                points: item.points,
                description: item.description
            },
            message: customMessage
        };

        try {
            const jsonPayload = JSON.stringify(payload);
            const base64 = btoa(jsonPayload);
            generatedShareLink = `${window.location.origin}?challenge=${base64}`;
        } catch (err) {
            console.error(err);
        }
    }
    
    // STEP 1: Receiver opens link -> Sees "Request Claim"
    async function handleIncomingShare(data: any) {
        if (data.type === 'theo-challenge-req-v1' && currentUser?.id) {
            if (data.from === currentUser.nickname) {
                alert("You cannot accept your own challenge!");
                return;
            }

            // Check if already accepted
            const existing = await db.challengue.where('uuid').equals(data.id).first();
            if (existing) {
                alert("You have already accepted this challenge!");
                return;
            }

            // Show Claim Request Modal
            // If new friend or updated score
            if (data.fromScore !== undefined) {
                 await updatePeerScore(data.from, data.fromScore);
            }

            pendingClaimRequest = data;
            
             // Create Claim Code:  challengeUUID | receiverNickname | receiverScore
            const claimPayload = {
                type: 'theo-claim-v1',
                cid: data.id,
                claimer: currentUser.nickname,
                claimerScore: currentUser.score || 0
            };
            generatedClaimCode = btoa(JSON.stringify(claimPayload));

            (document.getElementById('claim_request_modal') as HTMLDialogElement)?.showModal();
        } 
    }

    // STEP 2: Sender verifies Claim Code -> Generates Auth Key
    async function verifyClaimCode() {
        try {
            const json = atob(pendingVerificationId || '');
            const data = JSON.parse(json);

            if (data.type !== 'theo-claim-v1') throw new Error("Invalid code");

            // If verification starts, update the claimee score
            if (data.claimerScore !== undefined) {
                 await updatePeerScore(data.claimer, data.claimerScore);
            }

            // Check if challenge exists and is pending
            const challenge = await db.sentChallenge.where('uuid').equals(data.cid).first();
            
            if (!challenge) {
                 alert("Challenge not found! Maybe you deleted it?");
                 return;
            }

            if (challenge.status !== 'pending') {
                alert(`This challenge was already claimed by ${challenge.claimed_by || 'someone'}!`);
                return;
            }
            
            // Mark as accepted
            await db.sentChallenge.update(challenge.id!, {
                status: 'accepted',
                claimed_by: data.claimer
            });

            // Generate Auth Key:  challengeUUID | CONFIRMED | senderScore
            const authPayload = {
                type: 'theo-auth-v1',
                cid: data.cid,
                valid: true,
                senderScore: currentUser.score || 0
            };
            generatedAuthKey = btoa(JSON.stringify(authPayload));

        } catch (e) {
            alert("Invalid Claim Code!");
            console.error(e);
        }
    }

    // STEP 3: Receiver enters Auth Key -> Adds Challenge
    async function finalizeClaim() {
        if (!pendingClaimRequest || !authKeyInput) return;

        try {
            const json = atob(authKeyInput);
            const data = JSON.parse(json);

             if (data.type !== 'theo-auth-v1' || data.cid !== pendingClaimRequest.id || !data.valid) {
                 alert("Invalid Authorization Key!");
                 return;
             }

             if (data.senderScore !== undefined && pendingClaimRequest.from) {
                 await updatePeerScore(pendingClaimRequest.from, data.senderScore);
             }

             // SUCCESS!
               await db.challengue.add({
                uuid: pendingClaimRequest.id,
                player_id: currentUser!.id!,
                title: pendingClaimRequest.item.title,
                description: pendingClaimRequest.item.description,
                points: pendingClaimRequest.item.points,
                reward: pendingClaimRequest.item.points,
                from_player: pendingClaimRequest.from,
                message: pendingClaimRequest.message
            });

            alert("Challenge Accepted Successfully!");
            closeClaimModal();

        } catch (e) {
            alert("Invalid Key format");
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
                <div class="card-actions justify-end gap-2">
                        <button class="btn btn-secondary btn-sm" onclick={openVerifyModal}>Verify Claim</button>
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
                        <p class="text-xs text-base-content/80 mt-1">{challenge.description}</p>
                        {#if challenge.message}
                            <p class="text-xs text-base-content/60 mt-1 italic">"{challenge.message}"</p>
                        {/if}
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
            
            {#if !generatedShareLink}
                <p class="py-4 text-sm text-center text-base-content/70">Pick an item from your inventory to generate a Challenge Link.</p>
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
                            onclick={generateChallengeLink}
                            disabled={!selectedItemId}>
                            Create Challenge Link
                        </button>
                    </form>
                </div>
            {:else}
                <div class="flex flex-col items-center justify-center py-6 gap-4">
                    
                    <div class="w-full">
                        <p class="text-sm text-center mb-2">Share this link with your friend:</p>
                        <div class="join w-full">
                            <input type="text" value={generatedShareLink} readonly class="input input-bordered input-sm join-item w-full text-xs" />
                            <button class="btn btn-sm btn-primary join-item" onclick={() => {
                                if (generatedShareLink) {
                                    navigator.clipboard.writeText(generatedShareLink);
                                    alert('Link copied!');
                                }
                            }}>Copy</button>
                        </div>
                         <button class="btn btn-sm btn-outline w-full mt-2" onclick={() => {
                             if (navigator.share && generatedShareLink) {
                                 navigator.share({
                                     title: 'I challenge you!',
                                     text: `Completing the ${selectedItemId} challenge on Theo Challengers!`,
                                     url: generatedShareLink
                                 });
                             } else {
                                 alert('Share API not supported, please copy the link manually.');
                             }
                         }}>
                            Share via App 🔗
                         </button>
                    </div>

                    <button class="btn btn-ghost btn-xs mt-4" onclick={() => {
                        generatedShareLink = null;
                    }}>Create Another</button>
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

    <!-- RECEIVER: Claim Request Modal -->
    <dialog id="claim_request_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
             <h3 class="font-bold text-lg text-center">Challenge Request</h3>
             
             {#if pendingClaimRequest}
                <div class="py-4">
                    <p class="text-sm text-center">You are requesting a challenge from <span class="font-bold text-primary">{pendingClaimRequest.from}</span></p>
                    
                    <div class="card bg-base-200 p-3 mt-2">
                         <h4 class="font-bold">{pendingClaimRequest.item.title}</h4>
                         <p class="text-xs">{pendingClaimRequest.item.description}</p>
                         <p class="text-xs mt-2 italic">"{pendingClaimRequest.message}"</p>
                    </div>

                    <div class="divider text-xs">STEP 1</div>
                    <p class="text-xs text-center mb-2">Send this <span class="font-bold">Claim Code</span> to {pendingClaimRequest.from}:</p>
                    
                    <div class="join w-full">
                         <input type="text" value={generatedClaimCode} readonly class="input input-bordered input-sm join-item w-full text-xs" />
                         <button class="btn btn-sm btn-primary join-item" onclick={() => {
                             if (generatedClaimCode) navigator.clipboard.writeText(generatedClaimCode);
                         }}>Copy</button>
                    </div>
                     <button class="btn btn-sm btn-outline w-full mt-2" onclick={() => {
                             if (navigator.share && generatedClaimCode) {
                                 navigator.share({
                                     text: generatedClaimCode
                                 });
                             }
                        }}>Share Code 📤</button>

                    <div class="divider text-xs">STEP 2</div>
                    <p class="text-xs text-center mb-2">Paste the <span class="font-bold">Auth Key</span> they send back:</p>
                    <input type="text" bind:value={authKeyInput} placeholder="Paste Auth Key here..." class="input input-bordered input-sm w-full" />
                    
                    <button class="btn btn-success btn-block mt-4" disabled={!authKeyInput} onclick={finalizeClaim}>
                        Accept Challenge
                    </button>
                </div>
             {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeClaimModal}>close</button>
        </form>
    </dialog>

     <!-- SENDER: Verify Claim Modal -->
    <dialog id="verify_claim_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
             <form method="dialog">
                 <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick={closeVerifyModal}>✕</button>
            </form>
            <h3 class="font-bold text-lg text-center">Verify Claim</h3>
            <p class="text-xs text-center mt-1 text-base-content/70">Paste the Claim Code your friend sent you.</p>

            <div class="py-4">
                {#if !generatedAuthKey}
                    <div class="form-control w-full mt-4">
                        <textarea 
                            class="textarea textarea-bordered h-24" 
                            placeholder="Paste claim code here..." 
                            bind:value={pendingVerificationId}
                        ></textarea>
                    </div>
                    <button class="btn btn-primary btn-block mt-4" onclick={verifyClaimCode} disabled={!pendingVerificationId}>
                        Verify & Generate Key
                    </button>
                {:else}
                    <div class="flex flex-col items-center justify-center py-4 gap-4">
                        <div class="alert alert-success text-xs shadow-md">
                            <span>Authorized! Challenge marked as Accepted.</span>
                        </div>
                        
                        <div class="w-full">
                            <p class="text-sm text-center mb-2">Send this <span class="font-bold">Auth Key</span> back to your friend:</p>
                            <div class="join w-full">
                                <input type="text" value={generatedAuthKey} readonly class="input input-bordered input-sm join-item w-full text-xs" />
                                <button class="btn btn-sm btn-primary join-item" onclick={() => {
                                    if (generatedAuthKey) {
                                        navigator.clipboard.writeText(generatedAuthKey);
                                        alert('Auth Key copied!');
                                    }
                                }}>Copy</button>
                            </div>
                            <button class="btn btn-sm btn-outline w-full mt-2" onclick={() => {
                                if (navigator.share && generatedAuthKey) {
                                    navigator.share({
                                        text: generatedAuthKey
                                    });
                                }
                            }}>Share Key 📤</button>
                        </div>

                        <button class="btn btn-ghost btn-xs" onclick={() => {
                            generatedAuthKey = null;
                            pendingVerificationId = null;
                        }}>Verify Another</button>
                    </div>
                {/if}
            </div>
            
        </div>
        <form method="dialog" class="modal-backdrop">
             <button onclick={closeVerifyModal}>close</button>
        </form>
    </dialog>
</div>
