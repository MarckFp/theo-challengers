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
                    <th>Badges</th>
                </tr>
                </thead>
                <tbody>
                <!-- row 1 -->
                {#each [1, 2, 3, 4, 5] as i}
                <tr class="hover">
                    <th>
                        {#if i === 1}
                            <span class="text-2xl">🥇</span>
                        {:else if i === 2}
                            <span class="text-2xl">🥈</span>
                        {:else if i === 3}
                            <span class="text-2xl">🥉</span>
                        {:else}
                            <span class="font-mono text-lg text-base-content/50">#{i}</span>
                        {/if}
                    </th>
                    <td>
                        <div class="flex items-center gap-3">
                            <div class="avatar placeholder">
                                <div class="bg-neutral-focus text-neutral-content rounded-full w-8 h-8 ring ring-primary ring-offset-base-100 ring-offset-1 flex items-center justify-center">
                                    <span class="text-xs">P{i}</span>
                                </div>
                            </div>
                            <div>
                                <div class="font-bold">Player {i}</div>
                                <div class="text-sm opacity-50">Global</div>
                            </div>
                        </div>
                    </td>
                    <td class="font-mono font-bold text-primary">
                        {1000 - (i * 50)}
                    </td>
                    <td>
                        <div class="flex gap-1">
                            <div class="badge badge-secondary badge-outline badge-xs">🔥</div>
                        </div>
                    </td>
                </tr>
                {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>
