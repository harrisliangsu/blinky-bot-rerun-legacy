import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ToolSet } from 'ai'
import { z } from 'zod'

import { BRIDGE_SERVER_NAME } from './types.js'
import type { LocalChatCli } from './cli-search.js'

type Json = Record<string, unknown>

export type ToolBridge = { url: string; close: () => Promise<void> }

// The CLI is an MCP client. Rerun's tools stay in this process: the CLI dials a loopback
// server that calls `execute`, then the chat only renders the events the CLI already ran.
export async function startRerunToolBridge(tools: ToolSet): Promise<ToolBridge> {
    const names = Object.entries(tools).filter(([, tool]) => typeof tool.execute === 'function')
    const server = createServer((req, res) => {
        void handle(req, res, names)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    return {
        url: `http://127.0.0.1:${port}/mcp`,
        close: () => new Promise(resolve => server.close(() => resolve())),
    }
}

export async function attachProjectMcp(cwd: string, runtime: LocalChatCli, url: string): Promise<() => Promise<void>> {
    if (runtime === 'kimi') {
        const path = join(cwd, '.kimi-code', 'mcp.json')
        return swapFile(path, current => {
            const parsed = current ? (JSON.parse(current) as Json) : {}
            const servers = parsed.mcpServers && typeof parsed.mcpServers === 'object' ? (parsed.mcpServers as Json) : {}
            parsed.mcpServers = { ...servers, [BRIDGE_SERVER_NAME]: { url } }
            return `${JSON.stringify(parsed, null, 2)}\n`
        })
    }
    const path = join(cwd, '.grok', 'config.toml')
    return swapFile(path, current => {
        const stripped = (current ?? '').replace(/\n*\[mcp_servers\.rerun\][\s\S]*?(?=\n\[|$)/g, '').trim()
        const block = `[mcp_servers.${BRIDGE_SERVER_NAME}]\nurl = "${url}"\nenabled = true\n`
        return stripped ? `${stripped}\n\n${block}` : block
    })
}

async function handle(req: IncomingMessage, res: ServerResponse, tools: [string, ToolSet[string]][]): Promise<void> {
    if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    let message: Json
    try {
        message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json
    } catch {
        res.writeHead(400)
        res.end()
        return
    }
    if (message.id === undefined) {
        res.writeHead(202)
        res.end()
        return
    }
    const result = await dispatch(message, tools)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
}

async function dispatch(message: Json, tools: [string, ToolSet[string]][]): Promise<unknown> {
    const method = message.method
    const params = message.params && typeof message.params === 'object' ? (message.params as Json) : {}
    if (method === 'initialize') {
        return {
            protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: BRIDGE_SERVER_NAME, version: '1.0.0' },
        }
    }
    if (method === 'tools/list') {
        return { tools: tools.map(([name, tool]) => ({ name, description: tool.description ?? name, inputSchema: jsonSchemaOf(tool.inputSchema) })) }
    }
    if (method === 'tools/call') {
        const name = typeof params.name === 'string' ? params.name : ''
        const tool = tools.find(([toolName]) => toolName === name)?.[1]
        const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {}
        if (!tool?.execute) return { isError: true, content: [{ type: 'text', text: `Unknown tool ${name}` }] }
        try {
            const value: unknown = await tool.execute(args, { toolCallId: typeof message.id === 'string' ? message.id : String(message.id), messages: [], abortSignal: undefined })
            const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined')
            return { content: [{ type: 'text', text }] }
        } catch (error) {
            return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
        }
    }
    if (method === 'ping') return {}
    return {}
}

function jsonSchemaOf(schema: unknown): Record<string, unknown> {
    const convert = (z as { toJSONSchema?: (value: unknown) => Record<string, unknown> }).toJSONSchema
    try {
        if (schema && typeof convert === 'function') return convert(schema)
    } catch {
        // A tool whose schema will not convert still has to be callable. The model sends JSON.
    }
    return { type: 'object', additionalProperties: true }
}

function swapFile(path: string, next: (current: string | null) => string): () => Promise<void> {
    let current: string | null = null
    try {
        current = readFileSync(path, 'utf8')
    } catch {
        current = null
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, next(current))
    return async () => {
        if (current === null) rmSync(path, { force: true })
        else writeFileSync(path, current)
    }
}
