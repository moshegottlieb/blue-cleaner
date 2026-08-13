import { AtpAgent } from '@atproto/api'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

export interface Follower {
    did: string
    handle: string
    displayName?: string
    avatar?: string
    created: Date
}

export interface FollowerChanges {
    followers: number
    totalFollowers: number
    previousFollowers?: number
    followersDelta?: number
    newFollowers: number
    newFollowersSummary: Follower[]
    unfollowed: number
    unfollowedSummary: Follower[]
}

export class Followers {
    private agent: AtpAgent
    private db: DatabaseSync

    constructor(agent: AtpAgent, dbPath: string = 'blue.db') {
        this.agent = agent
        this.db = new DatabaseSync(dbPath)
    }

    private run(sql: string, params: SQLInputValue[] = []): void {
        this.db.prepare(sql).run(...params)
    }

    private get<T>(sql: string, params: SQLInputValue[] = []): T {
        return this.db.prepare(sql).get(...params) as T
    }

    private all<T>(sql: string, params: SQLInputValue[] = []): T[] {
        return this.db.prepare(sql).all(...params) as T[]
    }

    async fetchChanges(previousFollowers?: number): Promise<FollowerChanges> {
        const session_did = this.agent.session?.did
        if (!session_did) {
            throw new Error("Agent not logged in, did is undefined")
        }

        // Mark all existing followers as not updated
        this.run('UPDATE followers SET updated = 0')

        // Count current followers before fetching
        const { count: previousCount } = this.get<{ count: number }>('SELECT COUNT(*) as count FROM followers')

        // Fetch all followers from Bluesky
        let cursor: string | undefined
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

        do {
            const res = await this.agent.getFollowers({
                actor: session_did,
                limit: 100,
                cursor
            })

            for (const follower of res.data.followers) {
                const displayName = follower.displayName?.trim() || null
                this.run(
                    `INSERT INTO followers (did, handle, displayName, avatar, updated, created)
                     VALUES (?, ?, ?, ?, 1, ?)
                     ON CONFLICT(did) DO UPDATE SET
                        handle = excluded.handle,
                        displayName = excluded.displayName,
                        avatar = excluded.avatar,
                        updated = 1`,
                    [
                        follower.did,
                        follower.handle,
                        displayName,
                        follower.avatar ?? null,
                        now
                    ]
                )
            }

            cursor = res.data.cursor
        } while (cursor)

        // Get total follower count from profile
        const profile = await this.agent.getProfile({ actor: session_did })
        const totalFollowers = profile.data.followersCount ?? 0

        // Get the new follower count
        const { count: followersCount } = this.get<{ count: number }>('SELECT COUNT(*) as count FROM followers WHERE updated = 1')

        // Get new followers (created in this run)
        const newFollowersRows = this.all<{ did: string; handle: string; displayName: string | null; avatar: string | null; created: string }>(
            `SELECT did, handle, displayName, avatar, created 
             FROM followers 
             WHERE updated = 1 AND created = ?
             LIMIT 10`,
            [now]
        )
        const newFollowersSummary: Follower[] = newFollowersRows.map(row => ({
            did: row.did,
            handle: row.handle,
            displayName: row.displayName ?? undefined,
            avatar: row.avatar ?? undefined,
            created: new Date(row.created)
        }))
        const { count: newFollowersCount } = this.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM followers WHERE updated = 1 AND created = ?',
            [now]
        )

        // Get unfollowed (updated = 0)
        const unfollowedRows = this.all<{ did: string; handle: string; displayName: string | null; avatar: string | null; created: string }>(
            `SELECT did, handle, displayName, avatar, created 
             FROM followers 
             WHERE updated = 0
             LIMIT 10`
        )
        const unfollowedSummary: Follower[] = unfollowedRows.map(row => ({
            did: row.did,
            handle: row.handle,
            displayName: row.displayName ?? undefined,
            avatar: row.avatar ?? undefined,
            created: new Date(row.created)
        }))
        const { count: unfollowedCount } = this.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM followers WHERE updated = 0'
        )

        // Delete unfollowers so they don't appear again in subsequent runs
        this.run('DELETE FROM followers WHERE updated = 0')

        return {
            followers: followersCount,
            totalFollowers,
            previousFollowers,
            followersDelta: previousFollowers !== undefined ? totalFollowers - previousFollowers : undefined,
            newFollowers: newFollowersCount,
            newFollowersSummary,
            unfollowed: unfollowedCount,
            unfollowedSummary
        }
    }

    close(): void {
        this.db.close()
    }
}
