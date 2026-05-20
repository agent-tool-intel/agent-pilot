export declare function handleToolImport(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
