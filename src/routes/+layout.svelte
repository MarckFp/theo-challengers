<script lang="ts">
    import '../app.css'
    import {pwaAssetsHead} from 'virtual:pwa-assets/head'
    import {pwaInfo} from 'virtual:pwa-info'
    import { onMount } from 'svelte';

    $: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : ''

    onMount(() => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    });
</script>

<svelte:head>
    {#if pwaAssetsHead.themeColor}
        <meta name="theme-color" content={pwaAssetsHead.themeColor.content} />
    {/if}
    {#each pwaAssetsHead.links as link}
        <link {...link} />
    {/each}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html webManifestLink}
</svelte:head>

<slot />
