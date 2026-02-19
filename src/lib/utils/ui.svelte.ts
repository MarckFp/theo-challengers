export function useShake(duration = 500) {
    let shakingId = $state<string | null>(null);

    function trigger(id: string) {
        shakingId = id;
        setTimeout(() => {
            if (shakingId === id) {
                shakingId = null;
            }
        }, duration);
    }

    return {
        get activeId() { return shakingId },
        trigger
    };
}
