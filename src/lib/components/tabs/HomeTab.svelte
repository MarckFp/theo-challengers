<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';

    let players = $state<{nickname: string}[]>([]); 

    $effect(() => {
        const subscription = liveQuery(() => db.player.toArray()).subscribe(result => {
            players = result;
        });
        return () => subscription.unsubscribe();
    });
</script>

<div class="space-y-6">
    <div class="navbar bg-base-100/50 backdrop-blur-md rounded-2xl shadow-sm sticky top-0 z-10">
        <div class="flex-1">
            <a class="btn btn-ghost text-xl font-bold tracking-tight">
                Theo <span class="text-primary">Challengers</span>
            </a>
        </div>
        <div class="flex-none">
            <div class="avatar placeholder">
                <div class="bg-primary text-primary-content rounded-full w-10 flex items-center justify-center">
                    <span class="text-lg font-bold">{(players[0]?.nickname || 'P').charAt(0).toUpperCase()}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Stats/Welcome -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card bg-base-100 shadow-xl border border-base-200">
            <div class="card-body">
                <h2 class="card-title">Welcome back, {players[0]?.nickname || 'Player'}!</h2>
                <p>Ready for a new challenge today?</p>
                <div class="card-actions justify-end">
                    <button class="btn btn-primary btn-sm">Start Challenge</button>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
             <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div class="stat-title text-xs">Completed</div>
                    <div class="stat-value text-secondary text-2xl">42</div>
                    <div class="stat-desc">Total finished</div>
                </div>
            </div>

            <div class="stats shadow bg-base-100 border border-base-200 w-full">
                <div class="stat p-3">
                    <div class="stat-figure text-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <div class="stat-title text-xs">Streak</div>
                    <div class="stat-value text-primary text-2xl">5</div>
                    <div class="stat-desc">In a row</div>
                </div>
            </div>
        </div>
    </div>

     <!-- Active Challenges Placeholder -->
    <div class="divider text-base-content/50 font-medium">Active Challenges</div>
    
    <div class="grid grid-cols-1 gap-4">
        {#each [1, 2, 3] as i}
        <div class="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-all cursor-pointer group">
            <div class="card-body p-4 flex-row items-center gap-4">
                 <div class="checkbox checkbox-primary"></div>
                 <div class="flex-1">
                     <h3 class="font-bold group-hover:text-primary transition-colors">Complete {5 * i} Pushups</h3>
                     <p class="text-xs text-base-content/60">Fitness • +{10 * i} xp</p>
                 </div>
                 <div class="badge badge-ghost">Daily</div>
            </div>
        </div>
        {/each}
    </div>
</div>
