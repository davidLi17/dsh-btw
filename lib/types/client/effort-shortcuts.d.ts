import type { Context } from '@deepseek-ai/cordis';
import type { Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client';
import { EffortController } from './effort-controller';
/** Native fixed input has already passed local control and IME arbitration. */
export declare function installEffortShortcuts(shortcuts: Pick<Shortcuts, 'registerFixed' | 'observeFixedInput'>, controller: EffortController, label: (direction: 'up' | 'down') => string): () => void;
/** Optional service scope: missing host capabilities never disable BTW or annotations. */
export declare function apply(ctx: Context): void;
