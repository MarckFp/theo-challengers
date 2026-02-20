<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Inventory } from '$lib/models/inventory';
    import type { Challenge } from '$lib/models/challenge';
    import { _ } from 'svelte-i18n';
    import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
    import { openUrl } from '@tauri-apps/plugin-opener';
    
    // Services & Stores
    import { useUser } from '$lib/stores/user.svelte';
    import { useInventory } from '$lib/stores/inventory.svelte';
    import { 
        createChallengeLink, 
        commitChallengeLink,
        processIncomingChallengeLink, 
        generateVerificationLink,
        verifyClaimCode as serviceVerifyClaim,
        finalizeChallengeClaim,
    } from '$lib/services/challenge';
    import { I18N } from '$lib/i18n-keys';

    // Components
    import QrCode from '$lib/components/QrCode.svelte';
    import QrScanner from '$lib/components/QrScanner.svelte';
    import ChallengeShareActions from '$lib/components/ChallengeShareActions.svelte';

    // State
    const userStore = useUser();
    let currentUser = $derived(userStore.value);
    
    const inventoryStore = useInventory();
    let inventory = $derived(inventoryStore.value);
    let activeChallenges = $state<Challenge[]>([]);
    
    // Modal State
    let isSendModalOpen = $state(false);
    let isVerificationModalOpen = $state(false); 
    let isScannerOpen = $state(false);
    let isShowQrModalOpen = $state(false); // To show general QR code
    let qrCodeTitle = $state('');
    let qrCodeValue = $state('');

    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');
    let generatedShareLink = $state<string | null>(null);
    let generatedChallengeId = $state<string | null>(null);
    let isChallengeCommitted = $state(false);
    
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

    function showQr(title: string, value: string) {
        qrCodeTitle = title;
        qrCodeValue = value;
        isShowQrModalOpen = true;
        (document.getElementById('show_qr_modal') as HTMLDialogElement)?.showModal();
    }

    function handleScan(decodedText: string) {
        isScannerOpen = false;
        (document.getElementById('scanner_modal') as HTMLDialogElement)?.close();

        try {
            if (!handleIncomingUrl(decodedText)) {
                alert("Unknown QR Code format");
            }
        } catch (error) {
             alert("Invalid QR Code: " + error);
        }
    }

    function handleIncomingUrl(rawUrl: string): boolean {
        if (!currentUser?.id) return false;

        try {
            const url = new URL(rawUrl);
            const params = new URLSearchParams(url.search);

            const challengeData = params.get('challenge');
            if (challengeData) {
                const json = atob(challengeData);
                const data = JSON.parse(json);
                handleIncomingShare(data);
                return true;
            }

            const verifyData = params.get('verify_claim');
            if (verifyData) {
                pendingVerificationId = verifyData;
                openVerifyModal();
                return true;
            }

            const finalizeData = params.get('finalize');
            if (finalizeData) {
                const json = atob(finalizeData);
                const data = JSON.parse(json);
                finalizeClaim(data);
                return true;
            }

            return false;
        } catch (e) {
            console.error('Invalid incoming URL', e);
            return false;
        }
    }



    // Fetch Active Challenges
    $effect(() => {
        if (!currentUser?.id) return;
        const subscription = liveQuery(() => 
            db.challenge
                .where('playerId').equals(currentUser.id!)
                .filter(c => c.completedAt === undefined || c.completedAt === null)
                .toArray()
        ).subscribe(result => {
            activeChallenges = result;
        });
        return () => subscription.unsubscribe();
    });

    // Check for incoming challenge/verify/finalize via URL (Page Load)
    $effect(() => {
        if (handleIncomingUrl(window.location.href)) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    });

    // Deep links while app is running (Tauri mobile/desktop)
    $effect(() => {
        if (!currentUser?.id) return;

        let unlisten: (() => void) | undefined;

        (async () => {
            try {
                unlisten = await onOpenUrl((payload: any) => {
                    const urls = Array.isArray(payload) ? payload : payload?.urls;
                    if (!Array.isArray(urls)) return;

                    for (const incomingUrl of urls) {
                        if (handleIncomingUrl(incomingUrl)) {
                            break;
                        }
                    }
                });
            } catch {
                // Not running in Tauri or deep-link plugin unavailable in this environment.
            }
        })();

        return () => {
            unlisten?.();
        };
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
        generatedChallengeId = null;
        isChallengeCommitted = false;
        selectedItemId = null;
        customMessage = '';
        (document.getElementById('send_challenge_modal') as HTMLDialogElement)?.close();
    }

    function closeShareChallengeFlow() {
        isShowQrModalOpen = false;
        (document.getElementById('show_qr_modal') as HTMLDialogElement)?.close();
        closeSendModal();
    }
    
    function closeClaimModal() {
        pendingClaimRequest = null;
        (document.getElementById('claim_request_modal') as HTMLDialogElement)?.close();
    }

    async function generateChallengeLink() {
        if (!selectedItemId || !currentUser) return;
        
        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) return;

        const draft = await createChallengeLink(currentUser, item, customMessage);
        if (draft) {
            generatedShareLink = draft.link;
            generatedChallengeId = draft.id;
            isChallengeCommitted = false;
        }
    }

    async function commitChallengeIfNeeded() {
        if (isChallengeCommitted) return true;
        if (!currentUser || !selectedItemId || !generatedChallengeId) return false;

        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) return false;

        const committed = await commitChallengeLink(currentUser, item, customMessage, generatedChallengeId);
        if (committed) {
            isChallengeCommitted = true;
        }
        return committed;
    }

    function resolveGeneratedShareLink(): string {
        if (typeof generatedShareLink === 'string') return generatedShareLink;
        if (generatedShareLink && typeof generatedShareLink === 'object' && 'link' in (generatedShareLink as any)) {
            return String((generatedShareLink as any).link ?? '');
        }
        return '';
    }

    async function handleShowQrFromShareActions() {
        const shareLink = resolveGeneratedShareLink();
        if (!shareLink) return;
        const committed = await commitChallengeIfNeeded();
        if (!committed) return;
        showQr($_(I18N.home.show_qr), shareLink);
    }

    async function tryAndroidNativeShare(title: string, text: string, shareLink: string): Promise<boolean> {
        const isTauriAndroid =
            typeof window !== 'undefined' &&
            /Android/i.test(navigator.userAgent) &&
            '__TAURI_INTERNALS__' in window;

        if (!isTauriAndroid) return false;

        const payload = `${text}\n${shareLink}`;
        const intentUrl = `intent://share/#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.SUBJECT=${encodeURIComponent(title)};S.android.intent.extra.TEXT=${encodeURIComponent(payload)};end`;

        try {
            await openUrl(intentUrl);
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async function fallbackShareViaClipboard(shareLink: string) {
        try {
            await navigator.clipboard.writeText(shareLink);
            const committed = await commitChallengeIfNeeded();
            if (committed) {
                alert($_(I18N.home.link_copied));
                closeShareChallengeFlow();
            }
        } catch (error) {
            console.error(error);
            const committed = await commitChallengeIfNeeded();
            if (committed) {
                showQr($_(I18N.home.show_qr), shareLink);
            }
        }
    }

    async function handleShareViaAppFromShareActions() {
        if (!generatedChallengeId || !selectedItemId || !currentUser) return;
        const shareLink = resolveGeneratedShareLink();
        if (!shareLink) return;

        const item = inventory.find(i => i.id === selectedItemId);
        if (!item) return;

        if (!navigator.share) {
            await fallbackShareViaClipboard(shareLink);
            return;
        }

        const itemTitle = item.title ?? '';
        const shareTitle = $_(I18N.home.share_challenge_title);
        const shareText = $_(I18N.home.share_challenge_text, { values: { item: itemTitle ? $_(itemTitle) : '' } });

        if (await tryAndroidNativeShare(shareTitle, shareText, shareLink)) {
            const committed = await commitChallengeIfNeeded();
            if (committed) {
                closeShareChallengeFlow();
            }
            return;
        }

        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareLink
            });
            const committed = await commitChallengeIfNeeded();
            if (committed) {
                closeShareChallengeFlow();
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                return;
            } else {
                console.error(error);
                await fallbackShareViaClipboard(shareLink);
            }
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
             await db.challenge.add({
                uuid: pendingClaimRequest.id,
                playerId: currentUser.id!,
                title: pendingClaimRequest.item?.title,
                description: pendingClaimRequest.item?.description,
                points: pendingClaimRequest.item?.points,
                reward: pendingClaimRequest.item?.points,
                fromPlayer: pendingClaimRequest.from,
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

    async function generateVerificationLinkForActive(challenge: Challenge) {
         if (!currentUser) return;
         
         const link = await generateVerificationLink(challenge, currentUser);
         
         // Ask user if they want to copy link or show QR code
         // For simplification, we'll auto-copy but provide UI elsewhere or just show alert with choices?
         // Let's change the flow: Show a mini-modal with choices "Copy Link" or "Show QR"?
         // Or just show QR immediately in a modal with the link below it. That's best for "proximity".
         
         showQr($_(I18N.home.share_verify_title), link);
    }

    async function verifyClaimCode() {
        if (!currentUser || !pendingVerificationId) return;

        // If it's a full URL, we might need to extract the verify_claim param or just pass it if the service handles it
        // The service expects the raw ID usually, but let's check input
        let code = pendingVerificationId;
        try {
            const url = new URL(code);
            const p = url.searchParams.get('verify_claim');
            if(p) code = p;
        } catch {}

        const result = await serviceVerifyClaim(currentUser, code);

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
        <div class="flex-none gap-2">
            <!-- Scan QR Button (Top Right) -->
            <button class="btn btn-ghost btn-circle" onclick={() => {
                isScannerOpen = true;
                (document.getElementById('scanner_modal') as HTMLDialogElement)?.showModal();
            }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                </svg>
            </button>

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
                <div class="mt-3">
                    <button class="btn btn-primary w-full" onclick={openSendModal}>{$_(I18N.home.send_challenge)}</button>
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
                        <p class="text-[10px] text-base-content/50 mt-1">From: {challenge.fromPlayer || 'System'}</p>
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
                <div class="py-4 space-y-4">
                    <!-- Step 1: Select Challenge -->
                    <div>
                        <h4 class="text-sm font-semibold mb-2 opacity-70 flex items-center gap-2">
                             <span>🎯</span> {$_(I18N.home.select_challenge_title)}
                        </h4>
                        
                        {#if inventory.length === 0}
                            <div class="alert alert-warning text-xs shadow-sm">
                                <span>{$_(I18N.inventory.empty)}</span>
                            </div>
                        {:else}
                            <div class="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {#each inventory as item}
                            {#if item.id !== undefined}
                                <button 
                                    class="w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-center gap-3 relative overflow-hidden group
                                    {selectedItemId === item.id 
                                        ? 'bg-primary/10 border-primary shadow-sm' 
                                        : 'bg-base-100 border-base-200 hover:border-primary/50 hover:bg-base-200'}"
                                    onclick={() => selectedItemId = item.id!}
                                >
                                    <div class="text-2xl bg-base-100 rounded-lg w-10 h-10 flex items-center justify-center shadow-sm">
                                        {item.icon || '📜'}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="font-bold text-sm truncate">{$_(item.title)}</div>
                                        <div class="text-xs opacity-60 truncate">{$_(item.description)}</div>
                                    </div>
                                    <div class="badge badge-sm" class:badge-primary={selectedItemId === item.id} class:badge-ghost={selectedItemId !== item.id}>
                                        {item.points} pts
                                    </div>
                                    
                                    {#if selectedItemId === item.id}
                                        <div class="absolute inset-0 border-2 border-primary rounded-xl pointer-events-none"></div>
                                    {/if}
                                </button>
                            {/if}
                        {/each}
                            </div>
                        {/if}
                    </div>

                    <!-- Step 2: Custom Message -->
                    <div>
                        <h4 class="text-sm font-semibold mb-2 opacity-70 flex items-center gap-2">
                             <span>✍️</span> {$_(I18N.home.custom_message)}
                        </h4>
                        <textarea 
                            class="textarea textarea-bordered h-24 w-full focus:textarea-primary transition-all" 
                            placeholder={$_('home.message_placeholder')}
                            bind:value={customMessage}
                        ></textarea>
                         <div class="label">
                            <span class="label-text-alt opacity-50">{$_(I18N.home.personal_touch_phrase)}</span>
                        </div>
                    </div>
                </div>

                <div class="modal-action">
                    <button 
                        class="btn btn-primary w-full gap-2 shadow-lg shadow-primary/20"
                        onclick={generateChallengeLink}
                        disabled={!selectedItemId}>
                        <span>🚀</span> {$_(I18N.home.create_link)}
                    </button>
                </div>
            {:else}
                <ChallengeShareActions
                    on:showQr={handleShowQrFromShareActions}
                    on:shareViaApp={handleShareViaAppFromShareActions}
                    on:cancel={closeSendModal}
                />
                 
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
                        
                         <!-- Confirmation QR Code -->
                        <div class="flex justify-center mb-4">
                             <div class="p-4 bg-white rounded-xl shadow-lg">
                                <QrCode data={generatedAuthKey} size={200} />
                             </div>
                        </div>
                        <p class="text-xs text-center font-bold">Show this to your friend to finalize!</p>

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

    <!-- General QR Code Display Modal -->
    <dialog id="show_qr_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box flex flex-col items-center">
            <h3 class="font-bold text-lg text-center mb-4">{qrCodeTitle}</h3>
            <div class="p-4 bg-white rounded-xl shadow-lg">
                {#if isShowQrModalOpen && qrCodeValue}
                    <QrCode data={qrCodeValue} size={250} />
                {/if}
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn" onclick={closeShareChallengeFlow}>{$_(I18N.common.cancel)}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeShareChallengeFlow}>{$_(I18N.common.cancel)}</button>
        </form>
    </dialog>

    <!-- QR Scanner Modal -->
    <dialog id="scanner_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <h3 class="font-bold text-lg text-center mb-4">Scan QR Code</h3>
            {#if isScannerOpen}
                <QrScanner 
                    onScan={handleScan}
                    onCancel={() => {
                        isScannerOpen = false;
                        (document.getElementById('scanner_modal') as HTMLDialogElement)?.close();
                    }} 
                />
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isScannerOpen = false}>close</button>
        </form>
    </dialog>
</div>
