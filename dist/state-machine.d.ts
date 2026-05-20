export declare const VALID_TRANSITIONS: Record<string, string[]>;
export declare function handleTaskNext(args: unknown): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function handleTaskUpdate(args: unknown): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
