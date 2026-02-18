<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Player } from '$lib/models/player';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';
    
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

    // Copy Feedback State
    let copiedState = $state<string | null>(null);

    function copyToClipboard(text: string, id: string) {
        navigator.clipboard.writeText(text);
        copiedState = id;
        setTimeout(() => {
            if (copiedState === id) copiedState = null;
        }, 2000);
    }

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


    // Check for incoming challenge/verify/finalize via URL
    $effect(() => {
        const params = new URLSearchParams(window.location.search);
        
        // 1. Challenge Link (Receiver opens)
        const challengeData = params.get('challenge');
        if (challengeData && currentUser?.id) {
             try {
                 const json = atob(challengeData);
                 const data = JSON.parse(json);
                 handleIncomingShare(data);
                 window.history.replaceState({}, document.title, window.location.pathname);
             } catch (e) { console.error("Invalid challenge link", e); }
        }

        // 2. Verify Link (Sender opens)
        const verifyData = params.get('verify_claim');
        if (verifyData && currentUser?.id) {
            try {
                // Auto-fill and open verify modal
                pendingVerificationId = verifyData; // Store raw base64
                openVerifyModal();
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) { console.error("Invalid verify link", e); }
        }

        // 3. Finalize Link (Receiver opens)
        const finalizeData = params.get('finalize');
        if (finalizeData && currentUser?.id) {
            try {
                // Auto-finalize
                const json = atob(finalizeData);
                const data = JSON.parse(json);
                finalizeClaim(data); // Pass data directly
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) { console.error("Invalid finalize link", e); }
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
    
    // STEP 1: Receiver opens link -> Sees "Request Claim" -> Now "Accept/Decline"
    async function handleIncomingShare(data: any) {
        if (data.type === 'theo-challenge-req-v1' && currentUser?.id) {
            if (data.from === currentUser.nickname) {
                alert($_('store.accept_own_error'));
                return;
            }

            // Check if already accepted
            const existing = await db.challengue.where('uuid').equals(data.id).first();
            if (existing) {
                alert($_('store.already_accepted_error'));
                return;
            }

            // Show Claim Request Modal
            // If new friend or updated score
            if (data.fromScore !== undefined) {
                 await updatePeerScore(data.from, data.fromScore);
            }

            pendingClaimRequest = data;
            // No verification link generation yet. Wait for Accept.
            
            (document.getElementById('claim_request_modal') as HTMLDialogElement)?.showModal();
        } 
    }

    async function acceptChallenge() {
        if (!pendingClaimRequest || !currentUser?.id) return;
        
        try {
            // Add as active challenge locally
             await db.challengue.add({
                uuid: pendingClaimRequest.id,
                player_id: currentUser.id,
                title: pendingClaimRequest.item.title,
                description: pendingClaimRequest.item.description,
                points: pendingClaimRequest.item.points,
                reward: pendingClaimRequest.item.points, // Assuming reward = points for p2p
                from_player: pendingClaimRequest.from,
                message: pendingClaimRequest.message,
                // created_at? no field in model but useful.
                // It is NOT completed yet.
            });
            
            closeClaimModal();
            window.location.reload();

        } catch (e) {
            console.error('Failed to accept challenge', e);
        }
    }

    async function declineChallenge() {
        if (!currentUser?.id) return;
        
        try {
            // Penalty
            const newScore = Math.max(0, (currentUser.score || 0) - 1);
            await db.player.update(currentUser.id, {
                score: newScore
            });
            
            closeClaimModal();
        } catch (e) {
            console.error('Failed to decline', e);
        }
    }

    async function generateVerificationLinkForActive(challenge: Challengue) {
         if (!currentUser) return;
         
         const claimPayload = {
            type: 'theo-claim-v1',
            cid: challenge.uuid,
            claimer: currentUser.nickname,
            claimerScore: currentUser.score || 0
        };
        const claimB64 = btoa(JSON.stringify(claimPayload));
        const link = `${window.location.origin}?verify_claim=${claimB64}`;
        
        // Use share API directly or fallback copy
        if (navigator.share) {
             navigator.share({
                 title: $_('home.share_verify_title'),
                 text: $_('home.share_verify_text'),
                 url: link
             });
        } else {
             copyToClipboard(link, 'verify-link-' + challenge.id);
             alert("Verification Link Copied!");
        }
    }

    // STEP 2: Sender verifies Claim Code -> Generates Auth Key
    async function verifyClaimCode() {
        try {
            let code = pendingVerificationId || '';
            // Handle if user pasted full URL
            if (code.includes('verify_claim=')) {
                 code = code.split('verify_claim=')[1];
            }

            const json = atob(code);
            const data = JSON.parse(json);

            if (data.type !== 'theo-claim-v1') throw new Error($_('store.invalid_code_error'));

            // If verification starts, update the claimee score
            if (data.claimerScore !== undefined) {
                 await updatePeerScore(data.claimer, data.claimerScore);
            }

            // Check if challenge exists and is pending
            const challenge = await db.sentChallenge.where('uuid').equals(data.cid).first();
            
            if (!challenge) {
                 alert($_('store.challenge_not_found_error'));
                 return;
            }

            if (challenge.status !== 'pending') {
                alert($_('store.already_claimed_error', { values: { user: challenge.claimed_by || 'someone' } }));
                return;
            }
            
            // Mark as accepted
            await db.sentChallenge.update(challenge.id!, {
                status: 'accepted',
                claimed_by: data.claimer
            });

            // Generate Finalize Link: Includes challenge details so receiver can add it
            const authPayload = {
                type: 'theo-auth-v1',
                cid: data.cid,
                valid: true,
                senderScore: currentUser.score || 0,
                item: {
                    title: challenge.title,
                    description: challenge.description,
                    points: challenge.points
                },
                message: challenge.message,
                from: currentUser.nickname
            };

            const confirmB64 = btoa(JSON.stringify(authPayload));
            generatedAuthKey = `${window.location.origin}?finalize=${confirmB64}`;

        } catch (e) {
            alert("Invalid Claim Code!");
            console.error(e);
        }
    }

    // STEP 3: Receiver enters Auth Key -> Adds Challenge
    async function finalizeClaim(directPayload?: any) {
        let authData = directPayload;

        // If manual input (fallback)
        if (!authData && authKeyInput) {
             try {
                 // Clean up the input in case they pasted the whole URL
                 let code = authKeyInput.trim();
                 if (code.includes('finalize=')) {
                     code = code.split('finalize=')[1];
                 }
                authData = JSON.parse(atob(code));
            } catch {
                alert("Invalid Key format");
                return;
            }
        }

        if (!authData) return;

        try {
             // Validate
             if (authData.type !== 'theo-auth-v1' || !authData.valid) {
                 alert("Invalid Authorization Key!");
                 return;
             }
             
             // In ACTIVE challenges flow, the challenge is already in DB but not marked complete.
             // We need to find the challenge by UUID.
             const existing = await db.challengue.where('uuid').equals(authData.cid).first();
             
             if (!existing) {
                 // If not found, it might be the old flow (adding from scratch). 
                 // But in new flow, we accepted it first.
                 // Let's support both just in case, or enforce "Active" state.
                 // For now, let's assume it IS in active list because we accepted it.
                 alert($_('store.challenge_not_found_error'));
                 return;
             }

             if (existing.completed_at) {
                 alert($_('store.already_achievement_error'));
                 return;
             }

             if (authData.senderScore !== undefined && authData.from) {
                 await updatePeerScore(authData.from, authData.senderScore);
             }

             // SUCCESS! Mark as complete
             // Streak Logic
             const currentStreak = currentUser!.streak || 0;
             const isStreakBonus = currentStreak >= 3;
             const multiplier = isStreakBonus ? 2 : 1;
             
             await db.challengue.update(existing.id!, {
                completed_at: new Date()
             });

             await db.player.update(currentUser!.id!, {
                 score: (currentUser!.score || 0) + (existing.points * multiplier),
                 coins: (currentUser!.coins || 0) + existing.reward,
                 streak: currentStreak + 1
             });

            alert($_('store.validated_success'));
            if (isStreakBonus && multiplier > 1) {
                 alert($_('home.streak_bonus_applied', { values: { multiplier } }));
             }

            closeClaimModal();
            window.location.reload(); 

        } catch (e) {
            console.error(e);
            alert("Failed to finalize claim");
        }
    }

    async function completeActiveChallenge(challenge: Challengue) {
        if (!currentUser?.id || !challenge.id) return;
        
         if (!confirm(`Did you complete "${challenge.title}"?`)) return;

         await db.transaction('rw', db.player, db.challengue, async () => {
             // Streak Logic
             const currentStreak = currentUser.streak || 0;
             const isStreakBonus = currentStreak >= 3;
             const multiplier = isStreakBonus ? 2 : 1;
             
             // Check if we should reset streak?
             // Since this is success, we strictly increment.
             // Reset logic would ideally be: if "rejected" or "failed" (not impl here yet).
             
             const pointsEarned = challenge.points * multiplier;

             await db.challengue.update(challenge.id!, {
                 completed_at: new Date()
             });
             
             await db.player.update(currentUser.id!, {
                 score: (currentUser.score || 0) + pointsEarned,
                 coins: (currentUser.coins || 0) + challenge.reward,
                 streak: currentStreak + 1
             });
             
             if (isStreakBonus && multiplier > 1) {
                 alert($_('home.streak_bonus_applied', { values: { multiplier } }));
             }
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
                <h2 class="card-title">{$_('home.welcome', { values: { user: currentUser?.nickname || 'Player' } })}</h2>
                <p>{$_('home.ready_msg')}</p>
                <div class="card-actions justify-end gap-2">
                     <!-- Button to enter confirmation link manually if user doesn't click link -->
                    <button class="btn btn-accent btn-sm" onclick={() => (document.getElementById('finalize_claim_modal') as HTMLDialogElement)?.showModal()}>
                        {$_('store.enter_confirmation')}
                    </button>
                    <button class="btn btn-primary btn-sm" onclick={openSendModal}>{$_('home.send_challenge')}</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
             <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-secondary">
                        <span class="text-2xl">🏆</span>
                    </div>
                    <div class="stat-title text-xs">{$_('home.score')}</div>
                    <div class="stat-value text-secondary text-2xl">{currentUser?.score || 0}</div>
                    <div class="stat-desc">{$_('home.points')}</div>
                </div>
            </div>

            <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-primary">
                        <span class="text-2xl">🪙</span>
                    </div>
                    <div class="stat-title text-xs">{$_('home.coins')}</div>
                    <div class="stat-value text-primary text-2xl">{currentUser?.coins || 0}</div>
                    <div class="stat-desc">{$_('home.available')}</div>
                </div>
            </div>
        </div>
    </div>

     <!-- Active Challenges List -->
    <div class="divider text-base-content/50 font-medium">{$_('home.active_challenges')}</div>
    
    {#if activeChallenges.length === 0}
        <div class="text-center py-8 text-base-content/50 text-sm bg-base-100 rounded-box border border-dashed border-base-300">
            <p>{$_('home.no_active_challenges')}</p>
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
                    <div class="flex-none flex flex-col gap-2">
                        <!-- Send Proof Button -->
                         <button 
                            class="btn btn-sm btn-info btn-circle text-white shadow-sm" 
                            onclick={(e) => { e.stopPropagation(); generateVerificationLinkForActive(challenge); }}
                            title="Share for Verification"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            {/each}
        </div>
    {/if}

    <!-- SEND Challenge Modal -->
    <dialog id="send_challenge_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <form method="dialog">
                 <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick={closeSendModal}>✕</button>
            </form>
            <h3 class="font-bold text-lg text-center">
                {#if generatedShareLink}
                    {$_('home.challenge_sent_title', {default: "Challenge Created!"})}
                {:else}
                    {$_('home.select_challenge_title', {default: "Select a Challenge"})}
                {/if}
            </h3>
            
            {#if !generatedShareLink}
                <p class="py-4 text-sm text-center text-base-content/70">{$_('home.select_challenge_subtitle', {default: "Pick an item from your inventory to generate a Challenge Link."})}</p>
                <div class="form-control w-full gap-4">
                    <!-- Select Item -->
                    <div>
                        <label class="label">
                            <span class="label-text">{$_('home.select_challenge_title')}</span>
                        </label>
                        <select class="select select-bordered w-full" bind:value={selectedItemId}>
                            <option disabled selected value={null}>{$_('home.select_challenge_title')}</option>
                            {#each inventory as item}
                                <option value={item.id}>{item.icon || '📜'} {item.title} ({item.points} pts)</option>
                            {/each}
                        </select>
                        {#if inventory.length === 0}
                            <div class="label">
                                <span class="label-text-alt text-warning">{$_('inventory.empty')}</span>
                            </div>
                        {/if}
                    </div>

                    <!-- Custom Message -->
                    <div>
                        <label class="label">
                            <span class="label-text">{$_('home.custom_message')}</span>
                        </label>
                        <textarea 
                            class="textarea textarea-bordered h-24 w-full" 
                            placeholder={$_('home.message_placeholder')}
                            bind:value={customMessage}
                        ></textarea>
                    </div>
                </div>

                <div class="modal-action">
                    <button 
                        class="btn btn-primary w-full"
                        onclick={generateChallengeLink}
                        disabled={!selectedItemId}>
                        {$_('home.create_link')}
                    </button>
                </div>
            {:else}
                <div class="flex flex-col items-center justify-center py-6 gap-4">
                    
                    <div class="w-full">
                        <p class="text-sm text-center mb-2">{$_('home.share_link')}</p>
                        <div class="join w-full">
                            <input type="text" value={generatedShareLink} readonly class="input input-bordered input-sm join-item w-full text-xs" />
                            <button class="btn btn-sm btn-primary join-item" onclick={() => {
                                if (generatedShareLink) {
                                    copyToClipboard(generatedShareLink, 'challenge-link');
                                }
                            }}>
                                {#if copiedState === 'challenge-link'}
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                                {:else}
                                    {$_('home.copy_btn')}
                                {/if}
                            </button>
                        </div>
                         <button class="btn btn-sm btn-outline w-full mt-2" onclick={() => {
                             if (navigator.share && generatedShareLink) {
                                 const itemTitle = inventory.find(i => i.id === selectedItemId)?.title || selectedItemId;
                                 navigator.share({
                                     title: $_('home.share_challenge_title'),
                                     text: $_('home.share_challenge_text', { values: { item: itemTitle } }),
                                     url: generatedShareLink
                                 });
                             } else if (generatedShareLink) {
                                 copyToClipboard(generatedShareLink, 'challenge-share-fallback');
                             }
                         }}>
                            {#if copiedState === 'challenge-share-fallback'}
                                {$_('home.link_copied')} ✅
                            {:else}
                                {$_('home.share_via_app')} 🔗
                            {/if}
                         </button>
                    </div>

                    <button class="btn btn-ghost btn-xs mt-4" onclick={() => {
                        generatedShareLink = null;
                    }}>{$_('home.create_another_link', {default: "Create Another"})}</button>
                </div>
                 
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeSendModal}>close</button>
        </form>
    </dialog>

    <!-- RECEIVER: Claim Request Modal (Accept/Decline) -->
    <dialog id="claim_request_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
             <h3 class="font-bold text-lg text-center">{$_('store.challenge_request_title')}</h3>
             
             {#if pendingClaimRequest}
                <div class="py-4">
                    <p class="text-sm text-center">{@html $_('store.requesting_from', { values: { user: pendingClaimRequest.from } })}</p>
                    
                    <div class="card bg-base-200 p-3 mt-4 mb-6 shadow-inner">
                         <h4 class="font-bold text-center text-lg">{pendingClaimRequest.item.title}</h4>
                         <p class="text-sm text-center opacity-80">{pendingClaimRequest.item.description}</p>
                         {#if pendingClaimRequest.message}
                            <div class="divider my-2"></div>
                            <p class="text-sm italic text-center">"{pendingClaimRequest.message}"</p>
                         {/if}
                         <div class="flex justify-center mt-2">
                             <div class="badge badge-primary font-bold">{pendingClaimRequest.item.points} pts</div>
                         </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <button class="btn btn-error btn-outline" onclick={declineChallenge}>
                            {$_('store.decline_challenge')}
                        </button>
                        <button class="btn btn-success" onclick={acceptChallenge}>
                            {$_('store.accept_challenge')}
                        </button>
                    </div>
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
            <h3 class="font-bold text-lg text-center">{$_('store.verify_claim_title')}</h3>
            <p class="text-xs text-center mt-1 text-base-content/70">{$_('store.verify_claim_subtitle')}</p>

            <div class="py-4">
                {#if !generatedAuthKey}
                    <div class="form-control w-full mt-4">
                        <p class="text-xs text-center mb-2">{$_('store.wait_friend_verification')}</p>
                        <textarea 
                            class="textarea textarea-bordered h-24 w-full text-xs" 
                            placeholder={$_('store.paste_claim_code')}
                            bind:value={pendingVerificationId}
                        ></textarea>
                    </div>

                    <div class="modal-action">
                        <button class="btn btn-primary w-full" onclick={verifyClaimCode} disabled={!pendingVerificationId}>
                            {$_('store.verify_confirm_btn')}
                        </button>
                    </div>
                {:else}
                    <div class="flex flex-col items-center justify-center py-4 gap-4">
                         <div class="alert alert-success text-xs shadow-md">
                            <span>{$_('home.challenge_accepted')}</span>
                        </div>

                         <div class="w-full">
                            <p class="text-sm text-center mb-2">{@html $_('home.send_confirm_link_back')}</p>
                            
                            <button class="btn btn-primary w-full" onclick={() => {
                                if (navigator.share && generatedAuthKey) {
                                    navigator.share({
                                        title: $_('home.share_confirmed_title'),
                                        text: $_('home.confirmed_msg'),
                                        url: generatedAuthKey
                                    });
                                } else if (generatedAuthKey) {
                                    copyToClipboard(generatedAuthKey, 'confirm-link');
                                }
                            }}>
                                {#if copiedState === 'confirm-link'}
                                    {$_('home.link_copied')} ✅
                                {:else}
                                    {$_('store.share_confirmation_link')}
                                {/if}
                            </button>
                        </div>
                        
                    </div>
                {/if}
            </div>
            
        </div>
        <form method="dialog" class="modal-backdrop">
             <button onclick={closeVerifyModal}>{$_('profile.close')}</button>
        </form>
    </dialog>
    </div>
