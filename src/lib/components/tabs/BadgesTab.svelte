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

    async function buyBadge(badgeId: string, cost: number) {
        if (!player || !player.id) return;
        if ((player.score || 0) < cost) {
            alert($_(I18N.store.not_enough_points_error));
            return;
        }

        if (confirm($_(I18N.badges.confirm_buy, { values: { cost } }))) {
            const currentBadges = player.badges || [];
            await db.player.update(player.id, {
                score: player.score - cost,
                badges: [...currentBadges, badgeId]
            });
            alert($_(I18N.store.purchased));
        }
    }
</script>

<div class="space-y-6">
    <div class="navbar bg-base-100/50 backdrop-blur-md rounded-2xl shadow-sm sticky top-2 z-10 transition-all">
        <div class="flex-1">
            <h2 class="text-xl font-bold tracking-tight px-2">{$_(I18N.badges.title)}</h2>
        </div>
        <div class="flex-none">
             <div class="badge badge-lg badge-secondary font-bold gap-1">
                {player?.score || 0} 🏆
            </div>
        </div>
    </div>

    <!-- Intro Card -->
    <div class="card bg-base-100 shadow-sm border border-base-200">
        <div class="card-body p-4">
             <p class="text-sm text-base-content/80">{$_(I18N.badges.intro)}</p>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each catalog as badge}
            {@const isOwned = ownedBadges.includes(badge.id)}
            <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all group {isOwned ? 'border-primary/50' : ''}">
                <div class="card-body p-4 flex flex-row items-center gap-4">
                    <div class="text-4xl group-hover:scale-110 transition-transform duration-300">
                        {badge.icon}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold truncate {$_(I18N.badges[badge.id])?.length > 15 ? 'text-sm' : ''}">
                           {$_(badge.name)}
                        </h3>
                        <p class="text-xs text-base-content/60 line-clamp-2" title={$_(badge.description)}>{$_(badge.description)}</p>
                    </div>
                    <div class="flex-none">
                        {#if isOwned}
                            <div class="badge badge-success badge-sm">{$_(I18N.badges.owned)}</div>
                        {:else}
                            <button 
                                class="btn btn-sm btn-outline btn-secondary" 
                                onclick={() => buyBadge(badge.id, badge.cost)}
                                disabled={(player?.score || 0) < badge.cost}
                            >
                                {badge.cost} 🏆
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>
