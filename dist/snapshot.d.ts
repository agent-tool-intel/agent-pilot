export declare function handleTaskSnapshot(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
