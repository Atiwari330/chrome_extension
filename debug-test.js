// debug-test.js - Run this in the browser console when on a Google Meet page

console.log('=== Google Meet Transcription Extension Debug Test ===');

// Test 1: Check if extension is loaded
console.log('\n1. Extension Check:');
const container = document.getElementById('meet-transcription-container');
console.log('- Container found:', !!container);
if (container) {
    console.log('- Shadow root exists:', !!container.shadowRoot);
    const widget = container.shadowRoot?.getElementById('floating-widget');
    console.log('- Widget found:', !!widget);
    console.log('- Widget visible:', widget?.style.display !== 'none');
}

// Test 2: Check audio processor
console.log('\n2. Audio Processor Check:');
console.log('- window.logger exists:', !!window.logger);
console.log('- window.AudioProcessor exists:', !!window.AudioProcessor);

// Test 3: Test manual transcription start
console.log('\n3. Manual Start Test:');
console.log('Run this to manually start transcription:');
console.log(`
// Get the content script instance
const container = document.getElementById('meet-transcription-container');
const floatingUI = container?.__floatingUI;
if (floatingUI) {
    floatingUI.toggleRecording();
} else {
    console.error('FloatingUI not found');
}
`);

// Test 4: Test service worker connection
console.log('\n4. Service Worker Test:');
console.log('Run this to test service worker connection:');
console.log(`
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    console.log('Service worker response:', response);
});
`);

// Test 5: Send test transcription
console.log('\n5. Test Transcription Display:');
console.log('Run this to test transcription display:');
console.log(`
// Simulate a transcription update
chrome.runtime.sendMessage({
    type: 'TRANSCRIPTION_UPDATE',
    source: 'user',
    text: 'This is a test transcription',
    isFinal: true
});
`);

console.log('\n=== End of Debug Test ===');