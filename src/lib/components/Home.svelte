<script lang="ts">
    import HomeTab from './tabs/HomeTab.svelte';
    import BadgesTab from './tabs/BadgesTab.svelte';
    import StoreTab from './tabs/StoreTab.svelte';
    import InventoryTab from './tabs/InventoryTab.svelte';
    import ProfileTab from './tabs/ProfileTab.svelte';
    import { fade } from 'svelte/transition';
    import { db } from '$lib/db';
    import { _ } from 'svelte-i18n';
    import { useUser } from '$lib/stores/user.svelte';
    import { I18N } from '$lib/i18n-keys';

    type Tab = 'home' | 'badges' | 'store' | 'inventory' | 'profile';
    
    const userStore = useUser();
    let player = $derived(userStore.value);
    
    let activeTab = $state<Tab>('home');
    let isDailyBonusOpen = $state(false);
    
    let currentStreak = $derived(player?.streak || 0);

    $effect(() => {
        if (!player) return;
        const today = new Date().toISOString().split('T')[0];
        
        // If bonus not collected today
        if (player.lastDailyBonus !== today) {
             if (!isDailyBonusOpen) isDailyBonusOpen = true;
        } else {
             if (isDailyBonusOpen) isDailyBonusOpen = false;
        }
    });

    async function collectBonus() {
        if (!player || !player.id) return;

         const today = new Date().toISOString().split('T')[0];
         // Streak Bonus Logic:
         // If streak >= 3 -> +2 coins
         // If streak >= 7 -> +3 coins
         // Else +1 coin
         
         let bonusAmount = 1;
         const s = player.streak || 0;
         if (s >= 7) bonusAmount = 3;
         else if (s >= 3) bonusAmount = 2;

         await db.player.update(player.id, {
             coins: (player.coins || 0) + bonusAmount,
             lastDailyBonus: today
         });
    }

    // Simple icons
    const icons = {
        home: `<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />`,
        badges: `<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 10.5h.008v.008h-.008V10.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5h.008v.008h-.008V10.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z" />`,
        store: `<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />`,
        inventory: `<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" />`,
        profile: `<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />`
    };

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: 'home', label: 'Home', icon: icons.home },
        { id: 'badges', label: 'Badges', icon: icons.badges },
        { id: 'store', label: 'Store', icon: icons.store },
        { id: 'inventory', label: 'Inventory', icon: icons.inventory },
        { id: 'profile', label: 'Profile', icon: icons.profile }
    ];

    function handleTabChange(tab: Tab) {
        activeTab = tab;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
</script>

<div class="bg-base-100 min-h-dvh md:pl-20 relative overflow-x-hidden">
    <div class="container mx-auto max-w-lg min-h-dvh relative">
        {#if activeTab === 'home'}
            <div in:fade={{ duration: 200, delay: 100 }} out:fade={{ duration: 100 }} class="absolute inset-0 p-4 pt-12 pb-28 md:pt-4 md:pb-4">
                <HomeTab />
            </div>
        {:else if activeTab === 'badges'}
            <div in:fade={{ duration: 200, delay: 100 }} out:fade={{ duration: 100 }} class="absolute inset-0 p-4 pt-12 pb-28 md:pt-4 md:pb-4">
                <BadgesTab />
            </div>
        {:else if activeTab === 'store'}
            <div in:fade={{ duration: 200, delay: 100 }} out:fade={{ duration: 100 }} class="absolute inset-0 p-4 pt-12 pb-28 md:pt-4 md:pb-4">
                <StoreTab />
            </div>
        {:else if activeTab === 'inventory'}
            <div in:fade={{ duration: 200, delay: 100 }} out:fade={{ duration: 100 }} class="absolute inset-0 p-4 pt-12 pb-28 md:pt-4 md:pb-4">
                <InventoryTab />
            </div>
        {:else if activeTab === 'profile'}
            <div in:fade={{ duration: 200, delay: 100 }} out:fade={{ duration: 100 }} class="absolute inset-0 p-4 pt-12 pb-28 md:pt-4 md:pb-4">
                <ProfileTab />
            </div>
        {/if}
    </div>

    <!-- Mobile Bottom Navigation -->
    <div class="fixed bottom-4 left-4 right-4 md:hidden z-50 flex justify-center pointer-events-none">
        <div class="bg-base-100/80 backdrop-blur-xl border border-base-200 shadow-2xl rounded-2xl p-2 flex justify-between gap-1 pointer-events-auto w-full max-w-sm">
        {#each tabs as tab}
            <button 
                class="btn btn-ghost btn-circle relative transition-all duration-300 {activeTab === tab.id ? 'text-primary bg-primary/10' : 'text-base-content/50'}"
                onclick={() => handleTabChange(tab.id)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill={activeTab === tab.id ? "currentColor" : "none"} viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-6 h-6">
                    {@html tab.icon}
                </svg>
            </button>
        {/each}
        </div>
    </div>

    <!-- Desktop Side Navigation -->
    <div class="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-20 border-r border-base-200 bg-base-100 items-center py-8 z-50">
         <div class="text-primary mb-8 p-2 bg-primary/10 rounded-xl">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                  <path fill-rule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clip-rule="evenodd" />
            </svg>
        </div>
        <div class="flex flex-col gap-6 w-full px-2">
            {#each tabs as tab}
                 <button 
                    class="btn btn-ghost btn-square w-full rounded-xl transition-all {activeTab === tab.id ? 'bg-primary text-primary-content shadow-lg shadow-primary/30' : 'text-base-content/50 hover:bg-base-200'}"
                    onclick={() => handleTabChange(tab.id)}
                    aria-label={tab.label}
                >   <div class="tooltip tooltip-right absolute inset-0 z-10" data-tip={tab.label}></div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill={activeTab === tab.id ? "currentColor" : "none"} viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                        {@html tab.icon}
                    </svg>
                </button>
            {/each}
        </div>
    </div>

    <!-- Daily Bonus Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isDailyBonusOpen}>
        <div class="modal-box text-center">
            <h3 class="font-bold text-2xl text-primary">{$_(I18N.bonus.title)}</h3>
            <div class="py-6 flex flex-col items-center gap-4">
                 <div class="text-6xl animate-bounce">🪙</div>
                 <p class="text-lg">{$_(I18N.bonus.message)}</p>
                 
                 {#if currentStreak >= 3}
                    <div class="badge badge-secondary badge-lg gap-2 py-4">
                        🔥 {$_(I18N.bonus.streak_active, { values: { streak: currentStreak } })}
                    </div>
                 {/if}

                 {#if currentStreak >= 7}
                    <p class="text-sm text-success font-bold">+2 {$_(I18N.bonus.extra_coins)}</p>
                 {:else if currentStreak >= 3}
                    <p class="text-sm text-success font-bold">+1 {$_(I18N.bonus.extra_coins)}</p>
                 {/if}
            </div>
            <div class="modal-action justify-center">
                <button class="btn btn-primary btn-lg w-full" onclick={collectBonus}>
                    {$_(I18N.bonus.collect)} 
                    {#if currentStreak >= 7} 3 🪙
                    {:else if currentStreak >= 3} 2 🪙
                    {:else} 1 🪙
                    {/if}
                </button>
            </div>
        </div>
        <!-- No backdrop click to close, must collect -->
    </dialog>
</div>
