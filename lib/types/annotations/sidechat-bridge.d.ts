/** Optional Sidebar capability; the original annotation/BTW flows never depend on it. */
export function createSidechatBridge(ctx: any): {
    subscribe(listener: any): () => boolean;
    getSnapshot(): any;
};
