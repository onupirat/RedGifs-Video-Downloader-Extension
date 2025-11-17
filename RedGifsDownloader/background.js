async function getAuthToken() {
    console.log('Attempting to get auth token...');
    return new Promise((resolve, reject) => {
        fetch('https://api.redgifs.com/v2/auth/temporary', {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        })
            .then(response => {
                console.log('Auth response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Auth response data:', data);
                if (data && data.token) {
                    console.log('Token received successfully');
                    resolve(data.token);
                } else {
                    reject(new Error('No token in response'));
                }
            })
            .catch(error => {
                console.error('Auth token fetch error:', error);
                reject(error);
            });
    });
}

async function getVideoUrl(videoId) {
    console.log('Getting video URL for:', videoId);
    const token = await getAuthToken();
    const url = `https://api.redgifs.com/v2/gifs/${videoId}`;

    console.log('Fetching video info from:', url);
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
    });

    console.log('Video API response status:', response.status);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('API response data:', data);
    console.log('Full gif object:', data.gif);

    const videoUrl = data.gif?.urls?.hd || data.gif?.urls?.sd || data.gif?.urls?.mp4 || data.gif?.urls?.webm;
    
    // Try multiple possible properties for creator name
    const creator = data.gif?.userName || data.gif?.username || data.gif?.user?.name || data.gif?.user?.username || data.gif?.creator || 'unknown';
    
    // Use video ID as title instead of description (descriptions often contain spam/links)
    const title = videoId;

    console.log('Extracted video URL:', videoUrl);
    console.log('Creator (from various fields):', creator);
    console.log('All user-related fields:', {
        userName: data.gif?.userName,
        username: data.gif?.username,
        user: data.gif?.user,
        creator: data.gif?.creator
    });
    console.log('Title (raw):', title);

    if (!videoUrl) {
        console.error('No video URL found. Available URLs:', data.gif?.urls);
        throw new Error('No video URL found in API response');
    }

    return { url: videoUrl, creator: creator, title: title };
}

const sanitizeFilename = (filename) => {
    // Remove or replace all invalid filename characters
    let sanitized = filename
        .replace(/[/\\?%*:|"<>]/g, '_')  // Replace invalid chars with underscore
        .replace(/\s+/g, ' ')              // Replace multiple spaces with single space
        .replace(/^\.+/, '')               // Remove leading dots
        .trim();                           // Trim whitespace
    
    // Limit filename length (Windows has 255 char limit, but being safer)
    if (sanitized.length > 200) {
        sanitized = sanitized.substring(0, 200);
    }
    
    // If filename is empty after sanitization, use a default
    if (!sanitized || sanitized.length === 0) {
        sanitized = 'video';
    }
    
    console.log('Sanitized filename:', sanitized);
    return sanitized;
};

const downloadIdToFilename = new Map();

// IMPORTANT: This listener MUST be registered synchronously at the top level
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    console.log('onDeterminingFilename triggered for download ID:', downloadItem.id);
    console.log('Current filename:', downloadItem.filename);
    
    const customFilename = downloadIdToFilename.get(downloadItem.id);
    if (customFilename) {
        console.log('Overriding filename to:', customFilename);
        suggest({ filename: customFilename, conflictAction: 'uniquify' });
        downloadIdToFilename.delete(downloadItem.id);
        return true; // Important for async
    } else {
        console.log('No custom filename found, using default');
        suggest();
        return false;
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadVideo') {
        const { videoId } = request;
        console.log('Download requested for video ID:', videoId);

        getVideoUrl(videoId)
            .then(({ url, creator, title }) => {
                // Filename format: [creator] - videoId.mp4
                const desiredFilename = sanitizeFilename(`[${creator}] - ${title}.mp4`);

                console.log('Generated filename:', desiredFilename);
                console.log('Download URL:', url);
                console.log('Storing filename for download...');

                chrome.downloads.download({
                    url: url,
                    saveAs: false
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message || JSON.stringify(chrome.runtime.lastError);
                        console.error('Download error:', errorMsg);
                        sendResponse({ success: false, error: errorMsg });
                    } else if (downloadId) {
                        console.log('Download started with ID:', downloadId);
                        // Store the custom filename IMMEDIATELY for this download
                        downloadIdToFilename.set(downloadId, desiredFilename);
                        console.log('Stored filename mapping:', downloadId, '->', desiredFilename);
                        console.log('Current map size:', downloadIdToFilename.size);
                        sendResponse({ success: true, creator: creator });
                    } else {
                        console.error('Download failed - no download ID returned');
                        sendResponse({ success: false, error: 'Download failed - no download ID' });
                    }
                });
            })
            .catch((error) => {
                console.error('Error in download process:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Keep message port open for async response
    }
});