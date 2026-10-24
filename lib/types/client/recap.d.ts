import type { Context } from '@deepseek-ai/cordis';
export declare const RECAP_PROMPT = "1. \u5BF9\u8BDD\u4E3B\u7EBF recap\uFF0C\u6574\u7406\u5176\u4E2D\u4FE1\u606F\u3002\n2. \u7ED9\u6211\u5BF9\u6211\u6700\u91CD\u8981\u7684\u4FE1\u606F\u3002";
/** A native slash action, not a keystroke listener or a system-prompt section. */
export declare function applyRecap(ctx: Context): void;
