// Audio Slicer Module
// Fetches the large unit audio once and slices it into smaller blob URLs

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioBufferCache = {};

export async function getSlicedAudioBlobUrl(url, startTime, endTime) {
    if (!audioBufferCache[url]) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        audioBufferCache[url] = await audioContext.decodeAudioData(arrayBuffer);
    }
    
    const buffer = audioBufferCache[url];
    const sampleRate = buffer.sampleRate;
    const startOffset = Math.max(0, Math.floor(startTime * sampleRate));
    const endOffset = Math.min(buffer.length, Math.floor(endTime * sampleRate));
    const frameCount = endOffset - startOffset;
    
    const newBuffer = audioContext.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        const newChannelData = newBuffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            newChannelData[i] = channelData[startOffset + i];
        }
    }
    
    return audioBufferToWavURL(newBuffer);
}

function audioBufferToWavURL(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2;
    const bufferArr = new ArrayBuffer(44 + length);
    const view = new DataView(bufferArr);
    
    const sampleRate = buffer.sampleRate;
    let pos = 0;
    
    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
    
    setUint32(0x46464952); // "RIFF"
    setUint32(36 + length); 
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); 
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data"
    setUint32(length);
    
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const channel = buffer.getChannelData(i);
        let offset = 0;
        while (offset < buffer.length) {
            let sample = Math.max(-1, Math.min(1, channel[offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            // interleaved logic if multiple channels, but simple loop if 1 channel 
            // wait, if multiple channels we must interleave!
            view.setInt16(pos, sample, true);
            pos += 2;
            offset++;
        }
    }
    
    // Proper interleaved loop if numOfChan > 1
    if (numOfChan > 1) {
        pos = 44; // reset pos to data
        let offset = 0;
        while (offset < buffer.length) {
            for (let i = 0; i < numOfChan; i++) {
                const channel = buffer.getChannelData(i);
                let sample = Math.max(-1, Math.min(1, channel[offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }
    }
    
    const blob = new Blob([bufferArr], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}
