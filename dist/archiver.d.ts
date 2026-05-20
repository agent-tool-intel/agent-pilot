export declare function handleTaskArchive(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function handleTaskArchiveList(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
export declare function handleTaskArchiveRestore(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
