/**
 * @file AuthManager — handles Google Identity Services OAuth2 token flow.
 * No DOM access. Reads CONFIG.GOOGLE_CLIENT_ID from config.js.
 */
const AuthManager = (() => {
    let tokenClient = null;
    let accessToken = null;
    let onSignInCallback = null;
    let onSignOutCallback = null;

    function init(onSignIn, onSignOut) {
        onSignInCallback = onSignIn;
        onSignOutCallback = onSignOut;

        if (typeof CONFIG === 'undefined' || !CONFIG.GOOGLE_CLIENT_ID ||
            CONFIG.GOOGLE_CLIENT_ID.startsWith('REPLACE')) {
            console.warn('AuthManager: config.js not found or CLIENT_ID not set. Sign-in disabled.');
            return;
        }

        const STORAGE_KEY = 'salk_signed_in';

        const waitForGIS = setInterval(() => {
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                clearInterval(waitForGIS);
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.GOOGLE_CLIENT_ID,
                    scope: 'https://www.googleapis.com/auth/drive.appdata',
                    callback: (response) => {
                        if (response.error) {
                            console.error('Auth error:', response.error);
                            localStorage.removeItem(STORAGE_KEY);
                            return;
                        }
                        accessToken = response.access_token;
                        localStorage.setItem(STORAGE_KEY, '1');
                        if (onSignInCallback) onSignInCallback(accessToken);
                    },
                    error_callback: (err) => {
                        console.error('Auth error_callback:', err);
                        localStorage.removeItem(STORAGE_KEY);
                    },
                });

                // If user was previously signed in, silently re-acquire token
                if (localStorage.getItem(STORAGE_KEY)) {
                    tokenClient.requestAccessToken({ prompt: '' });
                }
            }
        }, 100);

        // Give up after 10 seconds
        setTimeout(() => clearInterval(waitForGIS), 10000);
    }

    function signIn() {
        if (!tokenClient) {
            console.warn('AuthManager: GIS not initialized.');
            return;
        }
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    function signOut() {
        if (accessToken) {
            google.accounts.oauth2.revoke(accessToken, () => {});
        }
        accessToken = null;
        localStorage.removeItem('salk_signed_in');
        if (onSignOutCallback) onSignOutCallback();
    }

    function getToken() {
        return accessToken;
    }

    function isSignedIn() {
        return !!accessToken;
    }

    function refreshToken() {
        return new Promise((resolve, reject) => {
            if (!tokenClient) return reject(new Error('GIS not initialized'));
            const origCallback = tokenClient.callback;
            tokenClient.callback = (response) => {
                tokenClient.callback = origCallback;
                if (response.error) return reject(new Error(response.error));
                accessToken = response.access_token;
                resolve(accessToken);
            };
            tokenClient.requestAccessToken({ prompt: '' });
        });
    }

    return { init, signIn, signOut, getToken, isSignedIn, refreshToken };
})();
