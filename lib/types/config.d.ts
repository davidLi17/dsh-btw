import z from '@deepseek-ai/schemastery';
/** Native settings forms expose volatile fields without replacing unrelated modules. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    btw: z<boolean, boolean, "volatile-defined">;
    annotations: z<boolean, boolean, "volatile-defined">;
    reasoningShortcuts: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    btw: z<boolean, boolean, "volatile-defined">;
    annotations: z<boolean, boolean, "volatile-defined">;
    reasoningShortcuts: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
