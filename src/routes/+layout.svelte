<script lang="ts">
    import '../app.css'
    import {pwaAssetsHead} from 'virtual:pwa-assets/head'
    import {pwaInfo} from 'virtual:pwa-info'
    import { onMount } from 'svelte';
    import '$lib/i18n'; // Initialize i18n
    import { isLoading } from 'svelte-i18n';
    import { useUser } from '$lib/stores/user.svelte';
    import { initInventory } from '$lib/stores/inventory.svelte';

    // Global Stores Setup
    const user = useUser();
    
    $effect(() => {
        initInventory(user.value?.id);
    });

    let webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

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
