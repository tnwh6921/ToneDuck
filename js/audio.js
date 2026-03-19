// Audio Player and Recorder Module
// Handles audio playback, recording, and visualization (Waveform/Spectrogram)

import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js';
import Spectrogram from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/spectrogram.esm.js';
import { computePitchCurve, drawPitchCurve } from './pitch.js';

export class AudioPlayer {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.currentRecordingId = null;
        
        // Cache object to store wavesurfer instances
        this.wavesurfers = {};
        this.recordWavesurfers = {};
        
        // Custom simple audio player fallback if Wavesurfer not used for quiz
        this.simpleAudios = {};
    }
    
    // Initialize wavesurfers for original samples
    initializeWavesurfers() {
        const greyMap = [];
        for (let i = 0; i < 256; i++) {
            const v = (255 - i) / 255;
            greyMap.push([v, v, v, 1]);
        }

        const waveforms = document.querySelectorAll('.waveform');
        waveforms.forEach(el => {
            const id = el.id.replace('waveform-', '');
            const src = el.getAttribute('data-src');
            
            if (src && !this.wavesurfers[id]) {
                // Ensure container structure is right for overlaying pitch and axis
                el.style.position = 'relative';
                el.style.display = 'flex';
                
                // Add Y-Axis for 0-400Hz
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
                yAxis.innerHTML = '<span>400Hz</span><span>200Hz</span><span>0Hz</span>';
                el.appendChild(yAxis);
                
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
                canvas.style.zIndex = '10'; // ensure above spectrogram
                wavesurferContainer.appendChild(canvas);
                
                const ws = WaveSurfer.create({
                    container: wavesurferContainer,
                    waveColor: 'transparent',
                    progressColor: 'rgba(0, 0, 0, 0.1)',
                    cursorColor: '#333',
                    height: 60,
                    plugins: [
                        Spectrogram.create({
                            labels: false,
                            height: 60,
                            splitChannels: false,
                            colorMap: greyMap
                        })
                    ]
                });
                
                ws.on('ready', async () => {
                    const duration = ws.getDuration();
                    const rect = wavesurferContainer.getBoundingClientRect();
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                    
                    try {
                        const pitches = await computePitchCurve(src);
                        canvas.style.pointerEvents = 'auto'; // allow hover
                        drawPitchCurve(canvas, pitches, duration);
                    } catch (e) {
                        console.error('Error drawing pitch curve:', e);
                    }
                });

                ws.on('error', (err) => {
                    console.log('Wavesurfer failed to load file:', src, err);
                });

                ws.load(src).catch(e => {
                    console.warn("Could not load audio file: " + src, e);
                    wavesurferContainer.innerHTML = `<div style="text-align:center; padding-top:15px; color:var(--text-secondary);">錄音未找到</div>`;
                });
                this.wavesurfers[id] = ws;
            }
        });
    }

    // Play standard audio (with wavesurfer if available, otherwise native)
    async playAudio(audioId, src) {
        // Stop currently playing
        Object.values(this.wavesurfers).forEach(ws => {
            if (ws.isPlaying()) ws.pause();
        });
        Object.values(this.recordWavesurfers).forEach(ws => {
            if (ws.isPlaying()) ws.pause();
        });
        
        // If it's a quiz option or similar without a wavesurfer container
        if (!this.wavesurfers[audioId] && src) {
            if (!this.simpleAudios[audioId]) {
                this.simpleAudios[audioId] = new Audio(src);
            }
            this.simpleAudios[audioId].currentTime = 0;
            this.simpleAudios[audioId].play().catch(e => {
                alert('播放失敗，請檢查錄音檔案：' + src);
            });
            return;
        }

        const ws = this.wavesurfers[audioId];
        if (ws) {
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
        this.showStatus(audioId, '✓ 錄音完成！點擊播放對比波形', 'success');
        
        this.renderRecordedAudio(audioId, audioUrl);
    }

    renderRecordedAudio(audioId, audioUrl) {
        const container = document.getElementById(`spectrogram-container-${audioId}`);
        const specDiv = document.getElementById(`spectrogram-${audioId}`);
        
        if (container && specDiv) {
            container.classList.remove('hidden');
            specDiv.innerHTML = ''; // clear previous
            
            specDiv.style.position = 'relative';
            specDiv.style.display = 'flex';
            
            // Add Y-Axis for 0-400Hz
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
            yAxis.innerHTML = '<span>400Hz</span><span>200Hz</span><span>0Hz</span>';
            specDiv.appendChild(yAxis);
            
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
            canvas.style.zIndex = '10'; // Ensure it overlaps spectrogram
            wavesurferContainer.appendChild(canvas);
            
            const greyMap = [];
            for (let i = 0; i < 256; i++) {
                const v = (255 - i) / 255;
                greyMap.push([v, v, v, 1]);
            }
            
            const ws = WaveSurfer.create({
                container: wavesurferContainer,
                waveColor: 'transparent',
                progressColor: 'rgba(0, 0, 0, 0.1)',
                cursorColor: '#333',
                height: 60,
                plugins: [
                    Spectrogram.create({
                        labels: false,
                        height: 60,
                        splitChannels: false,
                        colorMap: greyMap
                    })
                ]
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
                playBtn.style.backgroundColor = '#FFA500'; // Bright orange
                playBtn.style.color = 'white';
                playBtn.style.width = '100%'; // Spans correctly under
                playBtn.innerHTML = '▶️ 播放錄音';
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
    
    updateRecordButton(audioId, isRecording) {
        const statusDiv = document.getElementById(`recording-status-${audioId}`);
        if (!statusDiv) return;
        const itemDiv = statusDiv.parentElement;
        const btns = itemDiv.querySelectorAll('button');
        
        btns.forEach(btn => {
            if (btn.textContent.includes('錄音') || btn.textContent.includes('停止')) {
                if (isRecording) {
                    btn.classList.add('recording');
                    btn.innerHTML = '⏹️ 停止錄音';
                } else {
                    btn.classList.remove('recording');
                    btn.innerHTML = '🎤 對比錄音';
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
