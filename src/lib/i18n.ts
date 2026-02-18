import { register, init, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';

register('en', () => import('./locales/en.json'));
register('es', () => import('./locales/es.json'));
register('fr', () => import('./locales/fr.json'));

const defaultLocale = 'en';
const savedLocale = browser ? localStorage.getItem('locale') : null;

init({
    fallbackLocale: defaultLocale,
    initialLocale: savedLocale || getLocaleFromNavigator(),
});