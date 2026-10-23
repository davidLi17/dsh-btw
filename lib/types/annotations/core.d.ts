/** A length-framed, readable JSON reference. Quotes can contain any delimiter. */
export function encodePayload(payload: any): string;
export function decodeText(text: any): {
    text: string;
    payloads: any[];
};
/** Native pre-admission echoes are plain text, outside the keyed message renderer. */
export function submissionText(text: any): any;
/** Keep full quotes/comments, without UI identity and anchoring fields. */
export function modelText(text: any): any;
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
export const CITATION_GUIDANCE: "\u5F15\u7528\u4E0A\u8FF0\u6279\u6CE8\u65F6\uFF0C\u53EF\u7528 [\u6CE8\u91CA N](https://dsh-annotations.invalid/N) \u56DE\u6307\u539F\u6587\uFF0CN \u4F7F\u7528\u771F\u5B9E number\uFF0C\u52FF\u91CD\u65B0\u7F16\u53F7\u6216\u7F16\u9020\u3002\u65E0\u9700\u8BBF\u95EE\u8BE5\u5730\u5740\uFF1B\u65E0\u5173\u5185\u5BB9\u6216\u7528\u6237\u8981\u6C42\u7EAF\u4EE3\u7801\u3001JSON \u7B49\u683C\u5F0F\u65F6\u4E0D\u6DFB\u52A0\u5F15\u7528\u3002";
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
    add(selector: any, reservedNumbers?: any[]): any;
    edit(id: any, fields: any): any;
    remove(id: any): void;
    clearPending(): void;
    selected(): any;
    prepare(ref: any): any;
    acknowledge(payload: any): boolean;
}
