# In Loving Memory of Mrs Magdalene Kubirabe Wandera

Memorial site for Netlify: portrait, rosary, doves, Seneca, Scripture, prayer,
a Garden of Remembrance where visitors place digital flowers, and a message wall
with photos, voice notes and videos added through a password protected family dashboard.

## Structure
- `site/index.html`: the memorial page (fonts and portrait are embedded)
- `netlify/functions/messages.mjs`: message wall (`/api/messages`)
- `netlify/functions/media.mjs`: photo, voice note and video uploads and playback (`/api/media`)
- `netlify/functions/flowers.mjs`: Garden of Remembrance (`/api/flowers`)
- `netlify/lib/shared.mjs`: shared helpers
- Storage: Netlify Blobs (no database to set up)

## One required setting
In Netlify: Site configuration > Environment variables > add `ADMIN_PASSWORD`
with the family password, then redeploy. Without it, nobody can add or remove messages.

## Who can do what
- Everyone: view the page, place flowers (8 per hour per visitor), and write in the Memory Book
  with photos, voice notes and videos (5 messages per hour per visitor).
- Every Memory Book message, including those from the family, waits in an approval queue and
  appears on the wall only after approval.
- With the family password (tap "Family sign in" inside the Memory Book): approve or decline
  waiting messages, remove messages from the wall, and remove flowers (tap a flower while signed in).
  Anyone holding the password can approve, so keep it to yourself if you want to be the only approver.

## Limits
Photos up to 15 MB (resized in the browser), voice notes and audio up to 30 MB,
videos up to 110 MB, 8 photos and 2 videos per message.
