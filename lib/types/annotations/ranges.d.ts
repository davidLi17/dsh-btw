/** Index visible text with explicit paragraph/table separators; never alter source DOM. */
export function textIndex(root: any): {
    text: string;
    nodes: {
        node: Node;
        start: number;
        end: any;
    }[];
};
export function capture(root: any, range: any, nodeKey: any): {
    nodeKey: any;
    start: any;
    end: any;
    quote: string;
    prefix: string;
    suffix: string;
} | null;
export function restoreRange(root: any, note: any): Range | null;
export function selectionEndRect(range: any): any;
