# Watchtrail

Remember every episode and movie you watch from FTP servers (Circle FTP and other BDIX / h5ai file servers), and pick up where you left off on your phone or your PC.

Paste the link you'd normally open in VLC. Watchtrail works out the show, season and episode from the link, logs it, and gives you a **Play next** button that opens the following episode in VLC and logs it in one tap. It stores links only, never video.

## Features

- **Paste any link**: episode files (`house.s02e05...mkv`, `2x05`, `Season 2/05.mkv`), movie files, or show folders. A live preview shows what was detected before you save.
- **Play next**: guesses the next episode's link from the last one, opens it in VLC and logs it. The season folder is always one click away for the end of a season.
- **Works on every device**:
  - Android opens VLC directly; the app installs to the home screen and appears in the **Share** menu.
  - iPhone/iPad opens VLC via its URL scheme.
  - Desktop downloads a one-line `.m3u` that VLC opens.
- **Set your place**: log "I'm at S04E10" for shows you started before Watchtrail. Watchtrail builds the link for that episode from any other one it knows, including switching season folders.
- Show statuses (Watching, On hold, Finished, Dropped), search, a movie watchlist, a day-by-day history, and undo on every log.
- Accounts, so friends can use the same server with their own lists.
- Optional posters from TMDB.
- **Episode list** per season with TMDB titles and summaries (shown only for episodes you have reached, so no spoilers), a tick to log or un-log any episode, and Play on each row.
- **Real file names, learned**: with the browser helper (Settings), every folder page you open teaches Watchtrail the exact file name of each episode. Play uses those, so shows whose file names contain the episode title still work.
- **Resume where you stopped**: type "stopped at 21:30" on the show page, and Play / Resume starts 5 seconds earlier (desktop playlists and Android VLC; iOS VLC has no start-time option).
- **New-episode badges** for shows that are still airing, refreshed from TMDB about twice a day.
- **Queue 5**: a playlist of the next five episodes for VLC on desktop.
- **Star ratings** for shows.

## PC bridge for VLC (optional)

`scripts/vlc-bridge.mjs` watches VLC on your PC and tells Watchtrail where you are in a file, so the position is saved automatically and a finished episode is logged without clicking anything. VLC on phones cannot report this, so on a phone use "stopped at" by hand.

1. In VLC: Tools > Preferences > Show settings: All. Under Interface > Main interfaces > Lua, set an HTTP password. Under Interface > Control interfaces, tick **Web**, or if there is no such box, type `http` into the empty extra-modules field. Restart VLC and check that http://localhost:8080 asks for the password.
2. Double-click `scripts/watchtrail-bridge.cmd`. The first time it asks for your Watchtrail address, your token (Settings) and the VLC password, and remembers them in `~/.watchtrail-bridge.json` on that PC. Or run it by hand (Node 18+):

```bash
WATCHTRAIL_URL=https://your-site.vercel.app WATCHTRAIL_TOKEN=wt_xxx VLC_PASSWORD=yourpass node scripts/vlc-bridge.mjs
```

It only tracks streams (http, https, ftp) and only files Watchtrail already knows.

## Run it locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET (command is in the file)
npm run build
npm start                    # http://localhost:3000
```

For development with hot reload use `npm run dev`.

The database is a single SQLite file at `data/watchtrail.db`, created automatically on first start. Back it up by copying that file.

### Use it from your phone on the same Wi-Fi

`npm start` prints a **Network** address such as `http://192.168.0.107:3000`. Open it on your phone. If it doesn't load, allow Node.js through Windows Firewall for private networks.

Installing to the home screen and the Share-menu integration need **https**, so they work once deployed (below), not on the plain LAN address.

## Deploy it to share with others (free)

1. **Database**: create a free database at [turso.tech](https://turso.tech), then copy its URL (`libsql://…`) and an auth token.
2. **Hosting**: push this folder to GitHub and import it on [vercel.com](https://vercel.com).
3. In Vercel's project settings, add these environment variables:
   - `AUTH_SECRET`: a new random value
   - `DATABASE_URL` and `DATABASE_AUTH_TOKEN`: from Turso
   - optionally `TMDB_API_KEY` for posters
4. Deploy. Tables are created on first request.

To keep the server private after your friends have signed up, set `ALLOW_SIGNUPS=false`.

The hosted site never talks to the FTP servers. Your device does the streaming, so links that only work on BDIX still play when you are on your ISP's network.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | yes | Signs login sessions. 32+ random characters. |
| `DATABASE_URL` | no | `file:data/watchtrail.db` (default) or a `libsql://` Turso URL. |
| `DATABASE_AUTH_TOKEN` | with Turso | Turso auth token. |
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | no | Poster artwork. |
| `ALLOW_SIGNUPS` | no | Set to `false` to close registration. |

## Project layout

```
src/lib/parse.ts        link parsing, next-episode guessing (pure, client + server)
src/lib/schema.ts       tables (Drizzle) + bootstrap SQL
src/lib/library.ts      all reads/writes for shows, episodes, movies, history
src/lib/auth.ts         signed-cookie sessions
src/lib/play.ts         how each platform hands a link to VLC
src/app/actions.ts      server actions used by the UI
src/app/(app)/          signed-in pages: shows, show detail, movies, history, help
src/app/(auth)/         sign in / sign up
src/app/share/          Android share-sheet target
src/app/api/playlist/   .m3u for desktop VLC
scripts/check-parser.ts quick parser check: node scripts/check-parser.ts
```
