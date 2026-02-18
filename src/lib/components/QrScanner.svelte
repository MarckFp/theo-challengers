<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { Html5Qrcode, type Html5QrcodeScannerState } from 'html5-qrcode';
    import { _ } from 'svelte-i18n';
    import { I18N } from '$lib/i18n-keys';

    let { onScan, onCancel } = $props();

    let scanner: Html5Qrcode | null = null;
    let scanError = $state<string | null>(null);
    let isScanning = $state(false);

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    onMount(async () => {
        try {
            scanner = new Html5Qrcode("reader");
            
            // Prefer back camera
            await scanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    // Success!
                    if (decodedText) {
                        onScan(decodedText);
                        stopScanner();
                    }
                },
                (errorMessage) => {
                    // Typical scan failure if nothing in view
                }
            );
            isScanning = true;
        } catch (err) {
            console.error(err);
            scanError = "Failed to start camera. Please ensure camera permissions are granted.";
        }
    });

    async function stopScanner() {
        if (scanner && isScanning) {
            try {
                await scanner.stop();
                isScanning = false;
            } catch (err) {
                console.error("Failed to stop scanner", err);
            }
        }
    }

    onDestroy(() => {
        stopScanner();
    });

</script>

<div class="flex flex-col items-center gap-4 w-full">
    <div id="reader" class="w-full max-w-sm aspect-square bg-black/10 rounded-lg overflow-hidden relative"></div>
    
    {#if scanError}
        <div class="alert alert-error text-sm">
            <span>{scanError}</span>
        </div>
    {/if}

    <button class="btn btn-ghost" onclick={onCancel}>
        {$_(I18N.common.cancel)}
    </button>
</div>
