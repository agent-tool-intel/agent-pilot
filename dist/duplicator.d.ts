export declare function handleTaskDuplicate(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
