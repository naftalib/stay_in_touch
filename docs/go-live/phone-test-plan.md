# Phone test plan

About 20 to 30 minutes per phone, on the **test** URL, after the test deploy's post-deploy check has passed. Write the date, the iOS or Android version, and pass or fail in the results table. Do this once at go-live. It is not a CI job.

## iPhone (iOS 16.4 or newer, Safari)

- [ ] Open the test URL in Safari.
- [ ] Share, Add to Home Screen, then open the app from the icon (not from the Safari tab).
- [ ] Sign in.
- [ ] Turn on notifications from the permission card.
- [ ] A second person posts. The notification says who posted and which space, and it does not contain the message text.
- [ ] Tap the notification. It opens that thread.
- [ ] The badge matches the unread count.
- [ ] Leave the app (home screen or app switcher) and have the other person post again. The notification still arrives.
- [ ] Airplane mode: the app shows the offline banner and keeps a draft. It does not send the draft.
- [ ] After a new deploy, the app offers Update. Accept it and confirm the new shell loads.

## Android (Chrome)

The same list as iPhone, plus:

- [ ] The Install card offers to install. Install, then open from the icon.

## VoiceOver (iPhone) and TalkBack (Android)

Walk these with the screen reader on. Every control needs a name you can hear, and you can complete the action without looking.

- [ ] Sign in.
- [ ] Open an invite and join.
- [ ] A thread, and the composer with photos.
- [ ] Pics grid and the viewer.
- [ ] Install help.
- [ ] The notification permission card.
- [ ] Notification settings.
- [ ] The update prompt.

## Results

| Phone | OS | Date | Pass | Notes |
|---|---|---|---|---|
| iPhone | | | | |
| Android | | | | |
| VoiceOver | | | | |
| TalkBack | | | | |
