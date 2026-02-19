<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { _ } from 'svelte-i18n';
    import { I18N } from '$lib/i18n-keys';

    const dispatch = createEventDispatcher<{
        showQr: void;
        shareViaApp: void;
        cancel: void;
    }>();
</script>

<div class="flex flex-col items-center justify-center py-6 gap-3">
    <div class="w-full">
        <p class="text-sm text-center mb-2">{$_(I18N.home.share_link)}</p>
        <p class="text-xs text-warning text-center mb-3">⚠️ {$_(I18N.home.share_irreversible_warning)}</p>

        <button class="btn btn-outline w-full mt-2" onclick={() => dispatch('showQr')}>
            {$_(I18N.home.show_qr)}
        </button>

        <div class="text-center text-sm opacity-70 my-2">{$_(I18N.home.or_separator)}</div>

        <button class="btn btn-outline w-full mt-2" onclick={() => dispatch('shareViaApp')}>
            {$_(I18N.home.share_via_app)} 🔗
        </button>

        <button class="btn btn-ghost w-full mt-2" onclick={() => dispatch('cancel')}>
            {$_(I18N.common.cancel)}
        </button>
    </div>
</div>
