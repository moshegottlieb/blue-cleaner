import { AtpAgent, AtUri, AppBskyFeedDefs, AppBskyFeedGetPostThread } from '@atproto/api'
import { DatabaseSync } from 'node:sqlite'

const POST_COLLECTION = 'app.bsky.feed.post'
// Maximum reply depth the API allows for getPostThread
const MAX_DEPTH = 1000

export class Sticky {
    private agent: AtpAgent
    private db: DatabaseSync

    constructor(agent: AtpAgent, dbPath: string = 'blue.db') {
        this.agent = agent
        this.db = new DatabaseSync(dbPath)
    }

    /**
     * Converts a bsky.app post URL (or an at:// URI) to an at:// URI keyed by DID,
     * which is the form listRecords returns.
     * e.g. https://bsky.app/profile/sharkfood.com/post/3msx4fncwxk2f
     */
    async toUri(input: string): Promise<string> {
        let actor: string
        let rkey: string
        if (input.startsWith('at://')) {
            const uri = new AtUri(input)
            if (uri.collection !== POST_COLLECTION) {
                throw new Error(`Not a post URI: ${input}`)
            }
            actor = uri.hostname
            rkey = uri.rkey
        } else {
            const url = new URL(input)
            const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)\/?$/)
            if (!match) {
                throw new Error(`Not a post URL: ${input}`)
            }
            actor = decodeURIComponent(match[1])
            rkey = match[2]
        }
        if (!actor.startsWith('did:')) {
            const res = await this.agent.resolveHandle({ handle: actor })
            actor = res.data.did
        }
        return AtUri.make(actor, POST_COLLECTION, rkey).toString()
    }

    /** Returns the URI of the post and every reply under it, or an empty list if the post no longer exists. */
    async thread(uri: string): Promise<string[]> {
        let res
        try {
            res = await this.agent.getPostThread({ uri, depth: MAX_DEPTH, parentHeight: 0 })
        } catch (err) {
            if (err instanceof AppBskyFeedGetPostThread.NotFoundError) {
                return []
            }
            throw err
        }
        const uris: string[] = []
        const walk = (node: AppBskyFeedGetPostThread.OutputSchema['thread']) => {
            if (!AppBskyFeedDefs.isThreadViewPost(node)) {
                return
            }
            uris.push(node.post.uri)
            for (const reply of node.replies ?? []) {
                walk(reply)
            }
        }
        walk(res.data.thread)
        return uris
    }

    /** Returns the URI of the account's pinned post, if it has one. */
    async pinned(did: string): Promise<string | undefined> {
        const profile = await this.agent.getProfile({ actor: did })
        return profile.data.pinnedPost?.uri
    }

    list(): string[] {
        const rows = this.db.prepare('SELECT uri FROM sticky').all() as { uri: string }[]
        return rows.map(row => row.uri)
    }

    /**
     * Every URI that must not be deleted: the stuck posts, the pinned post,
     * and all replies under each of them (fetched now, so newer replies are covered too).
     */
    async collect(did: string): Promise<Set<string>> {
        const roots = this.list()
        const pinned = await this.pinned(did)
        if (pinned) {
            roots.push(pinned)
        }
        const result = new Set<string>()
        for (const root of roots) {
            // Keep the root itself even if it can't be fetched
            result.add(root)
            for (const uri of await this.thread(root)) {
                result.add(uri)
            }
        }
        return result
    }

    /** Marks a post as sticky. Returns false if it already was. */
    stick(uri: string): boolean {
        const res = this.db.prepare('INSERT OR IGNORE INTO sticky (uri) VALUES (?)').run(uri)
        return res.changes > 0
    }

    /** Removes the given URIs from the sticky list, returns the ones that were removed. */
    unstick(uris: string[]): string[] {
        const remove = this.db.prepare('DELETE FROM sticky WHERE uri = ?')
        return uris.filter(uri => remove.run(uri).changes > 0)
    }

    close(): void {
        this.db.close()
    }
}
