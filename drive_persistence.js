/**
 * @file DriveStorage — Google Drive appDataFolder persistence via REST API.
 * No DOM access. Uses fetch() with bearer token.
 */
const DriveStorage = (() => {
    const FILE_NAME = 'salk_schedule.json';
    const DRIVE_API = 'https://www.googleapis.com/drive/v3';
    const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

    async function apiCall(url, token, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {}),
            },
        });
        if (response.status === 401) {
            throw new Error('TOKEN_EXPIRED');
        }
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Drive API error ${response.status}: ${text}`);
        }
        return response;
    }

    async function findFile(token) {
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            q: `name='${FILE_NAME}'`,
            fields: 'files(id,name)',
        });
        const resp = await apiCall(`${DRIVE_API}/files?${params}`, token);
        const data = await resp.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    async function saveSchedule(token, data) {
        const jsonBody = JSON.stringify(data);
        const existingId = await findFile(token);

        if (existingId) {
            // Update existing file (media upload)
            await apiCall(`${UPLOAD_API}/files/${existingId}?uploadType=media`, token, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: jsonBody,
            });
        } else {
            // Create new file (multipart upload)
            const metadata = {
                name: FILE_NAME,
                parents: ['appDataFolder'],
            };
            const boundary = 'salk_boundary_' + Date.now();
            const body = [
                `--${boundary}`,
                'Content-Type: application/json; charset=UTF-8',
                '',
                JSON.stringify(metadata),
                `--${boundary}`,
                'Content-Type: application/json',
                '',
                jsonBody,
                `--${boundary}--`,
            ].join('\r\n');

            await apiCall(`${UPLOAD_API}/files?uploadType=multipart`, token, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: body,
            });
        }
    }

    async function loadSchedule(token) {
        const fileId = await findFile(token);
        if (!fileId) return null;

        const resp = await apiCall(`${DRIVE_API}/files/${fileId}?alt=media`, token);
        return resp.json();
    }

    async function deleteSchedule(token) {
        const fileId = await findFile(token);
        if (!fileId) return;

        await apiCall(`${DRIVE_API}/files/${fileId}`, token, {
            method: 'DELETE',
        });
    }

    return { saveSchedule, loadSchedule, deleteSchedule };
})();
