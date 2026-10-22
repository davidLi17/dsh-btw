import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
export type EffortDirection = 1 | -1;
export type EffortDirectory = Pick<ModelDirectory, 'store' | 'select'>;
/** Use only the provider's ordered catalog; unknown/default-less selections are inert. */
export declare function effortPosition(state: ModelDirectoryState): {
    current: ModelSelection;
    efforts: readonly import("@deepseek-ai/dsh-api-session-controller/types").ModelReasoningEffort[];
    index: number;
} | undefined;
/** Serialize each session independently; only durable directory confirmation advances a queue. */
export declare class EffortController {
    private readonly directoryFor;
    private readonly timeoutMs;
    private readonly queues;
    private disposed;
    constructor(directoryFor: (id: string) => EffortDirectory, timeoutMs?: number);
    /** Returns whether the gesture belongs to this feature (including clamped boundaries). */
    move(sessionId: string, direction: EffortDirection): boolean;
    cancel(sessionId: string): void;
    reset(): void;
    dispose(): void;
    private drain;
    private selectConfirmed;
}
