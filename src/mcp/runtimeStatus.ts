let mcpServerRunning = false;

export function isMcpServerRunning(): boolean {
    return mcpServerRunning;
}

export function setMcpServerRunning(running: boolean): void {
    mcpServerRunning = running;
}
