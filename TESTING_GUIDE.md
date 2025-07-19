# Google Meet Transcription Extension - Testing Guide

## Current Issues Fixed
1. ✅ Fixed ArrayBuffer serialization issue - now using base64 encoding
2. ✅ Added proper WebSocket initialization for microphone
3. ✅ Enhanced button click handling in Shadow DOM
4. ✅ Made floating widget more visible with border and stronger shadow
5. ✅ Added comprehensive logging for transcription updates

## Testing Steps

### 1. Reload the Extension
1. Go to `chrome://extensions/`
2. Click the refresh button on your extension
3. Check the service worker logs by clicking "Inspect views: service worker"

### 2. Set Your API Key
1. Right-click the extension icon and select "Options"
2. Enter your Deepgram API key: `ea2f05e0565364f93936d157fc4b7d20ac06691b`
3. Click "Save API Key"
4. You should see "API key saved!" message

### 3. Join a Google Meet
1. Go to https://meet.google.com/
2. Start or join a meeting
3. Wait for the floating widget to appear (should be more visible now with blue border)

### 4. Start Recording
1. Click the "Start Recording" button in the floating widget
2. Grant microphone permission if prompted
3. The button should change to "Stop Recording" and turn red
4. The status indicator should start pulsing green

### 5. Check Console Logs
Open the browser console (F12) and look for:
- `[Content] Microphone stream obtained`
- `[AudioProcessor] PCM data received from user`
- `[Service Worker] WebSocket connected for user`
- `[Service Worker] Sent audio chunk to user socket`
- `[FloatingUI] Updating transcription` (when you speak)

### 6. Debug Commands
Run these in the console if needed:

```javascript
// Check if service worker has API key
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, console.log);

// Test transcription display manually
chrome.runtime.sendMessage({
    type: 'TRANSCRIPTION_UPDATE',
    source: 'user',
    text: 'Test transcription appears here',
    isFinal: true
});

// Check current audio levels
window.logger.getLogs({ component: 'AudioProcessor' });
```

### 7. What to Look For
- Audio level indicators should move when you speak
- Console should show PCM data being sent to service worker
- Service worker should show WebSocket connection to Deepgram
- Transcriptions should appear in the "You" section when you speak

### 8. If Transcriptions Still Don't Appear
1. Check service worker logs for WebSocket errors
2. Verify the API key is loaded (look for "[Service Worker] API key loaded successfully")
3. Make sure you're speaking clearly near the microphone
4. Check if audio data is reaching Deepgram (look for "Sent audio chunk" messages)

### 9. Known Issues
- Tab audio capture requires additional permissions
- Buttons might need a second click sometimes due to Shadow DOM event propagation
- First transcription might take a few seconds to appear

## Quick Troubleshooting

### Widget Not Visible
- Refresh the page
- Check if you're in a meeting (not just on meet.google.com)
- Look for a blue-bordered white box in the top-left area

### Buttons Not Working
- Try clicking directly on the button text
- Use the manual trigger from console:
  ```javascript
  document.querySelector('#meet-transcription-container').shadowRoot
    .querySelector('#start-stop-btn').click();
  ```

### No Transcriptions
- Check service worker logs for API key and WebSocket status
- Verify microphone permission is granted
- Speak louder and clearer
- Check console for any error messages

### Audio Not Captured
- Make sure microphone is not muted in Google Meet
- Check system microphone permissions
- Try a different browser tab

## Next Steps
If issues persist after following this guide, please share:
1. Screenshot of the console logs
2. Service worker logs
3. Any error messages you see