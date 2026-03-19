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
    
    const rawPitchValues = pitches.map(p => p.pitch);
    
    const cleanedPitchValues = removePitchOutliers(rawPitchValues, {
        minHz: 50,
        maxHz: 400,
        windowSize: 5,   // Look at neighbors
        minRatio: 0.97,  // Max drop of 3%
        maxRatio: 1.03   // Max jump of 3%
    });
    
    const cleanedPitches = pitches.map((p, index) => ({
        time: p.time,
        pitch: cleanedPitchValues[index]
    }));
    
    return cleanedPitches;
}

/**
 * Helper function to calculate the median of an array, ignoring nulls
 */
function getMedian(arr) {
    // Filter out nulls and sort numerically
    const sorted = arr.filter(x => x !== null && !isNaN(x)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    
    const mid = Math.floor(sorted.length / 2);
    // If even number of items, average the middle two
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2.0;
    }
    // If odd, return the exact middle
    return sorted[mid];
}

/**
 * Removes pitch outliers using global bounds and local ratio comparisons.
 * 
 * @param {number[]} pitches - Array of detected F0 values
 * @param {Object} options - Configuration thresholds
 * @returns {Array} Cleaned array with outliers replaced by null
 */
function removePitchOutliers(pitches, options = {}) {
    // Default thresholds (configurable)
    const minHz = options.minHz || 70;
    const maxHz = options.maxHz || 800;
    const windowSize = options.windowSize || 3; // Number of neighbors to look at
    
    // Ratio limits (e.g., 0.80 means a 20% drop, 1.20 means a 20% jump)
    const minRatio = options.minRatio || 0.80; 
    const maxRatio = options.maxRatio || 1.20;

    // Step 1: Global Range Filter
    // Discard biologically impossible frequencies right away
    const globallyFiltered = pitches.map(p => {
        if (p === null || p < minHz || p > maxHz) return null;
        return p;
    });

    const cleanedPitches = [];
    const halfWindow = Math.floor(windowSize / 2);

    // Step 2 & 3: Local Median & Ratio Check
    for (let i = 0; i < globallyFiltered.length; i++) {
        const currentPitch = globallyFiltered[i];
        
        // If it was already eliminated by the global filter, push null and move on
        if (currentPitch === null) {
            cleanedPitches.push(null);
            continue;
        }

        // Gather valid neighbors within our window
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(globallyFiltered.length - 1, i + halfWindow);
        const windowValues = [];
        
        for (let j = start; j <= end; j++) {
            if (globallyFiltered[j] !== null) {
                windowValues.push(globallyFiltered[j]);
            }
        }

        // Find the local median of this specific neighborhood
        // EXCLUDE the current pitch itself from the neighborhood median calculation
        // so that an extreme outlier doesn't skew the local median it's being compared to
        const neighborhoodValues = windowValues.filter(v => v !== currentPitch || windowValues.filter(x => x === currentPitch).length > 1);
        let localMedian = getMedian(neighborhoodValues);
        
        // If there's no neighborhood left (e.g. isolated point), use current pitch as median (ratio = 1)
        if (localMedian === null) {
            localMedian = currentPitch;
        }

        // Calculate the ratio of the current pitch to its neighborhood's median
        const ratio = currentPitch / localMedian;

        // If the pitch jumps up or drops down by too high a percentage, it's an error
        if (ratio > maxRatio || ratio < minRatio) {
            cleanedPitches.push(null);
        } else {
            // Otherwise, keep the original untouched value
            cleanedPitches.push(currentPitch);
        }
    }

    return cleanedPitches;
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
    
    return Math.round(pitch * 100) / 100;
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
        
        // Calculate 15 evenly spaced time points across the sonorant (valid pitch) segment
        const validPitches = pitches.filter(p => p.pitch !== null);
        let sonorantPoints = [];
        
        if (validPitches.length > 0) {
            const startT = validPitches[0].time;
            const endT = validPitches[validPitches.length - 1].time;
            
            for (let i = 0; i < 15; i++) {
                const targetTime = startT + (endT - startT) * (i / 14);
                
                // Find nearest actual pitch point to this target time
                let nearest = validPitches[0];
                let minTDiff = Infinity;
                for (const vp of validPitches) {
                    const diff = Math.abs(vp.time - targetTime);
                    if (diff < minTDiff) {
                        minTDiff = diff;
                        nearest = vp;
                    }
                }
                
                sonorantPoints.push({
                    time: targetTime, // Hover aligns to the perfectly spaced grid
                    pitch: nearest.pitch // But uses the actual nearest valid pitch value
                });
            }
        }
        
        container.addEventListener('mousemove', (e) => {
            if (sonorantPoints.length === 0) return;

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            
            // Map mouse to file time
            const timeAtMouse = (mouseX / rect.width) * duration;
            
            // Find closest out of the 15 sonorant points
            let closest = sonorantPoints[0];
            let minDiff = Math.abs(closest.time - timeAtMouse);
            
            for (let i = 1; i < sonorantPoints.length; i++) {
                const diff = Math.abs(sonorantPoints[i].time - timeAtMouse);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = sonorantPoints[i];
                }
            }
            
            // Show hover if mouse is somewhat near the valid range
            if (minDiff < 0.2) { 
                const px = (closest.time / duration) * rect.width;
                const py = rect.height - ((closest.pitch / 400) * rect.height);
                
                hoverDiv.textContent = Math.round(closest.pitch) + ' Hz';
                hoverDiv.style.left = px + 'px';
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
