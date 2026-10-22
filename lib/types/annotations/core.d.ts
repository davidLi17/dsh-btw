/** A length-framed, readable JSON reference. Quotes can contain any delimiter. */
export function encodePayload(payload: any): string;
export function decodeText(text: any): {
    text: string;
    payloads: any[];
};
/** Keep full quotes/comments, without UI identity and anchoring fields. */
export function modelText(text: any): string;
/** Only human user content is projected; other roles and attachments retain identity. */
export function modelMessage(message: any): any;
export function modelMessages(messages: any): any;
/** Locate exactly, or use unique surrounding context. Never guess duplicate text. */
export function locateQuote(text: any, note: any): {
    start: any;
    end: any;
} | null;
export const SOURCE: "dsh-codex-annotations";
export const STORAGE_PREFIX: "dsh-codex-annotations:v1:";
/** Persist before publishing; a quota/error never silently discards a draft. */
export class AnnotationStore {
    constructor(storage: any, sessionId: any);
    storage: any;
    sessionId: any;
    key: string;
    listeners: Set<any>;
    view: any;
    read(): any;
    getSnapshot: () => any;
    subscribe: (listener: any) => () => boolean;
    reload(): void;
    change(fn: any): any;
    add(selector: any): any;
    edit(id: any, fields: any): any;
    remove(id: any): void;
    clearPending(): void;
    selected(): any;
    prepare(ref: any): any;
    acknowledge(payload: any): boolean;
}
