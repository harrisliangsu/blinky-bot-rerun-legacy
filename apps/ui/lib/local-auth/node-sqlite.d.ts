declare module 'node:sqlite' {
    export class DatabaseSync {
        constructor(path: string)
        exec(sql: string): void
        prepare(sql: string): StatementSync
        close(): void
    }

    export class StatementSync {
        get(...params: SQLInputValue[]): unknown
        all(...params: SQLInputValue[]): unknown[]
        run(...params: SQLInputValue[]): { changes: number }
    }

    type SQLInputValue = string | number | null | bigint
}
