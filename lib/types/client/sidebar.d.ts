import type { Context } from '@deepseek-ai/cordis';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionInputResolver } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { type SideChildAddress, type SideResult } from '../shared';
import type { BtwTranslate } from '../locales';
/** Structural public host faces; no runtime sidebar dependency or second tab registration. */
export interface NativeSidebar {
    mounted: {
        getSnapshot(): string | undefined;
        subscribe?(listener: () => void): () => void;
    };
    openResource(address: string, options: {
        kind: 'subagentchat';
        preferNewPane: true;
        revealIfOpened: true;
    }): void;
    active?(): {
        contentId: string;
    } | undefined;
    isExpanded?(): boolean;
}
export interface NativeSidebarTabs {
    get(kind: string): unknown;
    subscribe?(listener: () => void): () => void;
}
type FocusRequest = SideChildAddress & {
    resource: string;
};
type SidebarSnapshot = {
    available: boolean;
    focus?: FocusRequest;
};
type Execute = (session: string, line: string, signal?: AbortSignal) => Promise<SideResult>;
export declare function subagentChatAddress(address: SideChildAddress): string;
/** Only resolve an existing request and reveal the native, continuable conversation. */
export declare function createSidebarBridge(sessions: ISessions, execute: Execute, t: BtwTranslate, input: Pick<SessionInputResolver, 'for'>): {
    getSnapshot: () => SidebarSnapshot;
    subscribe: (listener: () => void) => () => void;
    attach(nextSidebar: NativeSidebar, nextTabs: NativeSidebarTabs): () => void;
    openInSidebar(parentSessionId: string, requestId: string, signal: AbortSignal): Promise<void>;
    /** Called from the child's mounted input dock, never a document-wide editor selector. */
    focusComposer(sessionId: string, request: FocusRequest): void;
};
export type SidebarBridge = ReturnType<typeof createSidebarBridge>;
export declare function SidebarComposerFocus({ bridge, sessionId }: {
    bridge: SidebarBridge;
    sessionId: string;
}): null;
export declare function mountSidebarBridge(ctx: Context, bridge: SidebarBridge): void;
export {};
