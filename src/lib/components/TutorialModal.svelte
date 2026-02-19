<script lang="ts">
    import { _ } from 'svelte-i18n';
    import { I18N } from '$lib/i18n-keys';

    let { open = $bindable(false), onClose, onComplete } = $props<{
        open?: boolean;
        onClose?: () => void;
        onComplete?: () => void;
    }>();

    let step = $state(0);

    const steps = [
        {
            icon: '👋',
            title: 'tutorial.step_1_title',
            desc: 'tutorial.step_1_desc'
        },
        {
            icon: '🪙',
            title: 'tutorial.step_2_title',
            desc: 'tutorial.step_2_desc'
        },
        {
            icon: '🛒',
            title: 'tutorial.step_3_title',
            desc: 'tutorial.step_3_desc'
        },
        {
            icon: '💌',
            title: 'tutorial.step_4_title',
            desc: 'tutorial.step_4_desc'
        },
        {
            icon: '✅',
            title: 'tutorial.step_5_title',
            desc: 'tutorial.step_5_desc'
        },
        {
            icon: '🏆',
            title: 'tutorial.step_6_title',
            desc: 'tutorial.step_6_desc'
        }
    ];

    function next() {
        if (step < steps.length - 1) {
            step++;
        } else {
            finish();
        }
    }

    function prev() {
        if (step > 0) step--;
    }

    function finish() {
        open = false;
        if (onComplete) onComplete();
        if (onClose) onClose();
        // Reset step for next viewing
        setTimeout(() => step = 0, 300);
    }
</script>

<dialog class="modal modal-bottom sm:modal-middle" class:modal-open={open}>
    <div class="modal-box text-center relative max-w-sm mx-auto">
        {#if onClose}
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick={() => { open = false; onClose(); }}>✕</button>
        {/if}
        
        <div class="py-8 px-4 flex flex-col items-center min-h-[300px]">
            <div class="text-6xl mb-6 animate-bounce">
                {steps[step].icon}
            </div>
            
            <h3 class="font-bold text-2xl mb-4 text-primary">
                {$_(steps[step].title)}
            </h3>
            
            <p class="text-base-content/80 text-lg leading-relaxed flex-grow">
                {$_(steps[step].desc)}
            </p>

            <!-- Indicators -->
            <div class="flex gap-2 mt-8 mb-4">
                {#each steps as _, i}
                    <div class="h-2 w-2 rounded-full transition-all duration-300 {i === step ? 'bg-primary w-6' : 'bg-base-300'}"></div>
                {/each}
            </div>
        </div>

        <div class="modal-action grid grid-cols-2 gap-4">
            <button class="btn btn-ghost" onclick={prev} disabled={step === 0}>
                {$_(I18N.tutorial.back)}
            </button>
            <button class="btn btn-primary" onclick={next}>
                {#if step === steps.length - 1}
                    {$_(I18N.tutorial.finish)}
                {:else}
                    {$_(I18N.tutorial.next)}
                {/if}
            </button>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button onclick={() => { open = false; onClose?.(); }}>close</button>
    </form>
</dialog>
