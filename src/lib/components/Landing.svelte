<script lang="ts">
	import { db } from '$lib/db';
    import { _ } from 'svelte-i18n';

	/** 
	 * Props
	 * passed from parent
	 */ 
	let { onLogin }: { onLogin: () => void } = $props();

	let nickname = $state('');
    let error = $state('');
    let loading = $state(false);

	async function handleSubmit(event?: Event) {
        if(event) event.preventDefault();
        
        loading = true;
        error = '';
        
        try {
            if (!nickname.trim()) {
                error = $_('landing.error_empty');
                loading = false;
                return;
            }
            
            // Add player to db
            await db.player.add({
                nickname: nickname.trim(),
                coins: 2,
                score: 0,
                lastShopUpdate: '',
                shopItems: []
            });

            // Notify parent
            onLogin();
        } catch (e) {
            console.error(e);
            error = $_('landing.error_create');
        } finally {
            loading = false;
        }
	}
</script>

<div class="min-h-dvh w-full flex flex-col items-center justify-center bg-base-100 p-6 selection:bg-primary selection:text-primary-content">
	<div class="w-full max-w-sm flex flex-col items-center space-y-12 animate-[fadIn_0.5s_ease-out]">
        
        <!-- Minimal Brand -->
		<div class="text-center space-y-3">
             <div class="bg-primary/10 p-3 rounded-2xl inline-flex text-primary mb-2">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
                  <path fill-rule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clip-rule="evenodd" />
                </svg>
            </div>
			<h1 class="text-3xl font-bold tracking-tight text-base-content">
                {$_('landing.title')}
            </h1>
			<p class="text-base-content/60 font-medium">{$_('landing.subtitle')}</p>
            
            <button class="btn btn-xs btn-ghost text-primary no-animation hover:bg-transparent hover:underline" onclick={() => (document.getElementById('guide_modal') as HTMLDialogElement)?.showModal()}>
                {$_('landing.how_to_play')} ℹ️
            </button>
		</div>
			
        <!-- Minimal Form -->
        <form class="w-full space-y-6" onsubmit={handleSubmit}>
            <div class="form-control w-full">
                <!-- Cleaner input with floating label feel or minimal style -->
                <input 
                    type="text" 
                    placeholder={$_('landing.placeholder')} 
                    class="input input-lg w-full bg-base-200/50 focus:bg-base-100 border-transparent focus:border-primary text-center font-medium placeholder:font-normal placeholder:text-base-content/30 transition-all rounded-2xl" 
                    bind:value={nickname} 
                    readonly={loading}
                    autofocus
                />
                 {#if error}
                    <div class="text-center mt-3 text-error text-sm font-medium animate-pulse">
                        {error}
                    </div>
                {/if}
            </div>
            
            <button class="btn btn-primary btn-lg w-full rounded-2xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all" disabled={loading}>
                {#if loading}
                    <span class="loading loading-spinner loading-sm"></span>
                {:else}
                    {$_('landing.continue')}
                {/if}
            </button>
        </form>

        <div class="text-xs text-base-content/30 font-medium tracking-wide">
            {$_('landing.press_enter')}
        </div>
	</div>

    <dialog id="guide_modal" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
            <h3 class="font-bold text-lg text-center mb-4">{$_('landing.guide.title')}</h3>
            
            <ul class="timeline timeline-vertical timeline-compact -ml-4">
                <li>
                    <div class="timeline-middle">
                        <span class="bg-primary/20 text-primary rounded-full p-1 text-xs">🪙</span>
                    </div>
                    <div class="timeline-end mb-4">
                        <div class="font-bold text-sm">{$_('landing.guide.step_1_title')}</div>
                        <div class="text-xs text-base-content/70">{$_('landing.guide.step_1_desc')}</div>
                    </div>
                    <hr class="bg-base-300"/>
                </li>
                <li>
                    <hr class="bg-base-300"/>
                    <div class="timeline-middle">
                        <span class="bg-secondary/20 text-secondary rounded-full p-1 text-xs">🛍️</span>
                    </div>
                    <div class="timeline-end mb-4">
                        <div class="font-bold text-sm">{$_('landing.guide.step_2_title')}</div>
                         <div class="text-xs text-base-content/70">{$_('landing.guide.step_2_desc')}</div>
                    </div>
                    <hr class="bg-base-300"/>
                </li>
                <li>
                    <hr class="bg-base-300"/>
                    <div class="timeline-middle">
                        <span class="bg-accent/20 text-accent rounded-full p-1 text-xs">📤</span>
                    </div>
                    <div class="timeline-end mb-4">
                        <div class="font-bold text-sm">{$_('landing.guide.step_3_title')}</div>
                        <div class="text-xs text-base-content/70">{$_('landing.guide.step_3_desc')}</div>
                    </div>
                    <hr class="bg-base-300"/>
                </li>
                <li>
                    <hr class="bg-base-300"/>
                    <div class="timeline-middle">
                        <span class="bg-success/20 text-success rounded-full p-1 text-xs">✅</span>
                    </div>
                    <div class="timeline-end">
                        <div class="font-bold text-sm">{$_('landing.guide.step_4_title')}</div>
                        <div class="text-xs text-base-content/70">{$_('landing.guide.step_4_desc')}</div>
                    </div>
                </li>
            </ul>

            <div class="modal-action justify-center w-full">
                <form method="dialog" class="w-full">
                    <button class="btn btn-primary w-full shadow-lg">{$_('landing.guide.close')}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</div>
