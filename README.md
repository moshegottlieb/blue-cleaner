# blue-cleaner

Cleanup your bluesky posts.  
I use this with crontab to delete my old posts.  
It will delete posts, likes and reposts.  
Start by creating an app password for your account, and then copy the config.json.sample to a new config.json file, and edit it.  
Here is the sample config file, I'm sure you can figure out how to use it.  
`days` is the number of days to keep old posts, so 90 would mean it would delete posts older than 90 days.  

```json
{
    "handle" : "my-handle",
    "password" : "thepasswordis12345",
    "service" : "https://bsky.social",
    "days" : 90
}
```

# Important

* This will delete your posts, likes and reposts. You cannot undo that.
* There is no guarantee of any kind
* There is no rate control, so if you have a lot of stuff to delete, you will run into rate limits

## Getting Started

1. Create `config.json` and edit it, you may want to copy `config.json.example` to start out
1. Create the database:
   ```bash
   ./create_db.sh
   ```
1. Install dependencies:
   ```bash
   npm install
   ```
1. Build the project:
   ```bash
   npm run build
   ```
1. Run the project:
   ```bash
   npm start
   ```
   or
   ```bash
   node dist/index.js
   ```

## Sticky posts

Sticky posts are never deleted, and neither are any replies under them (including replies added after the post was stuck).  
Your likes and reposts of a sticky post, or of any reply under it, are kept as well.  
Your pinned post, if you have one, is always treated as sticky.  
Use the post URL as it appears on bsky.app:

```bash
npm run stick "https://bsky.app/profile/my-handle/post/3abcdefghijkl"
npm run unstick "https://bsky.app/profile/my-handle/post/3abcdefghijkl"
npm run sticky-list
```

`unstick` also removes any stuck posts under the given post.  
If you're upgrading from an older version, run `./create_db.sh` again to add the `sticky` table to your existing database.

The new Swift project [Sky Cleaner](https://github.com/moshegottlieb/Sky-Cleaner) replaces this project.
