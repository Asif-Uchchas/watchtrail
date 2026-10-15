# PC bridge for VLC

The bridge is a small Node script that watches VLC on your PC and tells Watchtrail where you are in a file. That gives you:

- **Resume anywhere.** Stop on the PC, press **Resume** on your phone (Android VLC) and it starts 5 seconds earlier.
- **Automatic logging.** When you get through about 92% of an episode it is logged as watched, without a click.
- **Position badges** ("stopped at 20:30") next to files in the FTP listing, if you use the browser helper.

VLC on phones cannot report its position to a website, so on a phone use the **Stopped partway?** box on the show page.

## One-time setup

### 1. Enable VLC's web interface

1. In VLC: **Tools > Preferences**, then at the bottom left choose **Show settings: All**.
2. Go to **Interface > Main interfaces > Lua** and set **Lua HTTP > Password** to anything you like. Leave the other fields alone.
3. Go to **Interface > Control interfaces**. If there is a **Web** checkbox, tick it. If there is none, type `http` in the empty text box at the bottom of that page.
4. Click **Save** and **close VLC completely**, including from the system tray.
5. Reopen VLC and visit <http://localhost:8080> in a browser. You should be asked for a password (leave the username empty). Seeing the VLC web player means it worked.

### 2. Get your token

In Watchtrail, open **Settings** and copy your personal token. It starts with `wt_`.

### 3. Start the bridge

Requires Node.js 18 or newer.

**Windows:** double-click `scripts/watchtrail-bridge.cmd`. The first run asks for your Watchtrail address, token and VLC password, and saves them to `.watchtrail-bridge.json` in your user folder (outside the repository, on your PC only). After that it just starts.

**Any OS, by hand:**

```bash
WATCHTRAIL_URL=https://your-site.vercel.app \
WATCHTRAIL_TOKEN=wt_xxx \
VLC_PASSWORD=yourpass \
node scripts/vlc-bridge.mjs
```

Leave the window open while you watch. It waits for VLC, follows whatever you play, and keeps working across episodes and VLC restarts. Close it when you are done. Nothing is installed or started automatically.

## What it does

Every 5 seconds it reads VLC's status. While something is playing it sends the position to Watchtrail roughly every 15 seconds, and once more when you stop. Watchtrail matches the file to an episode or movie it already knows (by the file's address) and saves the position.

It only tracks streams (`http`, `https`, `ftp`), and only files Watchtrail already knows. Open the episode through Watchtrail, or log it once, so there is something to match.

## Options

| Variable | Default | Meaning |
|---|---|---|
| `WATCHTRAIL_URL` | asked on first run | Your Watchtrail address |
| `WATCHTRAIL_TOKEN` | asked on first run | Personal token from Settings |
| `VLC_PASSWORD` | asked on first run | The Lua HTTP password |
| `VLC_PORT` | `8080` | VLC's web interface port |
| `POLL_SECONDS` | `5` | How often to read VLC |
| `SAVE_EVERY` | `15` | Seconds of playback between saves |

To reset the saved settings, delete `.watchtrail-bridge.json` from your user folder.

## Troubleshooting

- **"Waiting for VLC's web interface"**: VLC is closed, or the web interface is not on. Re-check step 1, and make sure `http://localhost:8080` loads.
- **"VLC rejected the password"**: the password does not match the Lua HTTP password. Delete the saved settings file and run again.
- **"Watchtrail rejected the token"**: copy the token again from Settings. Rotating the token in Settings invalidates the old one.
- **Nothing is saved**: the file is not one Watchtrail knows yet. Play it through Watchtrail's **Play** button, or log it first.
- **Port 8080 is in use**: set `VLC_PORT` to another port and change VLC's port to match.

## Security notes

The bridge only talks to `127.0.0.1` (your own VLC) and to your Watchtrail server. The VLC web interface should keep a password, because anything on your network could otherwise control VLC.
