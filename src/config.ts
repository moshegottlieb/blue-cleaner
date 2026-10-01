import { AtpAgent } from '@atproto/api'
import * as fs from 'fs'
import * as path from 'path'

// Config file is in the project root (parent of dist)
export const CONFIG_PATH = path.join(__dirname, '../config.json')

export interface ConfigFile {
    handle: string
    password: string
    service: string
    days: number
    previousFollowers?: number
}

export function loadConfig(): ConfigFile {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

export function saveConfig(config: ConfigFile): void {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4))
}

export interface Session {
    agent: AtpAgent
    did: string
    handle: string
}

export async function login(config: ConfigFile): Promise<Session> {
    const agent = new AtpAgent({ service: config.service })
    await agent.login({
        identifier: config.handle,
        password: config.password
    })
    const did = agent.session?.did
    if (!did) {
        throw new Error("Failed to log in, did is undefined")
    }
    const handle = agent.session?.handle
    if (!handle) {
        throw new Error("Failed to log in, handle is undefined")
    }
    return { agent, did, handle }
}
