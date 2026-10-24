import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type SessionId } from '@deepseek-ai/dsh-session';
import type { SideChildAddress } from '../shared';
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        'plugin:michengai-btw/child': {
            parentId: string;
            childId: string;
            requestId?: string;
        };
    }
}
/** Result routing belongs to the durable conversation, not its first activation. */
export declare function markSideChild(parent: Agent, childId: SessionId, requestId?: string): void;
/** Only the exact parent's own successful admission record can address a child. */
export declare function sideChildAddress(parent: Agent, requestId: string): SideChildAddress | undefined;
export declare function installSideDelivery(ctx: Context): () => void;
