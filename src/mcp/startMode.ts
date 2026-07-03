export type McpStartMode = 'off' | 'manual' | 'auto';

export function normalizeMcpStartMode(value: unknown): McpStartMode {
    if (value === 'off' || value === 'manual' || value === 'auto') {
        return value;
    }
    return 'manual';
}

export function canAutoStartMcp(mode: McpStartMode, isRunning: boolean, isInitialized: boolean): boolean {
    return mode === 'auto' && !isRunning && isInitialized;
}
