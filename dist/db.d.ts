export declare const DB_PATH: string;
declare class CompatStatement {
    private stmt;
    private sql;
    constructor(sqlLib: any, db: any, sql: string);
    run(...params: any[]): {
        changes: number;
        lastInsertRowid: number | bigint;
    };
    get(...params: any[]): Record<string, any> | undefined;
    all(...params: any[]): Record<string, any>[];
    free(): void;
}
declare class CompatDatabase {
    private sqlLib;
    private db;
    private filePath;
    constructor(filePath: string | null, sqlLib: any);
    prepare(sql: string): CompatStatement;
    exec(sql: string): void;
    pragma(key: string, _value?: string): any;
    transaction<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T>;
    close(): void;
    export(): Uint8Array;
    get name(): string;
    private save;
}
export declare function initDb(): Promise<CompatDatabase>;
export declare function getDb(): CompatDatabase;
export declare function closeDb(): void;
export declare function getLatestRoot(): string | null;
export {};
