import React from 'react';
import type { BubbleStore } from './bubbles';
import type { BtwTranslate } from '../locales';
import type { VoiceBridge } from './voice/service';
/** 只接管会话正文选区；非模态 popover 不抢选区，顶层避免滚动裁切。 */
export declare function SelectionAsk({ store, sessionId, t, initialReference, onDismiss, voice, }: {
    store: BubbleStore;
    sessionId: string;
    t: BtwTranslate;
    initialReference?: string;
    onDismiss?: () => void;
    voice?: VoiceBridge;
}): React.JSX.Element;
