<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Leaderboard } from '$lib/models/leaderboard';
    import { _ } from 'svelte-i18n';
    import { I18N } from '$lib/i18n-keys';

    let leaderboard = $state<Leaderboard[]>([]);

    $effect(() => {
        const sub = liveQuery(() => 
            db.leaderboard.orderBy('score').reverse().limit(10).toArray()
        ).subscribe(result => {
             leaderboard = result;
        });
        return () => sub.unsubscribe();
    });
</script>

<div class="space-y-6 animate-in fade-in zoom-in duration-300">
    <div class="flex justify-between items-center px-1">
        <h2 class="text-2xl font-bold">{$_(I18N.leaderboard.title)}</h2>
    </div>

    <div class="card bg-base-100 shadow-sm border border-base-200">
        <div class="card-body p-0">
            <table class="table w-full">
            <thead>
                <tr>
                    <th class="w-16 text-center">{$_(I18N.leaderboard.rank)}</th>
                    <th>{$_(I18N.leaderboard.player)}</th>
                    <th class="text-right">{$_(I18N.leaderboard.score)}</th>
                </tr>
            </thead>
             <tbody>
                {#if leaderboard.length === 0}
                    <tr>
                        <td colspan="3" class="text-center py-8 text-base-content/50 italic">
                            {$_(I18N.history.empty)}
                        </td>
                    </tr>
                {:else}
                    {#each leaderboard as entry, i}
                        <tr class="hover">
                            <td class="text-center font-bold text-lg text-primary">{i + 1}</td>
                            <td>
                                <div class="font-bold">{entry.nickname}</div>
                                <div class="text-[10px] opacity-50">{$_(I18N.leaderboard.updated)}: {new Date(entry.updatedAt).toLocaleDateString()}</div>
                            </td>
                            <td class="text-right font-mono font-bold text-success">{entry.score}</td>
                        </tr>
                    {/each}
                 {/if}
            </tbody>
        </table>
    </div>
</div>
</div>
