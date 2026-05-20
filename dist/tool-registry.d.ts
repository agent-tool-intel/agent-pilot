export declare function handleToolRegister(args: unknown): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function handleToolUpdate(args: unknown): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
} | {
    content: {
        type: string;
        text: string;
    }[];
    isError: boolean;
}>;
export declare function handleToolSearch(args: unknown): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function handleToolDeprecate(args: unknown): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
} | {
    content: {
        type: string;
        text: string;
    }[];
    isError: boolean;
}>;
