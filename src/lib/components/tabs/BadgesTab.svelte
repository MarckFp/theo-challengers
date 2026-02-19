<script lang="ts">
    import { db } from '$lib/db';
    import { useUser } from '$lib/stores/user.svelte';
    import { BADGES_CATALOG } from '$lib/data/badges';
    import { _ } from 'svelte-i18n';
    import { I18N } from '$lib/i18n-keys';

    const userStore = useUser();
    let player = $derived(userStore.value);

    // Filter badges into 'Owned' and 'Available'
    let ownedBadges = $derived(player?.badges || []);
    let catalog = BADGES_CATALOG;

    // View State
    let viewingBadge = $state<any>(null);
    let isViewModalOpen = $state(false);

    let shakingBadge = $state<string | null>(null);

    function triggerShake(id: string) {
        shakingBadge = id;
        setTimeout(() => shakingBadge = null, 500);
    }
    
    async function buyBadge(badge: any) {
        if (!player || !player.id) return;
        
        const cost = badge.cost;
        const currentScore = player.score || 0;

        if (currentScore < cost) {
            triggerShake(badge.id); // Feedback for failure
            return;
        }

        // Check if already owned (double safety, though UI disables button)
        if (ownedBadges.includes(badge.id)) {
            return; 
        }

        try {
             // 1. DEDUCT POINTS & ADD BADGE
             const newScore = currentScore - cost;
             if (newScore < 0) return;
             
             const currentBadges = player.badges || [];
             await db.player.update(player.id, {
                score: newScore,
                badges: [...currentBadges, badge.id]
             });
             
             triggerShake(badge.id); // Success feedback
             isViewModalOpen = false;
        } catch (e) { console.error(e); }
    }
</script>

<div class="space-y-4">
    <!-- Intro Card (Optional but maybe nice context) -->
    <div class="card bg-base-100 shadow-sm border border-base-200">
        <div class="card-body p-4 text-center text-sm text-base-content/60">
             {$_(I18N.badges.intro)}
        </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
        {#each catalog as badge}
            {@const isOwned = ownedBadges.includes(badge.id)}
            <div class="indicator w-full" class:shake={shakingBadge === badge.id}>
                {#if isOwned}
                    <span class="indicator-item badge badge-success badge-sm top-2 right-2">Owned</span>
                {/if}
                <button 
                    class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer w-full border border-base-300 relative aspect-square"
                    onclick={() => {
                        viewingBadge = badge;
                        isViewModalOpen = true;
                    }}
                >
                    <div class="card-body p-2 flex flex-col items-center justify-center text-center gap-2">
                        <div class="text-6xl transition-transform hover:scale-110 duration-200 drop-shadow-sm">
                            {badge.icon}
                        </div>
                        <div class="w-full">
                            <h4 class="font-bold text-sm line-clamp-1 w-full truncate leading-tight">{$_(badge.name)}</h4>
                            {#if !isOwned}
                                <div class="badge badge-lg badge-secondary mt-2 font-mono font-bold shadow-sm">{badge.cost} 🏆</div>
                            {/if}
                        </div>
                    </div>
                </button>
            </div>
        {/each}
    </div>

    <!-- Badge Details & Buy Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" class:modal-open={isViewModalOpen}>
        <div class="modal-box">
             {#if viewingBadge}
                {@const isOwned = ownedBadges.includes(viewingBadge.id)}
                
                <div class="flex justify-center mb-4 mt-8 text-8xl animate-bounce">
                    {viewingBadge.icon}
                </div>
                <h3 class="font-bold text-2xl text-center">{$_(viewingBadge.name)}</h3>
                <p class="py-4 text-center text-base opacity-80 leading-relaxed">{$_(viewingBadge.description)}</p>
                
                <div class="flex flex-wrap justify-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-bold uppercase tracking-wide sm:tracking-widest opacity-60 mb-6">
                    <div class="badge badge-md sm:badge-lg badge-outline badge-secondary gap-1 whitespace-normal text-center h-auto py-1">
                        {$_(I18N.store.cost)}: {viewingBadge.cost} 🏆
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <button class="btn btn-outline" onclick={() => isViewModalOpen = false}>{$_(I18N.common.cancel)}</button>
                    <button 
                        class="btn btn-secondary" 
                        disabled={isOwned || (player?.score || 0) < viewingBadge.cost}
                        onclick={() => buyBadge(viewingBadge)}
                    >
                         {#if isOwned}
                            {$_(I18N.badges.owned)}
                         {:else if (player?.score || 0) < viewingBadge.cost}
                            {$_(I18N.badges.need, { values: { cost: viewingBadge.cost - (player?.score || 0) } })}
                         {:else}
                            {$_(I18N.store.buy)}
                         {/if}
                    </button>
                </div>
            {/if}
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isViewModalOpen = false}>close</button>
        </form>
    </dialog>
</div>
