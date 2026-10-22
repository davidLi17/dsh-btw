/** Use the host's scrollport and sticky composer, without moving native DOM. */
export function readingViewport(root: any): {
    scroll: any;
    left: number;
    right: number;
    top: number;
    bottom: number;
};
/** Center the selected text, rather than the (possibly very long) whole reply. */
export function revealQuote(root: any, range: any, { spaceAbove, center, behavior }?: {
    spaceAbove?: number | undefined;
    center?: boolean | undefined;
    behavior?: string | undefined;
}): void;
