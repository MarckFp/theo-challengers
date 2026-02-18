<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import type { Leaderboard } from '$lib/models/leaderboard';

    let leaderboard = $state<Leaderboard[]>([]);
    let currentUser = $state<{nickname: string, score: number} | null>(null);

    $effect(() => {
        const sub1 = liveQuery(async () => {
            const myPlayer = await db.player.toArray();
            if (myPlayer.length > 0) {
                currentUser = { nickname: myPlayer[0].nickname, score: myPlayer[0].score || 0 };
            }

            const friends = await db.leaderboard.toArray();
            
            // Combine me + friends
            let all = [...friends];
            if (currentUser) {
                // Check if I am already in friends list (shouldn't be, but safeguard)
                const exists = all.find(f => f.nickname === currentUser!.nickname);
                if (!exists) {
                    all.push({ nickname: currentUser.nickname, score: currentUser.score, updated_at: new Date() });
                } else {
                    // Update my entry in list with latest score
                    exists.score = currentUser.score;
                }
            }

            // Sort DESC
            all.sort((a, b) => b.score - a.score);
            return all;
        }).subscribe(res => {
            leaderboard = res;
        });

        return () => sub1.unsubscribe();
    });
</script>

<div class="space-y-6">
    <h2 class="text-2xl font-bold px-1">Leaderboard</h2>
    
    <div class="card bg-base-100 shadow-xl border border-base-200 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="table w-full">
                <!-- head -->
                <thead>
                <tr class="bg-base-200/50">
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Points</th>
                </tr>
                </thead>
                <tbody>
                {#if leaderboard.length === 0}
                    <tr>
                        <td colspan="4" class="text-center py-4 text-sm text-base-content/50">
                            No data yet. Send or Accept challenges to see your friends!
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
                                        <span class="text-xs">{player.nickname.charAt(0).toUpperCase()}</span>
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
                        <td class="font-mono font-bold text-primary">
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
