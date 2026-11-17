import { AppBskyFeedPost, AppBskyFeedLike, AtUri, AppBskyFeedRepost, ComAtprotoRepoListRecords } from '@atproto/api'
import { Followers } from './followers'
import { Sticky } from './sticky'
import { loadConfig, saveConfig, login } from './config'

type ListRecord = ComAtprotoRepoListRecords.Record

const config = loadConfig()

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
    const { agent, did: session_did, handle: session_handle } = await login(config)

    // Sticky posts (and the pinned post), with all replies under them, are never deleted
    const sticky = new Sticky(agent)
    const keep = await sticky.collect(session_did)
    sticky.close()
    let kept = 0
    // Likes and reposts kept because they are on a sticky thread
    const keptOn: Record<string, number> = { like: 0, repost: 0 }
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
            // The post this like is on
            subject : (record:ListRecord) :string => {
                const like = record.value as AppBskyFeedLike.Record
                return like.subject.uri
            },
            type : 'like' as CounterKey
        },
        {
            name: 'app.bsky.feed.repost',
            resolver : (record:ListRecord) :Date => {
                const repost = record.value as AppBskyFeedRepost.Record
                return new Date(repost.createdAt)
            },
            // The post this repost is of
            subject : (record:ListRecord) :string => {
                const repost = record.value as AppBskyFeedRepost.Record
                return repost.subject.uri
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
                    if (keep.has(record.uri)) {
                        kept++
                        continue
                    }
                    // Likes and reposts of posts in sticky threads are kept too
                    const subject = collection.subject?.(record)
                    if (subject !== undefined && keep.has(subject)) {
                        keptOn[collection.type]++
                        continue
                    }
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
    if (kept > 0) {
        output.push(`Kept ${kept} sticky posts.`)
    }
    if (keptOn.like > 0 || keptOn.repost > 0) {
        output.push(`Kept ${keptOn.like} likes and ${keptOn.repost} reposts on sticky posts.`)
    }
    
    // Fetch follower changes
    const followers = new Followers(agent)
    const changes = await followers.fetchChanges(config.previousFollowers)
    followers.close()

    // Save the new follower count to config
    config.previousFollowers = changes.totalFollowers
    saveConfig(config)

    output.push(`You have ${changes.totalFollowers} followers.`)
    if (changes.followersDelta !== undefined && changes.followersDelta !== 0) {
        const sign = changes.followersDelta > 0 ? '+' : ''
        output.push(`${sign}${changes.followersDelta} since last run.`)
    }
    output.push(`${changes.newFollowers} new, ${changes.unfollowed} unfollowed you.`)

    if (changes.newFollowers > 0) {
        const names = changes.newFollowersSummary.map(f => 
            f.displayName 
                ? `${f.displayName} - https://bsky.app/profile/${f.handle}`
                : `https://bsky.app/profile/${f.handle}`
        )
        output.push('New followers:<br/>' + names.join('<br/>'))
    }

    if (changes.unfollowed > 0) {
        const names = changes.unfollowedSummary.map(f => 
            f.displayName 
                ? `${f.displayName} - https://bsky.app/profile/${f.handle}`
                : `https://bsky.app/profile/${f.handle}`
        )
        output.push('Unfollowed you:<br/>' + names.join('<br/>'))
    }

    console.log(output.join('<br/>'))
}