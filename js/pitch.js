// Pitch Detection Module
// Calculates pitch points every 5ms

export async function computePitchCurve(audioUrl) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Fetch and decode audio
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const float32Array = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // 5ms = 0.005 seconds
    const stepSize = Math.floor(sampleRate * 0.005);
    const windowSize = Math.floor(sampleRate * 0.04); // 40ms window for low frequencies
    
    const pitches = [];
    for (let i = 0; i < float32Array.length - windowSize; i += stepSize) {
        const window = float32Array.slice(i, i + windowSize);
        const pitch = autoCorrelate(window, sampleRate);
        pitches.push({ time: i / sampleRate, pitch: pitch });
    }
    
    return pitches;
}

// Chris Wilson's pitch detection algorithm
function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
        let val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return null; // Not enough signal

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }

    let d = 0; 
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    
    let T0 = maxpos;
    if (T0 <= 0) return null;

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    const pitch = sampleRate / T0;
    
    // Filter out logically invalid human voice pitches (e.g. above 400Hz or below 50Hz)
    if (pitch > 400 || pitch < 50) return null;
    
    return pitch;
}

export function drawPitchCurve(canvas, pitches, duration) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);

    if (!pitches || pitches.length === 0) return;

    // Draw pitch curve
    ctx.beginPath();
    ctx.strokeStyle = '#0000FF'; // Blue
    ctx.lineWidth = 2;
    
    let firstPoint = true;
    
    pitches.forEach(p => {
        if (p.pitch !== null) {
            const x = (p.time / duration) * width;
            // Map 0-400Hz to canvas (inverted because y=0 is top)
            const y = height - ((p.pitch / 400) * height);
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        } else {
            firstPoint = true; // Break the line
        }
    });
    
    ctx.stroke();

    // Hover effect for exact values
    const hoverDiv = document.createElement('div');
    hoverDiv.style.position = 'absolute';
    hoverDiv.style.color = '#000080'; // Navy Blue
    hoverDiv.style.fontWeight = 'bold';
    hoverDiv.style.pointerEvents = 'none';
    hoverDiv.style.display = 'none';
    hoverDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    hoverDiv.style.padding = '2px 4px';
    hoverDiv.style.borderRadius = '4px';
    hoverDiv.style.fontSize = '12px';
    
    // Make sure container is relative and add hover div
    const container = canvas.parentElement;
    if (!container.querySelector('.pitch-hover')) {
        hoverDiv.className = 'pitch-hover';
        container.appendChild(hoverDiv);
        
        container.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            
            // Find closest time point
            const timeAtMouse = (mouseX / width) * duration;
            let closest = null;
            let minDiff = Infinity;
            
            pitches.forEach(p => {
                if (p.pitch !== null) {
                    const diff = Math.abs(p.time - timeAtMouse);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = p;
                    }
                }
            });
            
            if (closest && minDiff < 0.1) { // within 100ms
                const px = (closest.time / duration) * width;
                const py = height - ((closest.pitch / 400) * height);
                
                hoverDiv.textContent = Math.round(closest.pitch) + ' Hz';
                hoverDiv.style.left = (px) + 'px';
                hoverDiv.style.top = (py - 20) + 'px';
                hoverDiv.style.display = 'block';
            } else {
                hoverDiv.style.display = 'none';
            }
        });
        
        container.addEventListener('mouseleave', () => {
            hoverDiv.style.display = 'none';
        });
    }
}
