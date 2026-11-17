import { AtUri } from '@atproto/api'
import { loadConfig, login, Session } from './config'
import { Sticky } from './sticky'

// Usage:
//   npm run stick "https://bsky.app/profile/sharkfood.com/post/3msx4fncwxk2f"
//   npm run unstick "https://bsky.app/profile/sharkfood.com/post/3msx4fncwxk2f"
//   npm run sticky-list

main()
    .catch((err) => {
        console.error(err instanceof Error ? err.message : err)
        process.exitCode = 1
    })

async function main() {
    const [command, input] = process.argv.slice(2)
    if (command !== 'list' && (!['stick', 'unstick'].includes(command) || !input)) {
        throw new Error('Usage: npm run stick <url> | npm run unstick <url> | npm run sticky-list')
    }

    const session = await login(loadConfig())
    const sticky = new Sticky(session.agent)
    try {
        if (command === 'list') {
            await list(sticky, session)
            return
        }

        const uri = await sticky.toUri(input)
        const thread = await sticky.thread(uri)
        const mine = thread.filter(u => u.startsWith(`at://${session.did}/`)).length
        const url = toUrl(uri, session)

        if (command === 'stick') {
            if (thread.length === 0) {
                throw new Error(`Post not found: ${url}`)
            }
            if (sticky.stick(uri)) {
                console.log(`Stuck ${url}`)
            } else {
                console.log(`Already sticky: ${url}`)
            }
            console.log(`${mine} of your posts in this thread are now kept.`)
        } else {
            // Remove the post itself and any stuck posts under it
            const removed = sticky.unstick([uri, ...thread])
            if (removed.length === 0) {
                console.log(`Not in the sticky list: ${url}`)
            } else {
                for (const r of removed) {
                    console.log(`Unstuck ${toUrl(r, session)}`)
                }
            }
            // It may still be kept because it is under another sticky post or the pinned post
            if ((await sticky.collect(session.did)).has(uri)) {
                console.log('Note: this post is still kept, it is the pinned post or a reply under another sticky post.')
            }
        }
    } finally {
        sticky.close()
    }
}

async function list(sticky: Sticky, session: Session) {
    const pinned = await sticky.pinned(session.did)
    if (pinned) {
        console.log(`${toUrl(pinned, session)} (pinned)`)
    }
    for (const uri of sticky.list()) {
        console.log(toUrl(uri, session))
    }
}

/** Converts an at:// post URI to its bsky.app URL, the form stick and unstick take. */
function toUrl(uri: string, session: Session): string {
    const { hostname, rkey } = new AtUri(uri)
    // Your own posts get your handle; other accounts keep their DID, which bsky.app also accepts
    const actor = hostname === session.did ? session.handle : hostname
    return `https://bsky.app/profile/${actor}/post/${rkey}`
}
