// popup.js - Extension popup functionality

document.addEventListener('DOMContentLoaded', async () => {
    const openMeetBtn = document.getElementById('open-meet');
    const openOptionsBtn = document.getElementById('open-options');
    const statusDiv = document.getElementById('status');
    
    // Check if API key is configured
    const { deepgramApiKey } = await chrome.storage.local.get(['deepgramApiKey']);
    
    if (!deepgramApiKey) {
        statusDiv.className = 'status warning';
        statusDiv.textContent = 'Please configure your Deepgram API key in settings.';
        statusDiv.style.display = 'block';
    }
    
    // Open Google Meet
    openMeetBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://meet.google.com' });
        window.close();
    });
    
    // Open options page
    openOptionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });
    
    // Check if we're on a Meet tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (activeTab.url && activeTab.url.includes('meet.google.com')) {
        statusDiv.className = 'status info';
        statusDiv.textContent = 'Extension is active on this Google Meet tab.';
        statusDiv.style.display = 'block';
    }
});