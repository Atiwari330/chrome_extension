// options.js - Options page functionality

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('api-key');
    const showApiKeyCheckbox = document.getElementById('show-api-key');
    const showTimestampsCheckbox = document.getElementById('show-timestamps');
    const autoScrollCheckbox = document.getElementById('auto-scroll');
    const saveTranscriptionsCheckbox = document.getElementById('save-transcriptions');
    const logLevelSelect = document.getElementById('log-level');
    const saveBtn = document.getElementById('save-btn');
    const testBtn = document.getElementById('test-btn');
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');
    
    // Load saved settings
    const settings = await chrome.storage.local.get([
        'deepgramApiKey',
        'showTimestamps',
        'autoScroll',
        'saveTranscriptions',
        'logLevel'
    ]);
    
    // Populate form with saved values
    if (settings.deepgramApiKey) {
        apiKeyInput.value = settings.deepgramApiKey;
    }
    
    showTimestampsCheckbox.checked = settings.showTimestamps || false;
    autoScrollCheckbox.checked = settings.autoScroll !== false; // Default true
    saveTranscriptionsCheckbox.checked = settings.saveTranscriptions || false;
    logLevelSelect.value = settings.logLevel || 'INFO';
    
    // Toggle API key visibility
    showApiKeyCheckbox.addEventListener('change', () => {
        apiKeyInput.type = showApiKeyCheckbox.checked ? 'text' : 'password';
    });
    
    // Save settings
    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showError('Please enter a Deepgram API key');
            return;
        }
        
        try {
            await chrome.storage.local.set({
                deepgramApiKey: apiKey,
                showTimestamps: showTimestampsCheckbox.checked,
                autoScroll: autoScrollCheckbox.checked,
                saveTranscriptions: saveTranscriptionsCheckbox.checked,
                logLevel: logLevelSelect.value
            });
            
            showSuccess();
        } catch (error) {
            showError('Failed to save settings: ' + error.message);
        }
    });
    
    // Test API connection
    testBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showError('Please enter an API key to test');
            return;
        }
        
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        
        try {
            // Send request to service worker to test the API key
            const response = await chrome.runtime.sendMessage({
                type: 'TEST_API_KEY',
                apiKey: apiKey
            });
            
            if (response.success) {
                showSuccess('API key is valid! Connection successful.');
            } else {
                showError(response.error || 'Invalid API key. Please check and try again.');
            }
        } catch (error) {
            showError('Connection failed: ' + error.message);
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = 'Test Connection';
        }
    });
    
    function showSuccess(message = 'Settings saved successfully!') {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 3000);
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
        
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }
});

// Add options page to manifest
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Opening options page on first install...');
    }
});