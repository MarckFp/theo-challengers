<script lang="ts">
    import { db } from '$lib/db';
    import type { Inventory } from '$lib/models/inventory';
    import { _ } from 'svelte-i18n';
    import { useUser } from '$lib/stores/user.svelte';
    import { useInventory } from '$lib/stores/inventory.svelte';
    import { I18N } from '$lib/i18n-keys';
    import { openUrl } from '@tauri-apps/plugin-opener';
    import QrCode from '$lib/components/QrCode.svelte';
    import ChallengeShareActions from '$lib/components/ChallengeShareActions.svelte';

    import { createChallengeLink, commitChallengeLink } from '$lib/services/challenge';

    const userStore = useUser();
    const inventoryStore = useInventory();
    
    let player = $derived(userStore.value);
    let inventoryItems = $derived(inventoryStore.value);

    let isDeleteModalOpen = $state(false);
    let itemToDelete = $state<Inventory | null>(null);

    // Challenge Modal State
    let isChallengeModalOpen = $state(false);
    let generatedShareLink = $state<string | null>(null);
    let generatedChallengeId = $state<string | null>(null);
    let isChallengeCommitted = $state(false);
    let challengeItem = $state<Inventory | null>(null);
    let customMessage = $state('');

    // QR Modal State
    let isShowQrModalOpen = $state(false);
    let qrCodeTitle = $state('');
    let qrCodeValue = $state('');

    // View Modal State
    let isViewModalOpen = $state(false);
    let viewingItem = $state<Inventory | null>(null);

    function openViewModal(item: Inventory) {
        viewingItem = item;
        isViewModalOpen = true;
    }

    // Subscribe to inventory items removed as it is handled by inventoryStore

    function initiateDelete(item: Inventory) {
        itemToDelete = item;
        isDeleteModalOpen = true;
    }

    async function confirmDelete() {
        if (!itemToDelete || !itemToDelete.id) return;
        
        try {
            await db.inventory.delete(itemToDelete.id);
            isDeleteModalOpen = false;
            itemToDelete = null;
        } catch (e) {
            console.error('Failed to remove item', e);
        }
    }

    function showQr(title: string, value: string) {
        qrCodeTitle = title;
        qrCodeValue = value;
        isShowQrModalOpen = true;
    }

    function openChallengeModal(item: Inventory) {
        challengeItem = item;
        customMessage = '';
        generatedShareLink = null;
        isChallengeModalOpen = true;
        isViewModalOpen = false;
    }

    function closeChallengeModal() {
        isChallengeModalOpen = false;
        generatedShareLink = null;
        generatedChallengeId = null;
        isChallengeCommitted = false;
        customMessage = '';
        challengeItem = null;
    }

    function closeShareChallengeFlow() {
        isShowQrModalOpen = false;
        closeChallengeModal();
    }

    async function generateChallengeLink() {
        if (!challengeItem || !player) return;
        const draft = await createChallengeLink(player, challengeItem, customMessage);
        if (draft) {
            generatedShareLink = draft.link;
            generatedChallengeId = draft.id;
            isChallengeCommitted = false;
        }
    }

    async function commitChallengeIfNeeded() {
        if (isChallengeCommitted) return true;
        if (!player || !challengeItem || !generatedChallengeId) return false;

        const committed = await commitChallengeLink(player, challengeItem, customMessage, generatedChallengeId);
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
        if (!generatedChallengeId || !challengeItem || !player) return;
        const shareLink = resolveGeneratedShareLink();
        if (!shareLink) return;

        const shareTitle = $_(I18N.home.share_challenge_title);
        const shareText = $_(I18N.home.share_challenge_text, { values: { item: challengeItem.title ? $_(challengeItem.title) : '' } });

        if (await tryAndroidNativeShare(shareTitle, shareText, shareLink)) {
            const committed = await commitChallengeIfNeeded();
            if (committed) {
                closeShareChallengeFlow();
            }
            return;
        }

        if (!navigator.share) {
            await fallbackShareViaClipboard(shareLink);
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
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <div>
            <h2 class="text-2xl font-bold">{$_(I18N.inventory.title)}</h2>
            <p class="text-xs text-base-content/60">
                {$_(I18N.inventory.count, { values: { count: inventoryItems.length } })}
            </p>
        </div>
        {#if player}
        <div class="flex gap-2">
           <div class="badge badge-secondary badge-lg gap-2 font-bold shadow-sm">
                <span>🏆</span>
                {player.score || 0}
            </div>
        </div>
        {/if}
    </div>

    {#if inventoryItems.length === 0}
         <div class="card bg-base-100 shadow-sm border border-base-200 py-12 text-center">
            <div class="card-body items-center justify-center text-base-content/70">
                <span class="text-6xl mb-4">🎒</span>
                <h3 class="font-bold text-lg">{$_(I18N.inventory.empty_title)}</h3>
                <p>{$_(I18N.inventory.empty_desc)}</p>
            </div>
         </div>
    {:else}
        <div class="grid gap-4">
            {#each inventoryItems as item}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="card card-side bg-base-100 shadow-sm border border-base-200 p-2 cursor-pointer transition-all hover:bg-base-200/50"
                     onclick={() => openViewModal(item)}>
                    <figure class="w-20 bg-base-200 rounded-xl flex items-center justify-center text-3xl shrink-0">
                        {item.icon || '📜'}
                    </figure>
                    <div class="card-body p-3 w-full">
                        <div class="flex justify-between items-start w-full gap-2">
                            <h3 class="card-title text-base">{$_(item.title)}</h3>
                             <div class="badge badge-sm badge-ghost shrink-0">+{item.points} 🏆</div>
                        </div>
                        <p class="text-xs text-base-content/80">{$_(item.description)}</p>
                        <div class="card-actions justify-end mt-2">
                            <button class="btn btn-xs btn-outline btn-error" onclick={(e) => { e.stopPropagation(); initiateDelete(item); }}>
                                {$_(I18N.inventory.remove_title)}
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
    
    {#if inventoryItems.length < 3}
         <div class="alert alert-info py-2 text-sm shadow-sm bg-base-200/50 border-base-300 text-base-content">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>{$_(I18N.inventory.slots_available, { values: { count: 3 - inventoryItems.length } })}</span>
        </div>
    {/if}

    <!-- Delete Confirmation Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isDeleteModalOpen}>
        <div class="modal-box">
             <h3 class="font-bold text-lg text-error">{$_(I18N.inventory.remove_confirm_title)}</h3>
             <p class="py-4">{$_(I18N.inventory.remove_confirm_desc)}</p>
            <div class="modal-action">
                <button class="btn" onclick={() => isDeleteModalOpen = false}>{$_(I18N.common.cancel)}</button>
                <button class="btn btn-error" onclick={confirmDelete}>{$_(I18N.inventory.confirm_remove)}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isDeleteModalOpen = false}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>
    <!-- View Item Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isViewModalOpen}>
        <div class="modal-box">
             {#if viewingItem}
                <div class="flex flex-col items-center gap-4 py-4">
                    <div class="text-8xl drop-shadow-md pb-4">{viewingItem.icon || '📜'}</div>
                    <h3 class="font-bold text-2xl text-center">{$_(viewingItem.title)}</h3>
                    <div class="badge badge-lg badge-ghost">+{viewingItem.points} 🏆</div>
                    <p class="text-center text-lg text-base-content/80">{$_(viewingItem.description)}</p>
                    
                    <div class="divider my-0"></div>

                    <div class="flex w-full gap-2">
                        <button 
                            class="btn btn-primary flex-1 shadow-lg shadow-primary/20"
                            onclick={() => openChallengeModal(viewingItem!)}
                        >
                             🚀 {$_(I18N.inventory.challenge_btn)}
                        </button>
                    </div>

                    <div class="flex w-full gap-2">
                         <button class="btn btn-outline btn-error flex-1" onclick={() => { isViewModalOpen = false; initiateDelete(viewingItem!); }}>
                                {$_(I18N.inventory.remove_title)}
                        </button>
                        <button class="btn btn-ghost flex-1" onclick={() => isViewModalOpen = false}>
                            {$_(I18N.common.cancel)}
                        </button>
                    </div>
                </div>
             {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isViewModalOpen = false}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>
    
    <!-- Challenge Link Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isChallengeModalOpen}>
        <div class="modal-box">
            <h3 class="font-bold text-lg text-center">
                {#if generatedShareLink}
                    {$_(I18N.home.challenge_sent_title)}
                {:else}
                    {$_(I18N.home.select_challenge_title)}
                {/if}
            </h3>

            {#if !generatedShareLink}
                <div class="py-4 space-y-4">
                    <div>
                        <h4 class="text-sm font-semibold mb-2 opacity-70 flex items-center gap-2">
                            <span>🎯</span> {$_(I18N.home.select_challenge_title)}
                        </h4>

                        {#if challengeItem}
                            <div class="w-full text-left p-3 rounded-xl border bg-primary/10 border-primary shadow-sm flex items-center gap-3 relative overflow-hidden">
                                <div class="text-2xl bg-base-100 rounded-lg w-10 h-10 flex items-center justify-center shadow-sm">
                                    {challengeItem.icon || '📜'}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm truncate">{$_(challengeItem.title)}</div>
                                    <div class="text-xs opacity-60 truncate">{$_(challengeItem.description)}</div>
                                </div>
                                <div class="badge badge-sm badge-primary">
                                    {challengeItem.points} pts
                                </div>
                                <div class="absolute inset-0 border-2 border-primary rounded-xl pointer-events-none"></div>
                            </div>
                        {/if}
                    </div>

                    <div>
                        <h4 class="text-sm font-semibold mb-2 opacity-70 flex items-center gap-2">
                             <span>✍️</span> {$_(I18N.home.custom_message)}
                        </h4>
                        <textarea
                            class="textarea textarea-bordered h-24 w-full focus:textarea-primary transition-all"
                            placeholder={$_(I18N.home.message_placeholder)}
                            bind:value={customMessage}
                        ></textarea>
                        <div class="label">
                            <span class="label-text-alt opacity-50">{$_(I18N.home.personal_touch_phrase)}</span>
                        </div>
                    </div>
                </div>

                <div class="modal-action">
                    <button class="btn btn-primary w-full gap-2 shadow-lg shadow-primary/20" onclick={generateChallengeLink}>
                        <span>🚀</span> {$_(I18N.home.create_link)}
                    </button>
                </div>
            {:else}
                <ChallengeShareActions
                    on:showQr={handleShowQrFromShareActions}
                    on:shareViaApp={handleShareViaAppFromShareActions}
                    on:cancel={closeChallengeModal}
                />
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeChallengeModal}>{$_(I18N.common.close)}</button>
        </form>
    </dialog>

    <!-- General QR Code Display Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isShowQrModalOpen}>
        <div class="modal-box flex flex-col items-center">
            <h3 class="font-bold text-lg text-center mb-4">{qrCodeTitle}</h3>
            <div class="p-4 bg-white rounded-xl shadow-lg">
                {#if isShowQrModalOpen && qrCodeValue}
                    <QrCode data={qrCodeValue} size={250} />
                {/if}
            </div>
            <div class="modal-action">
                <button class="btn" onclick={closeShareChallengeFlow}>{$_(I18N.common.cancel)}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={closeShareChallengeFlow}>{$_(I18N.common.cancel)}</button>
        </form>
    </dialog>
</div>
