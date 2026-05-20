import Database from 'better-sqlite3';
export declare function getDb(): Database.Database;
export declare function getLatestRoot(database: Database.Database): string | null;
export declare function closeDb(): void;
