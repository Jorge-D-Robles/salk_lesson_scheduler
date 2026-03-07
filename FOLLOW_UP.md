# Google Sign-In Setup

Before Google Sign-In will work, you need to complete these steps:

## 1. Create a Google Cloud Project

Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.

## 2. Enable the Google Drive API

Navigate to **APIs & Services > Library** and enable the **Google Drive API**.

## 3. Configure the OAuth Consent Screen

Go to **APIs & Services > OAuth consent screen**:

- User type: **External**
- App name: "Salk Music Lesson Scheduler"
- Add scope: `https://www.googleapis.com/auth/drive.appdata`
- Add your Google email as a **test user**

## 4. Create an OAuth 2.0 Client ID

Go to **APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID**:

- Application type: **Web application**
- Authorized JavaScript origins:
  - `http://localhost:8000` (for local development)
  - Your GitHub Pages URL (e.g., `https://yourusername.github.io`)

## 5. Set Up config.js

```bash
cp config.example.js config.js
```

Edit `config.js` and replace the placeholder with your Client ID:

```js
const CONFIG = {
    GOOGLE_CLIENT_ID: 'your-actual-client-id.apps.googleusercontent.com',
};
```

`config.js` is gitignored and will never be committed or pushed.

## Notes

- The app works fully without sign-in. Google Sign-In is optional.
- The `drive.appdata` scope only accesses a hidden app-specific folder in Google Drive, not the user's files.
- While in testing mode, only users added to the OAuth consent screen's test user list can sign in.
