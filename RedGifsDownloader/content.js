function createDownloadButton(videoId) {
    const li = document.createElement('li');
    li.className = 'sideBarItem';

    const button = document.createElement('button');
    button.className = 'FSButton redgifs-download-btn';
    button.setAttribute('aria-label', 'download');
    button.setAttribute('data-video-id', videoId);
    button.style.cssText = `
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.9;
        height: 40px;
        width: 40px;
        margin: 0;
        outline: none;
    `;

    // Check if the video was already downloaded
    const downloads = JSON.parse(localStorage.getItem('redgifsDownloads') || '{}');
    const isDownloaded = !!downloads[videoId];

    // Set the button style based on whether the video was downloaded
    if (isDownloaded) {
        button.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17L4 12"
                      stroke="#4CAF50"
                      stroke-width="2.2"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
        `;
        button.title = 'Already downloaded';
    } else {
        button.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                      stroke="currentColor"
                      stroke-width="2.0"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
        `;
        button.title = 'Download video';
    }

    li.appendChild(button);
    return { li, button };
}

function addDownloadButton() {
    const previewContainers = document.querySelectorAll('.GifPreview');

    previewContainers.forEach(container => {
        const sidebarUl = container.querySelector('ul.sideBar');
        if (!sidebarUl || sidebarUl.querySelector('.redgifs-download-btn')) return;

        const videoId = container.id.replace('gif_', '');
        if (!videoId) return;

        const { li, button } = createDownloadButton(videoId);

        button.addEventListener('click', async () => {
            try {
                button.disabled = true;

                // Send a message to the background script to handle the download
                chrome.runtime.sendMessage({ action: 'downloadVideo', videoId }, (response) => {
                    if (response && response.success) {
                        // Mark the video as downloaded
                        const downloads = JSON.parse(localStorage.getItem('redgifsDownloads') || '{}');
                        downloads[videoId] = {
                            timestamp: Date.now(),
                            creator: response.creator
                        };
                        localStorage.setItem('redgifsDownloads', JSON.stringify(downloads));

                        // Update the button style
                        button.innerHTML = `
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17L4 12"
                                      stroke="#4CAF50"
                                      stroke-width="2.5"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"/>
                            </svg>
                        `;
                        button.title = 'Already downloaded';
                    } else {
                        alert('Download failed: ' + (response ? response.error : 'Unknown error'));
                    }
                    button.disabled = false;
                });
            } catch (error) {
                console.error('Error:', error);
                button.disabled = false;
            }
        });

        // Insert as the first item in the sidebar
        sidebarUl.insertBefore(li, sidebarUl.firstChild);
    });
}

// Initial run with a delay to ensure page is loaded
setTimeout(addDownloadButton, 1000);

// Run when scrolling (debounced)
let scrollTimeout;
window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(addDownloadButton, 200);
});

// Watch for new videos being added
const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        if (mutation.addedNodes.length) {
            setTimeout(addDownloadButton, 100);
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});