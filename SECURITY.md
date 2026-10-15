# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately with GitHub's **Security > Report a vulnerability** on this repository, or email the maintainer at the address on their GitHub profile. Include what you found, how to reproduce it, and the impact you expect. You will get a reply within a few days.

## What is in scope

- Authentication and session handling (`src/lib/auth.ts`).
- Anything that lets one user read or change another user's data.
- The personal API token endpoints under `/api/ext/*`.
- Injection, SSRF or open-redirect issues in the playlist, queue and link-parsing code.

## Good to know

- Watchtrail stores links and metadata only. It does not store video or FTP credentials.
- Each user has a personal API token (`wt_...`). It can read and write only that user's library. Users can rotate it in **Settings**.
- Run your own instance with a strong, unique `AUTH_SECRET`, and set `ALLOW_SIGNUPS=false` once your people have signed up.
