<script lang="ts">
    import { db } from '$lib/db';
    import { liveQuery } from 'dexie';
    import { exportDB, importDB } from 'dexie-export-import';
    import { onMount } from 'svelte';
    import { _, locale } from 'svelte-i18n';

    let players = $state<{id?: number, nickname: string}[]>([]); 
    
    // Nickname State
    let isEditingNickname = $state(false);
    let newNickname = $state('');

    // Theme State
    const themes = [
        "light", "dark", "cupcake", "bumblebee", "emerald", "corporate", "synthwave", 
        "retro", "cyberpunk", "valentine", "halloween", "garden", "forest", "aqua", 
        "lofi", "pastel", "fantasy", "wireframe", "black", "luxury", "dracula", 
        "cmyk", "autumn", "business", "acid", "lemonade", "night", "coffee", "winter"
    ];
    let currentTheme = $state(''); // Initialize empty to wait for mount
    let currentLang = $state('en');

    $effect(() => {
        const unsubscribe = locale.subscribe(l => {
            if (l) {
                if (l.startsWith('es')) currentLang = 'es';
                else if (l.startsWith('fr')) currentLang = 'fr';
                else currentLang = 'en';
            }
        });
        return unsubscribe;
    });

    $effect(() => {
        const subscription = liveQuery(() => db.player.toArray()).subscribe(result => {
            players = result;
            if (result.length > 0 && !isEditingNickname) {
                newNickname = result[0].nickname;
            }
        });
        return () => subscription.unsubscribe();
    });

    onMount(() => {
        // Read directly from DOM if available, or localStorage
        const savedTheme = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme') || 'dark';
        currentTheme = savedTheme;
    });

    // Nickname Logic
    async function handleUpdateNickname() {
        if (!newNickname.trim() || players.length === 0) return;
        
        try {
            const player = players[0];
            if (player.id) {
                await db.player.update(player.id, { nickname: newNickname.trim() });
                isEditingNickname = false;
            }
        } catch (error) {
            console.error('Failed to update nickname:', error);
        }
    }

    function cancelEditNickname() {
        if (players.length > 0) {
            newNickname = players[0].nickname;
        }
        isEditingNickname = false;
    }

    // Export/Import Logic
    async function handleExportData() {
        try {
            const blob = await exportDB(db);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `theo-challengers-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export data');
        }
    }

    async function handleImportData(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        
        const file = input.files[0];
        try {
            await importDB(db, file, { clearTables: true });
            alert('Data imported successfully! Reloading...');
            window.location.reload();
        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import data. Please ensure the file is valid.');
        }
    }

    // Theme Logic
    function handleThemeChange() {
        if (currentTheme) {
            document.documentElement.setAttribute('data-theme', currentTheme);
            localStorage.setItem('theme', currentTheme);
        }
    }

    function handleLangChange() {
        locale.set(currentLang);
    }

    // Delete Account Logic
    let isDeleteModalOpen = $state(false);

    async function handleDeleteAccount() {
        try {
            await db.delete();
            await db.open(); 
            window.location.reload(); 
        } catch (e) {
            console.error("Failed to delete account", e);
        }
    }
</script>

<div class="space-y-6 pb-20">
    <!-- Header / Nickname Section -->
    <div class="flex flex-col items-center pt-8 pb-4">
        <div class="avatar placeholder mb-4">
            <div class="bg-primary text-primary-content rounded-full w-24 shadow-xl ring ring-primary ring-offset-base-100 ring-offset-2 flex items-center justify-center">
                 <span class="text-4xl font-bold">{(players[0]?.nickname || 'P').charAt(0).toUpperCase()}</span>
            </div>
        </div>
        
        {#if isEditingNickname}
            <div class="flex items-center gap-2">
                <input 
                    type="text" 
                    bind:value={newNickname} 
                    class="input input-sm input-bordered w-full max-w-xs text-center font-bold text-xl" 
                    autofocus
                />
                <button class="btn btn-sm btn-square btn-success" onclick={handleUpdateNickname}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                </button>
                <button class="btn btn-sm btn-square btn-ghost text-error" onclick={cancelEditNickname}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        {:else}
            <div class="flex items-center gap-2 group cursor-pointer" onclick={() => isEditingNickname = true}>
                <h2 class="text-3xl font-bold group-hover:text-primary transition-colors">{players[0]?.nickname || 'Unknown'}</h2>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 opacity-50 group-hover:opacity-100 transition-opacity">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
            </div>
        {/if}
    </div>
    
    <div class="menu bg-base-100 w-full rounded-box border border-base-200 shadow-sm p-4 gap-2">
        <!-- Language Selector -->
        <div>
            <span class="label-text font-medium flex items-center gap-2 mb-2 px-1">
                🌎 {$_('profile.language')}
            </span>
             <select class="select select-bordered w-full" bind:value={currentLang} onchange={handleLangChange}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
            </select>
        </div>

        <div class="divider my-0"></div>

        <!-- Theme Selector -->
        <div>
            <span class="label-text font-medium flex items-center gap-2 mb-2 px-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
                </svg>
                {$_('profile.theme')}
            </span>
            <select class="select select-bordered w-full" bind:value={currentTheme} onchange={handleThemeChange}>
                <option value="" disabled>Select Theme</option>
                {#each themes as theme}
                    <option value={theme}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</option>
                {/each}
            </select>
        </div>

        <div class="divider my-0"></div>

        <!-- Export Data -->
        <button class="btn btn-ghost justify-start" onclick={handleExportData}>
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            {$_('profile.export_data')}
        </button>

        <!-- Import Data -->
        <button class="btn btn-ghost justify-start relative">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
            </svg>
            {$_('profile.import_data')}
            <input type="file" accept=".json" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onchange={handleImportData} />
        </button>

         <div class="divider my-0"></div>

         <!-- Delete Account -->
         <button class="btn btn-ghost text-error justify-start" onclick={() => isDeleteModalOpen = true}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            {$_('profile.reset_data')}
        </button>
    </div>
    
    <!-- Delete Confirmation Modal -->
    <dialog class="modal modal-bottom sm:modal-middle" open={isDeleteModalOpen}>
        <div class="modal-box">
            <h3 class="font-bold text-lg text-error">{$_('profile.danger_zone')}</h3>
            <p class="py-4">{$_('profile.delete_confirm')}</p>
            <div class="modal-action">
                <button class="btn" onclick={() => isDeleteModalOpen = false}>{$_('inventory.cancel')}</button>
                <button class="btn btn-error" onclick={handleDeleteAccount}>{$_('profile.delete_btn')}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={() => isDeleteModalOpen = false}>{$_('profile.close')}</button>
        </form>
    </dialog>
</div>
