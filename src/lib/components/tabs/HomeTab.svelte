<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challengue } from '$lib/models/challengue';
    import { _ } from 'svelte-i18n';
    
    // Services & Stores
    import { useUser } from '$lib/stores/user.svelte';
    import { 
        createChallengeLink, 
        processIncomingChallengeLink, 
        generateVerificationLink,
        verifyClaimCode as serviceVerifyClaim,
        finalizeChallengeClaim,
    } from '$lib/services/challenge';
    import { I18N } from '$lib/i18n-keys';

    // State
    const userStore = useUser();
    let currentUser = $derived(userStore.value);
    
    let inventory = $state<Inventory[]>([]);
    let activeChallenges = $state<Challengue[]>([]);
    
    // Modal State
    let isSendModalOpen = $state(false);
    let isVerificationModalOpen = $state(false); 
    
    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');
    let generatedShareLink = $state<string | null>(null);
    
    // Pending claim request info (for Receiver)
    let pendingClaimRequest = $state<{id: string, from: string, item: any, message?: string} | null>(null);

    // Pending sent info (for Sender)
    let pendingVerificationId = $state<string | null>(null); // Input for claim code
    let generatedAuthKey = $state<string | null>(null); // Output auth link

    // Copy Feedback State
    let copiedState = $state<string | null>(null);

    function copyToClipboard(text: string, id: string) {
        navigator.clipboard.writeText(text);
        copiedState = id;
        setTimeout(() => {
            if (copiedState === id) copiedState = null;
        }, 2000);
    }

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
                pendingVerificationId = verifyData; 
                openVerifyModal();
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) { console.error("Invalid verify link", e); }
        }

        // 3. Finalize Link (Receiver opens)
        const finalizeData = params.get('finalize');
        if (finalizeData && currentUser?.id) {
            try {
                const json = atob(finalizeData);
                const data = JSON.parse(json);
                finalizeClaim(data);
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) { console.error("Invalid finalize link", e); }
        }
    });

    function openSendModal() {
        isSendModalOpen = true;
        (document.getElementById('send_challenge_modal') as HTMLDialogElement)?.showModal();
    }

    function openVerifyModal() {
        isVerificationModalOpen = true;
        (document.getElementById('verify_claim_modal') as HTMLDialogElement)?.showModal();
    }

    function closeVerifyModal() {
        isVerificationModalOpen = false;
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
        (document.getElementById('claim_request_modal') as HTMLDialogElement)?.close();
    }

    async function generateChallengeLink() {
        if (!selectedItemId || !currentUser) return;
        
        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) return;

        const link = await createChallengeLink(currentUser, item, customMessage);
        if (link) {
            generatedShareLink = link;
        }
    }
    
    async function handleIncomingShare(data: any) {
        if (!currentUser) return;
        try {
            const validated = await processIncomingChallengeLink(data, currentUser);
            if (validated) {
                pendingClaimRequest = validated;
                (document.getElementById('claim_request_modal') as HTMLDialogElement)?.showModal();
            }
        } catch (e: any) {
            if (e.message && (e.message.startsWith('store.') || e.message.startsWith('home.'))) {
                alert($_(e.message));
            } else {
                console.error(e);
            }
        }
    }

    async function acceptChallenge() {
        if (!pendingClaimRequest || !currentUser?.id) return;
        
        try {
             await db.challengue.add({
                uuid: pendingClaimRequest.id,
                player_id: currentUser.id!,
                title: pendingClaimRequest.item.title,
                description: pendingClaimRequest.item.description,
                points: pendingClaimRequest.item.points,
                reward: pendingClaimRequest.item.points,
                from_player: pendingClaimRequest.from,
                message: pendingClaimRequest.message,
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
         
         const link = await generateVerificationLink(challenge, currentUser);
         
        if (navigator.share) {
             navigator.share({
                 title: $_(I18N.home.share_verify_title),
                 text: $_(I18N.home.share_verify_text),
                 url: link
             });
        } else {
             copyToClipboard(link, 'verify-link-' + challenge.id);
             alert("Verification Link Copied!");
        }
    }

    async function verifyClaimCode() {
        if (!currentUser || !pendingVerificationId) return;

        const result = await serviceVerifyClaim(currentUser, pendingVerificationId);

        if (result.success && result.authRawLink) {
            generatedAuthKey = result.authRawLink;
        } else {
            alert("Verification Failed: " + (result.error ? $_('store.' + result.error + '_error') : "Unknown Error"));
        }
    }

    async function finalizeClaim(authData: any) {
        if (!authData || !currentUser) return;

        try {
             const result = await finalizeChallengeClaim(authData, currentUser);

            alert($_(I18N.store.validated_success));
            if (result.isStreakBonus && result.multiplier > 1) {
                 alert($_(I18N.home.streak_bonus_applied, { values: { multiplier: result.multiplier } }));
             }

            closeClaimModal();
            window.location.reload(); 

        } catch (e: any) {
            console.error(e);
            const msg = e.message?.startsWith('store.') ? $_(e.message) : "Failed to finalize claim";
            alert(msg);
        }
    }
</script>

<div class="space-y-6 relative">
    <div class="navbar bg-base-100/50 backdrop-blur-md rounded-2xl shadow-sm sticky top-2 z-10">
        <div class="flex-1">
            <a href="/" class="btn btn-ghost text-xl font-bold tracking-tight">
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
                <h2 class="card-title">{$_(I18N.home.welcome, { values: { user: currentUser?.nickname || 'Player' } })}</h2>
                <p>{$_(I18N.home.ready_msg)}</p>
                <div class="card-actions justify-end gap-2">
                    <button class="btn btn-primary btn-sm" onclick={openSendModal}>{$_(I18N.home.send_challenge)}</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
             <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-secondary">
                        <span class="text-2xl">🏆</span>
                    </div>
                    <div class="stat-title text-xs">{$_(I18N.home.score)}</div>
                    <div class="stat-value text-secondary text-2xl">{currentUser?.score || 0}</div>
                    <div class="stat-desc">{$_(I18N.home.points)}</div>
                </div>
            </div>

            <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-primary">
                        <span class="text-2xl">🪙</span>
                    </div>
                    <div class="stat-title text-xs">{$_(I18N.home.coins)}</div>
                    <div class="stat-value text-primary text-2xl">{currentUser?.coins || 0}</div>
                    <div class="stat-desc">{$_(I18N.home.available)}</div>
                </div>
            </div>
        </div>
    </div>

     <!-- Active Challenges List -->
    <div class="divider text-base-content/50 font-medium">{$_(I18N.home.active_challenges)}</div>
    
    {#if activeChallenges.length === 0}
        <div class="text-center py-8 text-base-content/50 text-sm bg-base-100 rounded-box border border-dashed border-base-300">
            <p>{$_(I18N.home.no_active_challenges)}</p>
        </div>
    {:else}
        <div class="grid grid-cols-1 gap-4">
            {#each activeChallenges as challenge}
            <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all cursor-pointer group">
                <div class="card-body p-4 flex-row items-center gap-4">
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <h3 class="font-bold group-hover:text-primary transition-colors">{$_(challenge.title)}</h3>
                            <span class="badge badge-sm badge-ghost">{challenge.points} pts</span>
                        </div>
                        <p class="text-xs text-base-content/80 mt-1">{$_(challenge.description)}</p>
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
                    {$_(I18N.home.challenge_sent_title)}
                {:else}
                    {$_(I18N.home.select_challenge_title)}
                {/if}
            </h3>
            
            {#if !generatedShareLink}
                <p class="py-4 text-sm text-center text-base-content/70">{$_(I18N.home.select_challenge_subtitle)}</p>
                <div class="form-control w-full gap-4">
                    <!-- Select Item -->
                    <div>
                        <label class="label">
                            <span class="label-text">{$_(I18N.home.select_challenge_title)}</span>
                        </label>
                        <select class="select select-bordered w-full" bind:value={selectedItemId}>
                            <option disabled selected value={null}>{$_(I18N.home.select_challenge_title)}</option>
                            {#each inventory as item}
                                <option value={item.id}>{item.icon || '📜'} {$_(item.title)} ({item.points} pts)</option>
                            {/each}
                        </select>
                        {#if inventory.length === 0}
                            <div class="label">
                                <span class="label-text-alt text-warning">{$_(I18N.inventory.empty)}</span>
                            </div>
                        {/if}
                    </div>

                    <!-- Custom Message -->
                    <div>
                        <label class="label">
                            <span class="label-text">{$_(I18N.home.custom_message)}</span>
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
                        {$_(I18N.home.create_link)}
                    </button>
                </div>
            {:else}
                <div class="flex flex-col items-center justify-center py-6 gap-4">
                    
                    <div class="w-full">
                        <p class="text-sm text-center mb-2">{$_(I18N.home.share_link)}</p>
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
                                    {$_(I18N.home.copy_btn)}
                                {/if}
                            </button>
                        </div>
                         <button class="btn btn-sm btn-outline w-full mt-2" onclick={() => {
                             if (navigator.share && generatedShareLink) {
                                 const itemTitle = inventory.find(i => i.id === selectedItemId)?.title || selectedItemId;
                                 navigator.share({
                                     title: $_(I18N.home.share_challenge_title),
                                     text: $_(I18N.home.share_challenge_text, { values: { item: $_(itemTitle) } }),
                                     url: generatedShareLink
                                 });
                             } else if (generatedShareLink) {
                                 copyToClipboard(generatedShareLink, 'challenge-share-fallback');
                             }
                         }}>
                            {#if copiedState === 'challenge-share-fallback'}
                                {$_(I18N.home.link_copied)} ✅
                            {:else}
                                {$_(I18N.home.share_via_app)} 🔗
                            {/if}
                         </button>
                    </div>

                    <button class="btn btn-ghost btn-xs mt-4" onclick={() => {
                        generatedShareLink = null;
                        selectedItemId = null;
                    }}>{$_(I18N.home.create_another_link)}</button>
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
             <h3 class="font-bold text-lg text-center">{$_(I18N.store.challenge_request_title)}</h3>
             
             {#if pendingClaimRequest}
                <div class="py-4">
                    <p class="text-sm text-center">{@html $_(I18N.store.requesting_from, { values: { user: pendingClaimRequest.from } })}</p>
                    
                    <div class="card bg-base-200 p-3 mt-4 mb-6 shadow-inner">
                         <h4 class="font-bold text-center text-lg">{$_(pendingClaimRequest.item.title)}</h4>
                         <p class="text-sm text-center opacity-80">{$_(pendingClaimRequest.item.description)}</p>
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
                            {$_(I18N.store.decline_challenge)}
                        </button>
                        <button class="btn btn-success" onclick={acceptChallenge}>
                            {$_(I18N.store.accept_challenge)}
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
            <h3 class="font-bold text-lg text-center">{$_(I18N.store.verify_claim_title)}</h3>
            <p class="text-xs text-center mt-1 text-base-content/70">{$_(I18N.store.verify_claim_subtitle)}</p>

            <div class="py-4">
                {#if !generatedAuthKey}
                    <div class="form-control w-full mt-4">
                        <p class="text-xs text-center mb-2">{$_(I18N.store.wait_friend_verification)}</p>
                        <textarea 
                            class="textarea textarea-bordered h-24 w-full text-xs" 
                            placeholder={$_(I18N.store.paste_claim_code)}
                            bind:value={pendingVerificationId}
                        ></textarea>
                    </div>

                    <div class="modal-action">
                        <button class="btn btn-primary w-full" onclick={verifyClaimCode} disabled={!pendingVerificationId}>
                            {$_(I18N.store.verify_confirm_btn)}
                        </button>
                    </div>
                {:else}
                    <div class="flex flex-col items-center justify-center py-4 gap-4">
                         <div class="alert alert-success text-xs shadow-md">
                            <span>{$_(I18N.home.challenge_accepted)}</span>
                        </div>

                         <div class="w-full">
                            <p class="text-sm text-center mb-2">{@html $_(I18N.home.send_confirm_link_back)}</p>
                            
                            <button class="btn btn-primary w-full" onclick={() => {
                                if (navigator.share && generatedAuthKey) {
                                    navigator.share({
                                        title: $_(I18N.home.share_confirmed_title),
                                        text: $_(I18N.home.confirmed_msg),
                                        url: generatedAuthKey
                                    });
                                } else if (generatedAuthKey) {
                                    copyToClipboard(generatedAuthKey, 'confirm-link');
                                }
                            }}>
                                {#if copiedState === 'confirm-link'}
                                    {$_(I18N.home.link_copied)} ✅
                                {:else}
                                    {$_(I18N.store.share_confirmation_link)}
                                {/if}
                            </button>
                        </div>
                        
                    </div>
                {/if}
            </div>
            
        </div>
        <form method="dialog" class="modal-backdrop">
             <button onclick={closeVerifyModal}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>
</div>
