import type { Context } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Events {
        'loader/volatile-update'(paths: readonly (readonly string[])[]): void;
    }
}
export declare const SETTINGS_NAMESPACE = "michengai-btw";
export declare const MODULE_KEYS: readonly ["btw", "annotations", "reasoningShortcuts"];
export type ModuleKey = typeof MODULE_KEYS[number];
export type ModuleSettings = Record<ModuleKey, boolean>;
export declare const DEFAULT_MODULE_SETTINGS: ModuleSettings;
/** Accept plain wire settings and the Host's live schema references. */
export declare function moduleSettings(value: unknown): ModuleSettings;
/** Each feature has its own Cordis owner, so disabling one releases only its effects. */
export declare function moduleLifecycle(ctx: Context, mounts: Partial<Record<ModuleKey, (scope: Context) => void>>): {
    update: (settings: ModuleSettings) => Promise<void>;
};
