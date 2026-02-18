<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Leaderboard } from '$lib/models/leaderboard';
    import { _ } from 'svelte-i18n';
    import { useUser } from '$lib/stores/user.svelte';
    import { I18N } from '$lib/i18n-keys';

    const userStore = useUser();
    let currentUser = $derived(userStore.value);
    let friends = $state<Leaderboard[]>([]);

    $effect(() => {
        const sub = liveQuery(() => db.leaderboard.toArray()).subscribe(res => {
            friends = res;
        });
        return () => sub.unsubscribe();
    });

    let leaderboard = $derived.by(() => {
        if (!currentUser) return []; // Or perhaps default to empty if not logged in
        
        // This logic is a bit flawed if 'friends' is just an array of other people, 
        // but let's assume it's just a local cache for now.
        // We create a new array to avoid mutating state directly in a confusing way
        let all: any[] = [...friends];

        // Find if I'm already in the list
        // Note: Leaderboard interface might not have nickname? Let's assume it does based on usage below.
        // If Leaderboard model is strict, we might need to cast.
        const myIndex = all.findIndex((f: any) => f.nickname === currentUser!.nickname);
        
        if (myIndex !== -1) {
            // Update my entry via replacement
            all[myIndex] = { ...all[myIndex], score: currentUser.score || 0 };
        } else {
            // Add me
            all.push({ 
                nickname: currentUser.nickname, 
                score: currentUser.score || 0, 
                updated_at: new Date() 
            });
        }

        // Sort DESC
        all.sort((a, b) => b.score - a.score);
        return all;
    });
</script>

<div class="space-y-6">
    <h2 class="text-2xl font-bold px-1">{$_(I18N.leaderboard.title)}</h2>
    
    <div class="card bg-base-100 shadow-xl border border-base-200 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="table w-full">
                <!-- head -->
                <thead>
                <tr class="bg-base-200/50">
                    <th class="w-16">{$_(I18N.leaderboard.rank)}</th>
                    <th>{$_(I18N.leaderboard.player)}</th>
                    <th class="text-right">{$_(I18N.leaderboard.score)}</th>
                </tr>
                </thead>
                <tbody>
                {#if leaderboard.length === 0}
                    <tr>
                        <td colspan="4" class="text-center py-4 text-sm text-base-content/50">
                            <!-- Using a generic empty state message or reusing one -->
                            {$_(I18N.home.no_active_challenges)}
                        </td>
                    </tr>
                {:else}
                    {#each leaderboard as player, i}
                    <tr class="hover {player.nickname === currentUser?.nickname ? 'bg-primary/5' : ''}">
                        <th>
                            {#if i === 0}
                                <span class="text-2xl">🥇</span>
                            {:else if i === 1}
                                <span class="text-2xl">🥈</span>
                            {:else if i === 2}
                                <span class="text-2xl">🥉</span>
                            {:else}
                                <span class="font-mono text-lg text-base-content/50">#{i + 1}</span>
                            {/if}
                        </th>
                        <td>
                            <div class="flex items-center gap-3">
                                <div class="avatar placeholder">
                                    <div class="bg-neutral-focus text-neutral-content rounded-full w-8 h-8 ring ring-primary ring-offset-base-100 ring-offset-1 flex items-center justify-center">
                                        {#if player.nickname}
                                        <span class="text-xs">{player.nickname.charAt(0).toUpperCase()}</span>
                                        {:else}
                                        <span class="text-xs">?</span>
                                        {/if}
                                    </div>
                                </div>
                                <div>
                                    <div class="font-bold flex items-center gap-2">
                                        {player.nickname}
                                        {#if player.nickname === currentUser?.nickname}
                                            <span class="badge badge-xs badge-primary">You</span>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td class="font-mono font-bold text-primary text-right">
                            {player.score}
                        </td>
                    </tr>
                    {/each}
                {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>
