import React from 'react';
import type { Bubble, BubbleStore } from './bubbles';
import type { BtwTranslate } from '../locales';
export declare function BubbleView({ item, close, t, collapsed, onToggleCollapse, openInSidebar, sidebarAvailable }: {
    item: Bubble;
    close: () => void;
    t: BtwTranslate;
    collapsed: boolean;
    onToggleCollapse: () => void;
    openInSidebar?: () => void;
    sidebarAvailable?: boolean;
}): React.JSX.Element;
export declare function BubbleDock({ store, sessionId, t }: {
    store: BubbleStore;
    sessionId: string;
    t: BtwTranslate;
}): React.JSX.Element | null;
