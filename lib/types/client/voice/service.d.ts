import type { Context } from '@deepseek-ai/cordis';
type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        message: string;
    };
};
export interface SpeechCatalog {
    selection: {
        providerId?: string;
        language?: string;
    };
    providers: readonly {
        id: string;
        preparation: {
            phase: string;
        };
    }[];
    maxAudioBytes: number;
    maxDurationSeconds: number;
}
export interface SpeechRemote {
    catalog(): Promise<Result<SpeechCatalog>>;
    transcribe(request: {
        audioBase64: string;
        providerId?: string;
        language?: string;
    }, signal?: AbortSignal): Promise<Result<{
        text: string;
    }>>;
}
export interface VoiceService {
    remote: SpeechRemote;
    openSettings?: () => void;
}
export declare function createVoiceBridge(): {
    getSnapshot: () => VoiceService | undefined;
    subscribe: (listener: () => void) => () => void;
    set(value: VoiceService | undefined): void;
};
export type VoiceBridge = ReturnType<typeof createVoiceBridge>;
export declare function mountVoiceBridge(ctx: Context, bridge: VoiceBridge): void;
export {};
