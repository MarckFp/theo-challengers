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
        finalizeChallengeClaim,
    } from '$lib/services/challenge';
    import type { SentChallenge } from '$lib/models/sentChallenge';
    import { CHALLENGE_EXPIRY_OPTIONS, computeExpiresAt, isExpired, resolveExpiryOption, type ChallengeExpiryKey } from '$lib/data/challenge-expiry';
    import { extractProfileCardFromLink, isProfileCardLink, type ProfileCardSnapshot } from '$lib/services/profile-card-link';
    import {
        isProximityApprovalQR,
        isApprovalLink,
        extractApprovalFromLink,
        generateApprovalQR,
        regenerateApproval,
        processApprovalQR,
    } from '$lib/services/proximity-verify';
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
    let isScannerOpen = $state(false);
    let isShowQrModalOpen = $state(false); // To show general QR code
    let qrCodeTitle = $state('');
    let qrCodeValue = $state('');

    // Sent Challenges (Player A sees these — both pending and accepted)
    let sentChallenges = $state<SentChallenge[]>([]);

    // Approval Modal State (Player A: shows approval QR + link)
    let isApprovalModalOpen = $state(false);
    let approvalQRData = $state<string | null>(null);
    let approvalLink = $state<string | null>(null);
    let approvalDone = $state(false);
    let approvalError = $state<string | null>(null);

    // Verification Success Modal (Player B: after scanning approval QR)
    let verifySuccessData = $state<{title?: string; approver?: string; multiplier?: number; isStreakBonus?: boolean} | null>(null);

    let selectedItemId = $state<number | null>(null);
    let customMessage = $state('');
    let selectedExpiryKey = $state<ChallengeExpiryKey>('none');
    let generatedExpiresAt = $state<Date | null>(null);
    let generatedShareLink = $state<string | null>(null);
    let generatedChallengeId = $state<string | null>(null);
    let isChallengeCommitted = $state(false);
    
    // Pending claim request info (for Receiver)
    let pendingClaimRequest = $state<{id: string, from: string, item: any, message?: string, expiresAt?: string | null, expiryCost?: number} | null>(null);

    // Copy Feedback State
    let copiedState = $state<string | null>(null);

    // Expanded QR State (fullscreen overlay)
    let expandedQrData = $state<string | null>(null);
    let receivedProfileCard = $state<ProfileCardSnapshot | null>(null);

    let selectedExpiryOption = $derived.by(() => resolveExpiryOption(selectedExpiryKey));
    let selectedExpiryCost = $derived(selectedExpiryOption.cost);
    let canAffordSelectedExpiry = $derived((currentUser?.coins || 0) >= selectedExpiryCost);

    function getSentChallengeTime(sc: SentChallenge): number {
        return new Date(sc.createdAt).getTime();
    }

    let pendingSentChallenges = $derived.by(() =>
        sentChallenges
            .filter(sc => sc.status === 'pending')
            .sort((a, b) => getSentChallengeTime(b) - getSentChallengeTime(a))
    );

    let verifiedSentChallenges = $derived.by(() =>
        sentChallenges
            .filter(sc => sc.status === 'accepted')
            .sort((a, b) => getSentChallengeTime(b) - getSentChallengeTime(a))
    );

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
        closeScannerModal();

        // 1. Check for proximity approval QR first (Player B scanning Player A's approval)
        if (isProximityApprovalQR(decodedText)) {
            handleApprovalScan(decodedText);
            return;
        }

        // 2. Check for approval link
        if (isApprovalLink(decodedText)) {
            const raw = extractApprovalFromLink(decodedText);
            if (raw) {
                handleApprovalScan(raw);
                return;
            }
        }

        // 2. Fall back to URL-based handling
        try {
            if (isProfileCardLink(decodedText)) {
                const snapshot = extractProfileCardFromLink(decodedText);
                if (snapshot) {
                    receivedProfileCard = snapshot;
                    (document.getElementById('profile_card_modal') as HTMLDialogElement)?.showModal();
                    return;
                }
            }

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

            const profileCard = params.get('profile_card');
            if (profileCard) {
                const snapshot = extractProfileCardFromLink(rawUrl);
                if (snapshot) {
                    receivedProfileCard = snapshot;
                    (document.getElementById('profile_card_modal') as HTMLDialogElement)?.showModal();
                    return true;
                }
            }

            // Approval link (Player B clicked a verification link from Player A)
            const approveData = params.get('approve');
            if (approveData) {
                const raw = 'TA:' + approveData;
                handleApprovalScan(raw);
                return true;
            }

            // Legacy: verify_claim links
            const verifyData = params.get('verify_claim');
            if (verifyData) {
                alert($_(I18N.proximity.use_qr_instead));
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
                .filter(c => (c.completedAt === undefined || c.completedAt === null) && !isExpired(c.expiresAt))
                .toArray()
        ).subscribe(result => {
            activeChallenges = result;
        });
        return () => subscription.unsubscribe();
    });

    // Fetch Sent Challenges (pending + accepted — Player A sees these)
    $effect(() => {
        if (!currentUser?.id) return;
        const subscription = liveQuery(() =>
            db.sentChallenge
                .where('playerId').equals(currentUser.id!)
                .filter(sc => sc.status === 'pending' || sc.status === 'accepted')
                .toArray()
        ).subscribe(result => {
            const sorted = [...result].sort((a, b) => getSentChallengeTime(b) - getSentChallengeTime(a));
            const pendingTop = sorted.filter(sc => sc.status === 'pending').slice(0, 5);
            const acceptedTop = sorted.filter(sc => sc.status === 'accepted').slice(0, 5);

            const picked = [...pendingTop, ...acceptedTop];

            if (picked.length < 10) {
                const pickedUuids = new Set(picked.map(sc => sc.uuid));
                const remaining = sorted.filter(sc => !pickedUuids.has(sc.uuid));
                picked.push(...remaining.slice(0, 10 - picked.length));
            }

            sentChallenges = picked;
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

    // ── Proximity verification helpers ──────────────────────────────

    /** Player A: approve a sent challenge and show approval QR + link */
    async function startApproval(sentChallenge: SentChallenge) {
        if (!currentUser) return;

        approvalQRData = null;
        approvalLink = null;
        approvalDone = false;
        approvalError = null;
        isApprovalModalOpen = true;
        (document.getElementById('approval_modal') as HTMLDialogElement)?.showModal();

        let result;
        if (sentChallenge.status === 'accepted') {
            // Already approved — just re-generate QR + link without modifying DB
            result = regenerateApproval(sentChallenge, currentUser);
        } else {
            result = await generateApprovalQR(sentChallenge, currentUser);
        }

        if (result.success && result.qrData) {
            approvalQRData = result.qrData;
            approvalLink = result.link ?? null;
            approvalDone = true;
        } else {
            approvalError = result.error || 'verification_failed';
        }
    }

    function closeApprovalModal() {
        isApprovalModalOpen = false;
        approvalQRData = null;
        approvalLink = null;
        approvalDone = false;
        approvalError = null;
        (document.getElementById('approval_modal') as HTMLDialogElement)?.close();
    }

    async function handleApprovalShareViaApp() {
        if (!approvalLink) return;
        const title = $_(I18N.proximity.verify_title);
        const text = $_(I18N.proximity.share_verification_text);

        if (await tryAndroidNativeShare(title, text, approvalLink)) {
            return;
        }

        if (navigator.share) {
            try {
                await navigator.share({ title, text, url: approvalLink });
                return;
            } catch (e: any) {
                if (e?.name === 'AbortError') return;
            }
        }

        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(approvalLink);
            alert($_(I18N.home.link_copied));
        } catch {
            // ignore
        }
    }

    /** Player B: scanned an approval QR → award rewards (show success modal) */
    async function handleApprovalScan(rawData: string) {
        if (!currentUser) return;
        const result = await processApprovalQR(rawData, currentUser);
        if (result.success) {
            verifySuccessData = {
                title: result.challengeTitle,
                approver: result.approverName,
                multiplier: result.multiplier,
                isStreakBonus: result.isStreakBonus,
            };
            (document.getElementById('verify_success_modal') as HTMLDialogElement)?.showModal();
        } else {
            const errKey = result.error ? 'store.' + result.error + '_error' : 'common.error';
            alert($_(errKey));
        }
    }

    function closeVerifySuccessModal() {
        verifySuccessData = null;
        (document.getElementById('verify_success_modal') as HTMLDialogElement)?.close();
        window.location.reload();
    }

    /** Properly close scanner modal and stop camera */
    function closeScannerModal() {
        isScannerOpen = false;
        (document.getElementById('scanner_modal') as HTMLDialogElement)?.close();
    }

    function closeSendModal() {
        isSendModalOpen = false;
        generatedShareLink = null;
        generatedChallengeId = null;
        isChallengeCommitted = false;
        selectedItemId = null;
        customMessage = '';
        selectedExpiryKey = 'none';
        generatedExpiresAt = null;
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

        const expiresAt = computeExpiresAt(selectedExpiryOption.hours);
        const draft = await createChallengeLink(currentUser, item, customMessage, expiresAt, selectedExpiryCost);
        if (draft) {
            generatedExpiresAt = expiresAt;
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

        const committed = await commitChallengeLink(currentUser, item, customMessage, generatedChallengeId, generatedExpiresAt, selectedExpiryCost);
        if (committed) {
            isChallengeCommitted = true;
        } else if (!canAffordSelectedExpiry) {
            alert($_(I18N.store.not_enough_coins));
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
                expiresAt: pendingClaimRequest.expiresAt ? new Date(pendingClaimRequest.expiresAt) : undefined,
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

    /** Player B: verification handled by scanning Player A's approval QR via the scanner */

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

<div class="space-y-6 relative pb-28">
    <div class="navbar bg-base-100/50 backdrop-blur-md rounded-2xl shadow-sm">
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
                <div class="bg-primary text-primary-content rounded-full w-10 h-10 flex items-center justify-center overflow-hidden">
                    {#if currentUser?.avatarImage}
                        <img src={currentUser.avatarImage} alt={currentUser.nickname || 'Profile'} class="w-full h-full object-cover" />
                    {:else}
                        <span class="text-lg font-bold">{(currentUser?.nickname || 'P').charAt(0).toUpperCase()}</span>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <!-- Stats/Welcome -->
    <div class="grid grid-cols-1 gap-4">
        <div class="card bg-base-100 shadow-xl border border-base-200">
            <div class="card-body">
                <h2 class="card-title">{$_(I18N.home.welcome, { values: { user: currentUser?.nickname || 'Player' } })}</h2>
                <p>{$_(I18N.home.ready_msg)}</p>
                <div class="mt-3">
                    <button class="btn btn-primary w-full" onclick={openSendModal}>{$_(I18N.home.send_challenge)}</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-1 gap-4">
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
                        {#if challenge.expiresAt}
                            <p class="text-[10px] text-warning mt-1">
                                ⏳ {$_(I18N.home.expires_at)} {new Date(challenge.expiresAt).toLocaleString()}
                            </p>
                        {/if}
                        {#if challenge.message}
                            <p class="text-xs text-base-content/60 mt-1 italic">"{challenge.message}"</p>
                        {/if}
                        <p class="text-[10px] text-base-content/50 mt-1">From: {challenge.fromPlayer || 'System'}</p>
                    </div>
                    <div class="flex-none flex flex-col gap-2">
                        <!-- Scan Verification Button (Player B opens scanner to scan Player A's approval QR) -->
                         <button 
                            class="btn btn-sm btn-info btn-circle text-white shadow-sm" 
                            onclick={(e) => { e.stopPropagation(); isScannerOpen = true; (document.getElementById('scanner_modal') as HTMLDialogElement)?.showModal(); }}
                            title={$_(I18N.proximity.scan_to_verify)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            {/each}
        </div>
    {/if}

    <!-- Sent Challenges (Player A sees pending + accepted challenges they sent) -->
    {#if sentChallenges.length > 0}
        <div class="divider text-base-content/50 font-medium">{$_(I18N.proximity.sent_challenges)}</div>

        <div class="space-y-3">
            <details class="collapse collapse-arrow bg-base-100 border border-base-200" open>
                <summary class="collapse-title font-semibold text-sm">
                    {$_(I18N.proximity.sent_challenges)} ({pendingSentChallenges.length})
                </summary>
                <div class="collapse-content space-y-3">
                    {#if pendingSentChallenges.length === 0}
                        <p class="text-xs text-base-content/50">No pending challenges.</p>
                    {:else}
                        {#each pendingSentChallenges as sc}
                            <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all group">
                                <div class="card-body p-4 flex-row items-center gap-4">
                                    <div class="flex-1">
                                        <div class="flex justify-between items-start">
                                            <h3 class="font-bold group-hover:text-secondary transition-colors">{$_(sc.title)}</h3>
                                        </div>
                                        <p class="text-xs text-base-content/80 mt-1">{$_(sc.description)}</p>
                                    </div>
                                    <div class="flex-none">
                                        <button
                                            class="btn btn-sm gap-1 shadow-sm btn-success"
                                            onclick={(e) => { e.stopPropagation(); startApproval(sc); }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                            </svg>
                                            {$_(I18N.proximity.approve_btn)}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </details>

            <details class="collapse collapse-arrow bg-base-100 border border-base-200">
                <summary class="collapse-title font-semibold text-sm">
                    {$_(I18N.proximity.approved_badge)} ({verifiedSentChallenges.length})
                </summary>
                <div class="collapse-content space-y-3">
                    {#if verifiedSentChallenges.length === 0}
                        <p class="text-xs text-base-content/50">No verified challenges yet.</p>
                    {:else}
                        {#each verifiedSentChallenges as sc}
                            <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all group">
                                <div class="card-body p-4 flex-row items-center gap-4">
                                    <div class="flex-1">
                                        <div class="flex justify-between items-start">
                                            <h3 class="font-bold group-hover:text-secondary transition-colors">{$_(sc.title)}</h3>
                                            <span class="badge badge-sm badge-success">{$_(I18N.proximity.approved_badge)}</span>
                                        </div>
                                        <p class="text-xs text-base-content/80 mt-1">{$_(sc.description)}</p>
                                    </div>
                                    <div class="flex-none">
                                        <button
                                            class="btn btn-sm gap-1 shadow-sm btn-outline btn-secondary"
                                            onclick={(e) => { e.stopPropagation(); startApproval(sc); }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5h11.25m0 0-3-3m3 3-3 3M19.5 16.5H8.25m0 0 3-3m-3 3 3 3" />
                                            </svg>
                                            {$_(I18N.proximity.reshare_btn)}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            </details>
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

                    <div>
                        <h4 class="text-sm font-semibold mb-2 opacity-70 flex items-center gap-2">
                             <span>⏳</span> {$_(I18N.home.expiry_title)}
                        </h4>
                        <select id="home-send-expiry" name="challengeExpiry" class="select select-bordered w-full" bind:value={selectedExpiryKey}>
                            {#each CHALLENGE_EXPIRY_OPTIONS as option}
                                <option value={option.key}>{$_(option.labelKey)} ({option.cost} 🪙)</option>
                            {/each}
                        </select>
                        <div class="label">
                            <span class="label-text-alt opacity-70">{$_(I18N.home.expiry_cost)}: {selectedExpiryCost} 🪙</span>
                        </div>
                    </div>

                    <!-- Step 2: Custom Message -->
                    <div>
                        <h4 class="text-sm font-semibold mb-2 opacity-70 flex items-center gap-2">
                             <span>✍️</span> {$_(I18N.home.custom_message)}
                        </h4>
                        <textarea 
                            id="home-send-message"
                            name="challengeMessage"
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
                        disabled={!selectedItemId || !canAffordSelectedExpiry}>
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

     <!-- APPROVAL: Player A — Show approval QR/link for Player B -->
    <dialog id="approval_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <form method="dialog">
                 <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick={closeApprovalModal}>✕</button>
            </form>

            {#if approvalError}
                <!-- Error state -->
                <div class="flex flex-col items-center justify-center py-8 gap-4">
                    <div class="text-5xl">❌</div>
                    <h3 class="font-bold text-lg text-error text-center">{$_('store.' + approvalError + '_error')}</h3>
                    <button class="btn btn-ghost w-full" onclick={closeApprovalModal}>
                        {$_(I18N.common.close)}
                    </button>
                </div>
            {:else if approvalDone && approvalQRData}
                <!-- QR view with direct share-via-app action -->
                <div class="flex flex-col items-center justify-center py-4 gap-3">
                    <div class="text-5xl">✅</div>
                    <h3 class="font-bold text-xl text-success text-center">{$_(I18N.proximity.approved_title)}</h3>

                    <p class="text-sm text-center font-semibold text-base-content/70">{$_(I18N.proximity.show_qr_instruction)}</p>

                    <!-- Approval QR code -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="p-4 bg-white rounded-xl shadow-lg cursor-pointer transition-transform hover:scale-105" 
                         onclick={() => { expandedQrData = approvalQRData; (document.getElementById('expanded_qr_dialog') as HTMLDialogElement)?.showModal(); }}>
                        <QrCode data={approvalQRData} size={220} />
                    </div>
                    <p class="text-xs text-center text-base-content/50">{$_(I18N.proximity.tap_to_expand)}</p>

                    <div class="divider my-0 text-xs text-base-content/50">{$_(I18N.home.or_separator)}</div>

                    <button class="btn btn-outline btn-sm w-full" onclick={handleApprovalShareViaApp}>
                        {$_(I18N.home.share_via_app)} 🔗
                    </button>

                    <button class="btn btn-primary w-full mt-1" onclick={closeApprovalModal}>
                        {$_(I18N.common.close)}
                    </button>
                </div>
            {:else}
                <!-- Loading state -->
                <div class="flex flex-col items-center justify-center py-12 gap-4">
                    <span class="loading loading-spinner loading-lg text-primary"></span>
                    <p class="text-sm text-base-content/70">{$_(I18N.proximity.approving)}</p>
                </div>
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
             <button onclick={closeApprovalModal}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>

    <!-- General QR Code Display Modal -->
    <dialog id="show_qr_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box flex flex-col items-center">
            <h3 class="font-bold text-lg text-center mb-4">{qrCodeTitle}</h3>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="p-4 bg-white rounded-xl shadow-lg cursor-pointer transition-transform hover:scale-105"
                 onclick={() => { if (qrCodeValue) { expandedQrData = qrCodeValue; (document.getElementById('expanded_qr_dialog') as HTMLDialogElement)?.showModal(); } }}>
                {#if isShowQrModalOpen && qrCodeValue}
                    <QrCode data={qrCodeValue} size={250} />
                {/if}
            </div>
            <p class="text-xs text-center text-base-content/50 mt-2">{$_(I18N.proximity.tap_to_expand)}</p>
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
    <dialog id="scanner_modal" class="modal modal-bottom sm:modal-middle" onclose={() => { isScannerOpen = false; }}>
        <div class="modal-box">
            <h3 class="font-bold text-lg text-center mb-4">Scan QR Code</h3>
            {#if isScannerOpen}
                <QrScanner 
                    onScan={handleScan}
                    onCancel={closeScannerModal} 
                />
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeScannerModal}>close</button>
        </form>
    </dialog>

    <!-- Verification Success Modal (Player B) -->
    <dialog id="verify_success_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            {#if verifySuccessData}
                <div class="flex flex-col items-center justify-center py-6 gap-4">
                    <div class="text-7xl animate-bounce">🎉</div>
                    <h3 class="font-bold text-2xl text-success text-center">{$_(I18N.proximity.verified_title)}</h3>
                    <p class="text-center text-base-content/70">
                        {$_(I18N.proximity.scan_success, { values: { user: verifySuccessData.approver || '?' } })}
                    </p>
                    {#if verifySuccessData.title}
                        <div class="badge badge-lg badge-primary gap-2 py-4 font-bold">
                            {$_(verifySuccessData.title)}
                        </div>
                    {/if}
                    {#if verifySuccessData.isStreakBonus && verifySuccessData.multiplier && verifySuccessData.multiplier > 1}
                        <div class="badge badge-secondary badge-lg gap-2 py-4">
                            🔥 {$_(I18N.home.streak_bonus_applied, { values: { multiplier: verifySuccessData.multiplier } })}
                        </div>
                    {/if}
                    <button class="btn btn-primary w-full mt-2" onclick={closeVerifySuccessModal}>
                        {$_(I18N.common.close)}
                    </button>
                </div>
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeVerifySuccessModal}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>

    <dialog id="profile_card_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            {#if receivedProfileCard}
                <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 via-secondary/20 to-accent/30 p-5 card-glow">
                    <div class="absolute inset-0 bg-base-100/20 backdrop-blur-[1px]"></div>
                    <div class="relative space-y-3">
                        <div class="flex items-center gap-3">
                            <div class="avatar placeholder">
                                <div class="bg-primary text-primary-content rounded-full w-16 h-16 ring ring-primary/40 ring-offset-base-100 ring-offset-2 float-avatar flex items-center justify-center overflow-hidden">
                                    {#if receivedProfileCard.avatarImage}
                                        <img src={receivedProfileCard.avatarImage} alt={receivedProfileCard.nickname} class="w-full h-full object-cover" />
                                    {:else}
                                        <span class="text-2xl font-bold leading-none">{receivedProfileCard.avatarChar}</span>
                                    {/if}
                                </div>
                            </div>
                            <div>
                                <p class="text-xl font-extrabold tracking-wide">{receivedProfileCard.nickname}</p>
                                <p class="text-xs uppercase tracking-widest opacity-80">{receivedProfileCard.title}</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 gap-2 text-xs">
                            <div class="badge badge-ghost justify-start px-3 py-3">🏆 {receivedProfileCard.score}</div>
                        </div>

                        <div>
                            <p class="text-xs font-semibold mb-2 opacity-80">{$_(I18N.profile.card_badges)}</p>
                            {#if receivedProfileCard.badges?.length > 0}
                                <div class="flex flex-wrap gap-2">
                                    {#each receivedProfileCard.badges as badge, idx}
                                        <span class="badge badge-primary/10 border border-primary/30 text-xs shimmer" style={`animation-delay:${idx * 120}ms`}>
                                            {badge.icon} {$_(badge.name)}
                                        </span>
                                    {/each}
                                </div>
                            {:else}
                                <p class="text-xs opacity-60">—</p>
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn" onclick={() => receivedProfileCard = null}>{$_(I18N.common.close)}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => receivedProfileCard = null}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>

    <!-- Fullscreen Expanded QR Dialog (uses <dialog> for proper top-layer rendering) -->
    <dialog id="expanded_qr_dialog" class="modal">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="modal-box bg-transparent shadow-none max-w-none w-auto flex flex-col items-center justify-center gap-6 qr-overlay"
             onclick={() => { expandedQrData = null; (document.getElementById('expanded_qr_dialog') as HTMLDialogElement)?.close(); }}>
            <!-- QR card -->
            <div class="relative bg-white rounded-3xl shadow-2xl p-8 qr-card">
                <div class="absolute -inset-1 rounded-3xl bg-gradient-to-br from-primary/30 via-secondary/20 to-accent/30 blur-md qr-glow"></div>
                <div class="relative bg-white rounded-2xl p-4">
                    {#if expandedQrData}
                        <QrCode data={expandedQrData} size={Math.min(window.innerWidth - 80, window.innerHeight - 200, 380)} />
                    {/if}
                </div>
            </div>
            <p class="text-white/80 text-sm font-medium animate-pulse">{$_(I18N.proximity.tap_to_close)}</p>
        </div>
        <form method="dialog" class="modal-backdrop bg-black/60 backdrop-blur-sm qr-backdrop">
            <button onclick={() => expandedQrData = null}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>
</div>

<style>
    .qr-overlay {
        animation: overlay-in 0.3s ease-out;
    }
    .qr-backdrop {
        animation: fade-in 0.3s ease-out;
    }
    .qr-card {
        animation: card-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .qr-glow {
        animation: glow-pulse 2.5s ease-in-out infinite;
    }

    @keyframes overlay-in {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes card-pop {
        0% { opacity: 0; transform: scale(0.7) translateY(30px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes glow-pulse {
        0%, 100% { opacity: 0.4; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.03); }
    }

    .card-glow {
        animation: pulse-glow 3s ease-in-out infinite;
    }

    .float-avatar {
        animation: floaty 2.8s ease-in-out infinite;
    }

    .shimmer {
        animation: shimmer-in 0.8s ease-out both;
    }

    @keyframes pulse-glow {
        0%, 100% { filter: saturate(1); }
        50% { filter: saturate(1.2); }
    }

    @keyframes floaty {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-3px); }
    }

    @keyframes shimmer-in {
        from { opacity: 0; transform: translateY(6px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
</style>
