# Quick Setup Guide - Google Meet Transcription Extension

## ✅ Changes Made

1. **Fixed API Key Loading**
   - Service worker now reloads API key when starting transcription
   - Added RELOAD_API_KEY message handler
   - Shows clear error when API key is missing

2. **Fixed Audio Data Transfer**
   - Added proper error handling for base64 decoding
   - Added validation for audio data messages

3. **Added Connection Status Display**
   - Status indicator shows connection state (connecting, connected, error, disconnected)
   - Real-time status updates in the floating widget

4. **Improved API Key Setup**
   - Inline error message when API key is missing
   - Immediate save and reload of API key

## 🚀 Setup Steps

### 1. Set Your API Key
You have two options:

**Option A - Via Extension Icon:**
1. Right-click the extension icon in Chrome toolbar
2. Select "Options"
3. Enter your API key: `ea2f05e0565364f93936d157fc4b7d20ac06691b`
4. Click "Save Settings"

**Option B - Via Floating Widget:**
1. Click the "Settings" button (gear icon) in the floating widget
2. Enter your API key in the text field
3. Click "Save"

### 2. Reload the Extension
1. Go to `chrome://extensions/`
2. Find "Google Meet Real-Time Transcription"
3. Click the refresh button

### 3. Test Transcription
1. Join or start a Google Meet
2. Wait for the floating widget to appear
3. Click "Start Recording"
4. Speak clearly - you should see:
   - Green status indicator (connected)
   - Audio level bars moving
   - Your transcriptions appearing in the "You" section

## 🔍 Troubleshooting

### If you see "API key required!" error:
- Follow Step 1 above to set your API key
- Make sure to save the key
- Reload the extension

### If transcriptions don't appear:
1. Check the status indicator color:
   - Gray = Not connected
   - Orange = Connecting
   - Green = Connected
   - Red = Error

2. Open Chrome DevTools (F12) and check console for errors

3. Check service worker logs:
   - Go to `chrome://extensions/`
   - Click "Inspect views: service worker"
   - Look for connection messages

### If audio levels don't show:
- Make sure your microphone is not muted in Google Meet
- Check browser microphone permissions

## 📝 Console Commands for Testing

```javascript
// Check if API key is saved
chrome.storage.local.get(['deepgramApiKey'], (result) => {
    console.log('API key exists:', !!result.deepgramApiKey);
});

// Test transcription display
chrome.runtime.sendMessage({
    type: 'TRANSCRIPTION_UPDATE',
    source: 'user',
    text: 'Test transcription message',
    isFinal: true
});

// Check service worker status
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, console.log);
```

## ✨ What's Working Now

- ✅ API key storage and loading
- ✅ WebSocket connection to Deepgram
- ✅ Audio capture and processing
- ✅ Connection status display
- ✅ Error handling and user feedback
- ✅ Transcription display in UI

Ready to test! Follow the setup steps above and you should see transcriptions appearing.