// Audio Player and Recorder Module
// Handles audio playback, recording, and visualization (Waveform/Pitch curve)

import { computePitchCurve, drawPitchCurve } from './pitch.js';
import { getSlicedAudioBlobUrl } from './audio-slicer.js';

const PITCH_AXIS_LABELS = [400, 350, 300, 250, 200, 150, 100, 70, 50, 40, 0];
let waveSurferModule = null;

async function loadWaveSurfer() {
    if (!waveSurferModule) {
        waveSurferModule = await import('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js');
    }

    return waveSurferModule.default;
}

function createPitchAxis() {
    const yAxis = document.createElement('div');
    yAxis.style.display = 'flex';
    yAxis.style.flexDirection = 'column';
    yAxis.style.justifyContent = 'space-between';
    yAxis.style.fontSize = '8px';
    yAxis.style.padding = '2px 4px';
    yAxis.style.color = '#555';
    yAxis.style.backgroundColor = 'rgba(255,255,255,0.7)';
    yAxis.style.borderRight = '1px solid #ccc';
    yAxis.style.zIndex = '15';
    yAxis.innerHTML = PITCH_AXIS_LABELS.map(freq => `<span>${freq}Hz</span>`).join('');
    return yAxis;
}

export class AudioPlayer {
    constructor(options = {}) {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.currentRecordingId = null;
        this.visualizationEnabled = options.visualizationEnabled !== false;
        
        // Cache object to store wavesurfer instances
        this.wavesurfers = {};
        this.recordWavesurfers = {};
        
        // Custom simple audio player fallback if Wavesurfer not used for quiz
        this.simpleAudios = {};
    }

    setVisualizationEnabled(isEnabled) {
        this.visualizationEnabled = isEnabled === true;
    }
    
    // Initialize wavesurfers for original samples
    initializeWavesurfers() {
        if (!this.visualizationEnabled) return;

        const greyMap = [];
        for (let i = 0; i < 256; i++) {
            const v = (255 - i) / 255;
            greyMap.push([v, v, v, 1]);
        }

        const waveforms = document.querySelectorAll('.waveform');
        waveforms.forEach(async el => {
            const id = el.id.replace('waveform-', '');
            const src = el.getAttribute('data-src');
            const startStr = el.getAttribute('data-start');
            const endStr = el.getAttribute('data-end');
            const voice = el.getAttribute('data-voice') || 'neutral';
            
            if (src && !this.wavesurfers[id]) {
                this.wavesurfers[id] = 'loading'; // prevent double init
                
                let finalUrl = src;
                if (startStr && endStr && startStr !== 'null' && endStr !== 'null' && startStr !== '' && endStr !== '') {
                    try {
                        finalUrl = await getSlicedAudioBlobUrl(src, parseFloat(startStr), parseFloat(endStr));
                    } catch (err) {
                        console.error('Slicing failed:', err);
                    }
                }

                // Ensure container structure is right for overlaying pitch and axis
                el.style.position = 'relative';
                el.style.display = 'flex';
                
                el.appendChild(createPitchAxis());
                
                const wavesurferContainer = document.createElement('div');
                wavesurferContainer.style.flex = '1';
                wavesurferContainer.style.position = 'relative';
                wavesurferContainer.style.overflow = 'hidden';
                el.appendChild(wavesurferContainer);
                
                const canvas = document.createElement('canvas');
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.pointerEvents = 'none'; // let clicks pass through to wavesurfer
                canvas.style.zIndex = '10'; // ensure above graph
                wavesurferContainer.appendChild(canvas);
                
                let WaveSurfer;
                try {
                    WaveSurfer = await loadWaveSurfer();
                } catch (error) {
                    console.error('Could not load visualization library:', error);
                    wavesurferContainer.innerHTML = `<div style="text-align:center; padding-top:15px; color:var(--text-secondary);">圖像載入失敗</div>`;
                    return;
                }

                const ws = WaveSurfer.create({
                    container: wavesurferContainer,
                    waveColor: 'transparent',
                    progressColor: 'rgba(0, 0, 0, 0.1)',
                    cursorColor: '#333',
                    // Optional: remove height explicitly so it fills the parent completely
                    // height: 60,
                });
                
                ws.on('ready', async () => {
                    const duration = ws.getDuration();
                    const rect = wavesurferContainer.getBoundingClientRect();
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                    
                    try {
                        const pitches = await computePitchCurve(finalUrl);
                        canvas.style.pointerEvents = 'auto'; // allow hover
                        drawPitchCurve(canvas, pitches, duration, voice);
                    } catch (e) {
                        console.error('Error drawing pitch curve:', e);
                    }
                });

                ws.on('error', (err) => {
                    console.log('Wavesurfer failed to load file:', finalUrl, err);
                });

                ws.load(finalUrl).catch(e => {
                    console.warn("Could not load audio file: " + finalUrl, e);
                    wavesurferContainer.innerHTML = `<div style="text-align:center; padding-top:15px; color:var(--text-secondary);">錄音未找到</div>`;
                });
                this.wavesurfers[id] = ws;
            }
        });
    }

    // Play standard audio (with wavesurfer if available, otherwise native)
    async playAudio(audioId, src, startTime, endTime) {
        // Stop currently playing
        Object.values(this.wavesurfers).forEach(ws => {
            if (ws && ws !== 'loading' && typeof ws.isPlaying === 'function' && ws.isPlaying()) ws.pause();
        });
        Object.values(this.recordWavesurfers).forEach(ws => {
            if (ws && ws !== 'loading' && typeof ws.isPlaying === 'function' && ws.isPlaying()) ws.pause();
        });
        Object.values(this.simpleAudios).forEach(audio => {
            if (audio && typeof audio.pause === 'function') audio.pause();
        });
        
        // If it's a quiz option or similar without a wavesurfer container
        if (!this.wavesurfers[audioId] && src) {
            let finalUrl = src;
            if (startTime !== undefined && endTime !== undefined && startTime !== null && endTime !== null) {
                finalUrl = await getSlicedAudioBlobUrl(src, startTime, endTime);
            }
            if (!this.simpleAudios[audioId]) {
                this.simpleAudios[audioId] = new Audio(finalUrl);
            }
            this.simpleAudios[audioId].currentTime = 0;
            this.simpleAudios[audioId].play().catch(e => {
                alert('播放失敗，請檢查錄音檔案：' + src);
            });
            return;
        }

        const ws = this.wavesurfers[audioId];
        if (ws && ws !== 'loading' && typeof ws.playPause === 'function') {
            ws.playPause();
        }
    }
    
    // Start/Stop recording audio
    async recordAudio(audioId) {
        if (this.isRecording) {
            if (this.currentRecordingId === audioId) {
                this.stopRecording();
                return;
            } else {
                this.stopRecording();
                // Wait briefly before starting a new one
                await new Promise(r => setTimeout(r, 300));
            }
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                } 
            });
            
            this.startRecording(stream, audioId);
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.showStatus(audioId, '無法存取麥克風設備', 'error');
        }
    }
    
    startRecording(stream, audioId) {
        this.audioChunks = [];
        this.currentRecordingId = audioId;
        this.isRecording = true;
        
        const options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/mp4';
        }
        
        this.mediaRecorder = new MediaRecorder(stream, options);
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            this.handleRecordingComplete(stream, audioId);
        };
        
        this.mediaRecorder.start();
        
        this.showStatus(audioId, '🎤 錄音中... (再次點擊以停止)', 'recording');
        this.updateRecordButton(audioId, true);
    }
    
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.isRecording = false;
        this.mediaRecorder.stop();
    }
    
    handleRecordingComplete(stream, audioId) {
        stream.getTracks().forEach(track => track.stop());
        
        const audioBlob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder.mimeType 
        });
        
        const audioUrl = URL.createObjectURL(audioBlob);
        
        this.updateRecordButton(audioId, false);
        this.showStatus(
            audioId,
            this.visualizationEnabled ? '✓ 錄音完成！點擊播放對比波形' : '✓ 錄音完成！點擊播放錄音',
            'success'
        );
        
        this.renderRecordedAudio(audioId, audioUrl);
    }

    async renderRecordedAudio(audioId, audioUrl) {
        if (!this.visualizationEnabled) {
            this.renderRecordedAudioOnly(audioId, audioUrl);
            return;
        }

        const container = document.getElementById(`spectrogram-container-${audioId}`);
        const specDiv = document.getElementById(`spectrogram-${audioId}`);
        
        if (container && specDiv) {
            container.classList.remove('hidden');
            specDiv.innerHTML = ''; // clear previous
            
            specDiv.style.position = 'relative';
            specDiv.style.display = 'flex';
            
            specDiv.appendChild(createPitchAxis());
            
            const wavesurferContainer = document.createElement('div');
            wavesurferContainer.style.flex = '1';
            wavesurferContainer.style.position = 'relative';
            wavesurferContainer.style.overflow = 'hidden';
            specDiv.appendChild(wavesurferContainer);
            
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '10'; // Ensure it overlaps graph
            wavesurferContainer.appendChild(canvas);

            let WaveSurfer;
            try {
                WaveSurfer = await loadWaveSurfer();
            } catch (error) {
                console.error('Could not load visualization library:', error);
                wavesurferContainer.innerHTML = `<div style="text-align:center; padding-top:15px; color:var(--text-secondary);">圖像載入失敗</div>`;
                return;
            }
            
            const ws = WaveSurfer.create({
                container: wavesurferContainer,
                waveColor: 'transparent',
                progressColor: 'rgba(0, 0, 0, 0.1)',
                cursorColor: '#333',
            });
            ws.load(audioUrl);
            this.recordWavesurfers[audioId] = ws;
            
            ws.on('ready', async () => {
                const duration = ws.getDuration();
                const rect = wavesurferContainer.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
                
                try {
                    const pitches = await computePitchCurve(audioUrl);
                    canvas.style.pointerEvents = 'auto'; // allow hover
                    drawPitchCurve(canvas, pitches, duration);
                } catch(e) {
                    console.error(e);
                }
            });
            
            let playbackDiv = document.getElementById(`playback-${audioId}`);
            if (!playbackDiv) {
                playbackDiv = document.createElement('div');
                playbackDiv.id = `playback-${audioId}`;
                playbackDiv.style.marginTop = 'var(--spacing-sm)';
                playbackDiv.style.display = 'block'; // Make sure there is clear layout flow
                playbackDiv.style.clear = 'both';
                
                // Moved playback button outside spectrogram so it doesn't block
                const playBtn = document.createElement('button');
                playBtn.className = 'btn-icon';
                playBtn.style.backgroundColor = '#F3AB63';
                playBtn.style.color = 'white';
                playBtn.style.width = '100%'; // Spans correctly under
                playBtn.style.justifyContent = 'center';
                playBtn.innerHTML = '🎧';
                playBtn.onclick = () => {
                    if (this.recordWavesurfers[audioId]) {
                        this.recordWavesurfers[audioId].playPause();
                    }
                };
                
                playbackDiv.appendChild(playBtn);
                container.appendChild(playbackDiv);
            }
        }
    }

    renderRecordedAudioOnly(audioId, audioUrl) {
        const container = document.getElementById(`recording-playback-container-${audioId}`);
        if (!container) return;

        const recordingKey = `recording-${audioId}`;
        this.simpleAudios[recordingKey] = new Audio(audioUrl);

        container.classList.remove('hidden');
        container.innerHTML = '';

        const playBtn = document.createElement('button');
        playBtn.className = 'btn-icon audio-only-playback-btn';
        playBtn.innerHTML = '🎧';
        playBtn.onclick = () => {
            Object.values(this.simpleAudios).forEach(audio => {
                if (audio && typeof audio.pause === 'function') audio.pause();
            });
            this.simpleAudios[recordingKey].currentTime = 0;
            this.simpleAudios[recordingKey].play().catch(() => {
                alert('播放錄音失敗');
            });
        };

        container.appendChild(playBtn);
    }
    
    updateRecordButton(audioId, isRecording) {
        const statusDiv = document.getElementById(`recording-status-${audioId}`);
        if (!statusDiv) return;
        const itemDiv = statusDiv.parentElement;
        const btns = itemDiv.querySelectorAll(`button[data-record-button="${audioId}"], button`);
        
        btns.forEach(btn => {
            if (btn.dataset.recordButton === audioId || btn.textContent.includes('錄音') || btn.textContent.includes('停止')) {
                if (isRecording) {
                    btn.classList.add('recording');
                    btn.innerHTML = '⏹️ 停止錄音';
                } else {
                    btn.classList.remove('recording');
                    btn.innerHTML = btn.dataset.defaultLabel || '🎤 對比錄音';
                }
            }
        });
    }
    
    showStatus(audioId, message, type = 'info') {
        const statusDiv = document.getElementById(`recording-status-${audioId}`);
        if (!statusDiv) return;
        
        statusDiv.classList.remove('hidden');
        statusDiv.textContent = message;
        
        statusDiv.style.color = type === 'error' ? 'var(--error)' : 
                                 type === 'success' ? 'var(--success)' : 
                                 type === 'recording' ? 'var(--primary-color)' :
                                 'var(--text-secondary)';
        
        statusDiv.style.fontWeight = type === 'recording' ? '600' : 'normal';
    }
}

export default AudioPlayer;
