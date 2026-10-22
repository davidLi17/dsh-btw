/** Bind public DSH services only. No Lexical internals or send interception. */
export function createRuntime(ctx: any): {
    faceFor: (sessionId: any) => any;
    source: {
        name: string;
        trigger: string;
        label: string;
        candidates: () => Promise<never[]>;
        onPick: () => never;
        codec: {
            serialize: (ref: any, signal: any) => Promise<string>;
        };
        openReference: (session: any, reference: any) => boolean;
    };
    dispose: () => void;
};
