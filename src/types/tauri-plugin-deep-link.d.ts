declare module '@tauri-apps/plugin-deep-link' {
  type DeepLinkPayload = { urls: string[] } | string[];

  export function onOpenUrl(
    handler: (event: DeepLinkPayload) => void
  ): Promise<() => void>;
}
