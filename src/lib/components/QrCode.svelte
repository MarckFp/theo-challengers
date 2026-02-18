<script lang="ts">
    import { onMount } from 'svelte';
    import QRCode from 'qrcode';

    let { data, size = 200 } = $props();
    let canvas: HTMLCanvasElement;

    $effect(() => {
        if (canvas && data) {
            QRCode.toCanvas(canvas, data, { width: size }, (error) => {
                if (error) console.error(error);
            });
        }
    });

</script>

<canvas bind:this={canvas}></canvas>
