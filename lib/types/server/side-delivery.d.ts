import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type SessionId } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        'plugin:michengai-btw/child': {
            parentId: string;
            childId: string;
        };
    }
}
/** Result routing belongs to the durable conversation, not its first activation. */
export declare function markSideChild(parent: Agent, childId: SessionId): void;
export declare function installSideDelivery(ctx: Context): () => void;
