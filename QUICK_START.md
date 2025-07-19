# Quick Start Guide

Your Deepgram API key has been provided. Here's how to get started:

## 1. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Turn on "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the folder: `C:\Users\atiwa\OneDrive\Desktop\chrome extension test 2`

## 2. Configure Your API Key

Option A - Through Extension Popup:
1. Click the extension icon in Chrome toolbar
2. Click "Settings"
3. Paste your API key: `ea2f05e0565364f93936d157fc4b7d20ac06691b`
4. Click "Save Settings"
5. Click "Test Connection" to verify

Option B - First Use:
1. Go to Google Meet
2. When the floating widget appears, click the settings icon
3. Enter your API key and save

## 3. Start Using It

1. Open or join a Google Meet session: https://meet.google.com
2. Look for the blue floating widget (top-left by default)
3. Click "Start Recording"
4. Grant microphone permission when prompted
5. You should see:
   - Audio level indicators for Mic and Tab
   - Separate transcription areas for "You" and "Others"

## Troubleshooting First Run

If the widget doesn't appear:
- Refresh the Google Meet page
- Make sure you're in an active meeting (not the lobby)

If no transcription appears:
- Check the logs section (bottom of widget)
- Verify your API key is saved (check in extension settings)
- Make sure microphone permission was granted

## Important Notes

- The extension only works on Google Meet pages
- First time use will show a permission dialog for microphone
- The permission dialog should say "Google Meet Real-Time Transcription wants to use your microphone"
- Tab audio capture happens automatically when you start recording

## Testing Your Setup

1. Join a test meeting
2. Start recording
3. Say something - it should appear under "You"
4. Play a YouTube video in another tab, then return to Meet
5. Any audio from the Meet tab should appear under "Others"

Your API key is: ea2f05e0565364f93936d157fc4b7d20ac06691b

Ready to go! Load the extension and start transcribing.