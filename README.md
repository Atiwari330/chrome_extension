# Google Meet Real-Time Transcription Chrome Extension

A Chrome extension that provides real-time transcription for Google Meet with separate audio streams for your microphone and other participants.

## Setup Instructions

### 1. Get a Deepgram API Key
1. Sign up at [Deepgram Console](https://console.deepgram.com/)
2. Create a new API key
3. Keep it ready for configuration

### 2. Install the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select this extension directory

### 3. Configure the Extension
1. Click on the extension icon in Chrome toolbar
2. Click "Settings" or go to the extension options page
3. Enter your Deepgram API key
4. Click "Save Settings"

### 4. Using the Extension
1. Open or join a Google Meet session
2. The extension will automatically detect the meeting
3. A floating transcription widget will appear
4. Click "Start Recording" to begin transcription
5. You'll see separate transcriptions for:
   - **You**: Your microphone input
   - **Others**: Audio from other participants

## Features
- Real-time transcription with low latency
- Separate transcription streams for clarity
- Floating, draggable UI that stays visible
- Audio level indicators
- Comprehensive logging for debugging
- Export transcriptions and logs

## Troubleshooting

### Microphone Permission
- On first use, the extension will request microphone access
- Make sure to click "Allow" when prompted
- If you accidentally denied, go to Chrome settings → Privacy and security → Site settings → Microphone

### No Transcription Appearing
1. Check that your Deepgram API key is valid (use "Test Connection" in settings)
2. Open the logs section in the floating widget
3. Look for any error messages
4. Make sure you're in an active Google Meet session

### Tab Audio Not Working
- Ensure you're on the Google Meet tab when starting recording
- Check that the tab isn't muted in Chrome
- Some Bluetooth headsets may interfere with tab audio capture

## Technical Details
- Uses AudioWorklet for ultra-low latency (<3ms)
- Streams PCM audio to Deepgram via WebSocket
- Implements MV3 service worker with keepalive
- Shadow DOM for UI isolation

## Privacy
- All transcription is processed by Deepgram
- No audio or transcriptions are stored by the extension
- Your API key is stored locally in Chrome storage

## Support
For issues or questions, check the logs in the floating widget and export them for debugging.