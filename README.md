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
   node dist/src/index.js
   ```

