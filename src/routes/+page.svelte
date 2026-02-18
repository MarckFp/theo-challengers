<script lang="ts">
    import { onMount } from 'svelte';
    import { db } from '$lib/db';
    import Landing from '$lib/components/Landing.svelte';
    import Home from '$lib/components/Home.svelte';
    import { liveQuery } from 'dexie';

    let checking = $state(true);
    let hasPlayer = $state(false);

    $effect(() => {
        // Use liveQuery to automatically react to changes in the player table
        const subscription = liveQuery(() => db.player.count()).subscribe(
            (count) => {
                hasPlayer = count > 0;
                checking = false;
            },
            (error) => {
                console.error('Error checking player:', error);
                checking = false;
            }
        );

        return () => subscription.unsubscribe();
    });

    /**
     * Callback when user logs in successfully from Landing
     * technically liveQuery handles this update automatically, 
     * but passing a callback is good for explicit flow control if needed.
     */
    function handleLogin() {
        // No-op if liveQuery works, but safer to re-check
        // liveQuery handles it
    }
</script>

{#if checking}
    <div class="flex h-dvh w-full items-center justify-center bg-base-200">
        <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
{:else if hasPlayer}
    <Home />
{:else}
    <Landing onLogin={handleLogin} />
{/if}
