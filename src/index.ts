import { AtpAgent, AppBskyFeedPost, AppBskyFeedLike, AtUri, AppBskyFeedRepost } from '@atproto/api'
import type { Record as ListRecord } from '@atproto/api/src/client/types/com/atproto/repo/listRecords'
import { Followers } from './followers'
import * as fs from 'fs'
import * as path from 'path'

// Config file is in the project root (parent of dist)
const CONFIG_PATH = path.join(__dirname, '../config.json')

interface ConfigFile {
    handle: string
    password: string
    service: string
    days: number
    previousFollowers?: number
}

const config: ConfigFile = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))

const USER = config.handle
const PASS = config.password
const SERVICE = config.service
const DAYS = config.days 

const OLDEST = new Date()
OLDEST.setDate(OLDEST.getDate() - DAYS)


main()
    .then(() => {
        // Successfully logged in
    })
    .catch((err) => {
        console.error("Error during login:", err);
    });

async function main(){
    const agent = new AtpAgent({ service: SERVICE })
    await agent.login({
        identifier: USER,
        password: PASS
    })
    const session_did = agent.session?.did
    if (!session_did) {
        throw new Error("Failed to log in, did is undefined")
    }
    const session_handle = agent.session?.handle
    if (!session_handle) {
        throw new Error("Failed to log in, handle is undefined")
    }
    const collections = [
        {
            name: 'app.bsky.feed.post',
            resolver : (record:ListRecord) :Date => {
                const post = record.value as AppBskyFeedPost.Record
                return new Date(post.createdAt)
            },
            type : 'post' as CounterKey
        },
        {
            name: 'app.bsky.feed.like',
            resolver : (record:ListRecord) :Date => {
                const like = record.value as AppBskyFeedLike.Record
                return new Date(like.createdAt)
            },
            type : 'like' as CounterKey
        },
        {
            name: 'app.bsky.feed.repost',
            resolver : (record:ListRecord) :Date => {
                const repost = record.value as AppBskyFeedRepost.Record
                return new Date(repost.createdAt)
            },
            type : 'repost' as CounterKey
        }
    ]
    type CounterKey = 'like' | 'post' | 'repost';
    const counter: Record<CounterKey, number> = { like: 0, post: 0, repost: 0 };


    for (const collection of collections) {
        let res = await agent.com.atproto.repo.listRecords({
            repo: session_did,
            limit: 100,
            reverse: true,
            collection: collection.name
        })
        let done = false
        while (res.success && res.data.records.length > 0){
            for (const record of res.data.records) {
                let date = collection.resolver(record)
                if (date !== undefined && date < OLDEST){
                    const at_uri = new AtUri(record.uri)
                    await agent.com.atproto.repo.deleteRecord({
                        repo: session_handle,
                        collection: collection.name,
                        rkey: at_uri.rkey
                    })
                    counter[collection.type]++
                } else {
                    done = true
                    break
                }
            }
            if (done ){
                break
            }
            res = await agent.com.atproto.repo.listRecords({
                repo: session_did,
                limit: 100,
                reverse: true,
                collection: collection.name,
                cursor: res.data.cursor
            })
    }
        
    }
    const output: string[] = []
    
    output.push(`Deleted ${counter.like} likes, ${counter.post} posts, and ${counter.repost} reposts.`)
    
    // Fetch follower changes
    const followers = new Followers(agent)
    const changes = await followers.fetchChanges(config.previousFollowers)
    await followers.close()

    // Save the new follower count to config
    config.previousFollowers = changes.totalFollowers
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4))

    output.push(`You have ${changes.totalFollowers} followers.`)
    if (changes.followersDelta !== undefined && changes.followersDelta !== 0) {
        const sign = changes.followersDelta > 0 ? '+' : ''
        output.push(`${sign}${changes.followersDelta} since last run.`)
    }
    output.push(`${changes.newFollowers} new, ${changes.unfollowed} unfollowed you.`)

    if (changes.newFollowers > 0) {
        const names = changes.newFollowersSummary.map(f => f.displayName || f.handle)
        const remaining = changes.newFollowers - names.length
        let line = 'New followers: ' + names.join(', ')
        if (remaining > 0) {
            line += ` and ${remaining} more.`
        }
        output.push(line)
    }

    if (changes.unfollowed > 0) {
        const names = changes.unfollowedSummary.map(f => f.displayName || f.handle)
        const remaining = changes.unfollowed - names.length
        let line = 'Unfollowed you: ' + names.join(', ')
        if (remaining > 0) {
            line += ` and ${remaining} more.`
        }
        output.push(line)
    }

    console.log(output.join('<br/>'))
}

