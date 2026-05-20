export declare function handleTaskAuditLog(args: unknown): Promise<{
    isError?: boolean | undefined;
    content: {
        type: "text";
        text: string;
    }[];
}>;
