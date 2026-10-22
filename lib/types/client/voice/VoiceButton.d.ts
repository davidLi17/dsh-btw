import React from 'react';
import type { BtwTranslate } from '../../locales';
import type { VoiceBridge } from './service';
export interface DraftTarget {
    capture(): {
        text: string;
        revision: number;
        start: number;
        end: number;
    };
    insert(text: string, span: ReturnType<DraftTarget['capture']>): boolean;
}
export declare function insertTranscript(text: string, span: ReturnType<DraftTarget['capture']>): {
    text: string;
    caret: number;
} | undefined;
export declare function VoiceButton({ bridge, ...props }: {
    bridge: VoiceBridge;
    target: DraftTarget;
    locked: boolean;
    onActiveChange(active: boolean): void;
    t: BtwTranslate;
}): React.JSX.Element | null;
