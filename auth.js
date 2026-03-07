/**
 * @file AuthManager — handles Google Identity Services OAuth2 flows.
 * Uses google.accounts.id (ID token) for session persistence via auto_select,
 * and google.accounts.oauth2 (access token) for Drive API access.
 * Access token is cached in sessionStorage to survive page refreshes.
 * No DOM access. Reads CONFIG.GOOGLE_CLIENT_ID from config.js.
 */
const AuthManager = (() => {
    const PROFILE_KEY = 'salk_profile';
    const TOKEN_KEY = 'salk_token';
    let tokenClient = null;
    let accessToken = null;
    let onIdentifiedCallback = null;
    let onAccessTokenCallback = null;
    let onSignOutCallback = null;

    function init(onIdentified, onAccessToken, onSignOut) {
        onIdentifiedCallback = onIdentified;
        onAccessTokenCallback = onAccessToken;
        onSignOutCallback = onSignOut;

        if (typeof CONFIG === 'undefined' || !CONFIG.GOOGLE_CLIENT_ID ||
            CONFIG.GOOGLE_CLIENT_ID.startsWith('REPLACE')) {
            console.warn('AuthManager: config.js not found or CLIENT_ID not set. Sign-in disabled.');
            return;
        }

        // Restore token from sessionStorage (survives page refresh within same tab)
        const storedToken = sessionStorage.getItem(TOKEN_KEY);
        if (storedToken) {
            accessToken = storedToken;
            const profile = getStoredProfile();
            if (profile && onIdentifiedCallback) onIdentifiedCallback(profile);
            // Verify the token is still valid by triggering auto-load
            if (onAccessTokenCallback) onAccessTokenCallback(accessToken);
        }

        const waitForGIS = setInterval(() => {
            if (typeof google !== 'undefined' && google.accounts &&
                google.accounts.oauth2 && google.accounts.id) {
                clearInterval(waitForGIS);

                // Token client for Drive API access
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.GOOGLE_CLIENT_ID,
                    scope: 'https://www.googleapis.com/auth/drive.appdata',
                    callback: (response) => {
                        if (response.error) {
                            console.error('Token error:', response.error);
                            return;
                        }
                        accessToken = response.access_token;
                        sessionStorage.setItem(TOKEN_KEY, accessToken);
                        if (onAccessTokenCallback) onAccessTokenCallback(accessToken);
                    },
                    error_callback: (err) => {
                        console.error('Token error:', err);
                    },
                });

                // ID client for session persistence — only needed if we don't
                // already have a token (i.e. new tab or session expired)
                if (!accessToken) {
                    google.accounts.id.initialize({
                        client_id: CONFIG.GOOGLE_CLIENT_ID,
                        callback: handleCredential,
                        auto_select: true,
                    });
                    google.accounts.id.prompt();
                }
            }
        }, 100);

        setTimeout(() => clearInterval(waitForGIS), 10000);
    }

    function handleCredential(response) {
        let profile;
        try {
            const payload = JSON.parse(atob(response.credential.split('.')[1]));
            profile = { name: payload.name || payload.email, picture: payload.picture || '' };
        } catch (e) {
            console.error('Failed to decode credential:', e);
            return;
        }
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        if (onIdentifiedCallback) onIdentifiedCallback(profile);
        // Don't request access token here — it requires a user gesture.
        // User will click "Sign in with Google" or a Drive button to get one.
    }

    function signIn() {
        if (!tokenClient) {
            console.warn('AuthManager: GIS not initialized.');
            return;
        }
        tokenClient.requestAccessToken({ prompt: '' });
    }

    function signOut() {
        if (accessToken) {
            google.accounts.oauth2.revoke(accessToken, () => {});
        }
        accessToken = null;
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(PROFILE_KEY);
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.disableAutoSelect();
        }
        if (onSignOutCallback) onSignOutCallback();
    }

    function getToken() {
        return accessToken;
    }

    function isSignedIn() {
        return !!accessToken;
    }

    function getStoredProfile() {
        try {
            return JSON.parse(localStorage.getItem(PROFILE_KEY));
        } catch {
            return null;
        }
    }

    function ensureAccessToken() {
        if (accessToken) return Promise.resolve(accessToken);
        return new Promise((resolve, reject) => {
            if (!tokenClient) return reject(new Error('GIS not initialized'));
            const origCallback = tokenClient.callback;
            tokenClient.callback = (response) => {
                tokenClient.callback = origCallback;
                if (response.error) return reject(new Error(response.error));
                accessToken = response.access_token;
                sessionStorage.setItem(TOKEN_KEY, accessToken);
                resolve(accessToken);
            };
            tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    function refreshToken() {
        accessToken = null;
        sessionStorage.removeItem(TOKEN_KEY);
        return ensureAccessToken();
    }

    return { init, signIn, signOut, getToken, isSignedIn, getStoredProfile, ensureAccessToken, refreshToken };
})();
