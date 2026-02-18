<script lang="ts">
    import { db } from '$lib/db';
    import { useUser } from '$lib/stores/user.svelte';
    import { liveQuery } from 'dexie';
    import { _ } from 'svelte-i18n';
    import { I18N } from '$lib/i18n-keys';

    const userStore = useUser();
    let player = $derived(userStore.value);

    let history = $state<any[]>([]);
    let isOpen = $state(false);

    $effect(() => {
        if (!player?.id) return;
        const sub = liveQuery(async () => {
             const items = await db.challengue
                .where('player_id').equals(player.id!)
                .filter(c => c.completed_at !== undefined && c.completed_at !== null)
                .reverse()
                .limit(20)
                .toArray();
            return items;
        }).subscribe(res => {
            history = res;
        });
        return () => sub.unsubscribe();
    });

    function toggle() {
        isOpen = !isOpen;
    }

    function formatDate(date: any) {
        if (!date) return '';
        return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
</script>

<div class="card bg-base-100 shadow-sm border border-base-200 overflow-hidden">
    <button 
        class="card-body p-4 flex flex-row justify-between items-center w-full cursor-pointer hover:bg-base-200/50 transition-colors"
        onclick={toggle}
    >
        <div class="flex items-center gap-3">
            <span class="text-xl">📜</span>
            <h3 class="font-bold">{$_(I18N.history.title)}</h3>
        </div>
        <div class="flex items-center gap-2 text-base-content/50">
            <span class="text-xs">{history.length} events</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
        </div>
    </button>
    
    {#if isOpen}
        <div class="divider my-0"></div>
        <div class="bg-base-200/30 max-h-80 overflow-y-auto">
             {#if history.length === 0}
                <div class="p-8 text-center text-sm text-base-content/50 italic">
                    {$_(I18N.history.empty)}
                </div>
             {:else}
                <table class="table table-xs md:table-sm w-full">
                    <thead>
                        <tr>
                             <th>{$_(I18N.history.challenge)}</th>
                             <th>{$_(I18N.history.from)}</th>
                             <th class="text-right">{$_(I18N.history.pts)}</th>
                             <th class="text-right">{$_(I18N.history.date)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each history as item}
                            <tr class="hover">
                                <td>
                                    <div class="font-bold truncate max-w-[120px]" title={item.title}>{$_(item.title)}</div>
                                </td>
                                <td>
                                    <div class="badge badge-ghost badge-sm">{item.from_player || 'Unknown'}</div>
                                </td>
                                <td class="text-right text-success font-bold">+{item.points}</td>
                                <td class="text-right opacity-70 text-[10px]">{formatDate(item.completed_at)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
             {/if}
        </div>
    {/if}
</div>
