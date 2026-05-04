// Pitch Detection Module
// Calculates and cleans pitch points every 5ms.

const PITCH_CONFIG = {
    minPitch: 50,
    maxPitch: 360,
    maxCandidatePitch: 420,
    displayMaxPitch: 400,
    frameStepSeconds: 0.005,
    windowSeconds: 0.05,
    minRms: 0.006,
    yinThreshold: 0.14,
    minConfidence: 0.78,
    lowPitchConfidence: 0.66,
    lowPitchCutoff: 115,
    octaveSuspectPitch: 275,
    octaveCorrectionMarginSemitones: 4,
    maxHighFragmentSeconds: 0.12,
    medianWindowPoints: 7,
    maxMedianDeviationSemitones: 3.5,
    maxLowMedianDeviationSemitones: 7,
    maxFrameJumpSemitones: 1.8,
    maxLowFrameJumpSemitones: 3,
    maxInterpolatedGapSeconds: 0.08,
    minRiseBeforeTailTrimSemitones: 2.2,
    minPostRiseTailSeconds: 0.04,
    maxDetachedPostRiseTailSeconds: 0.16,
    maxDetachedPostRiseGapSeconds: 0.14,
    minDetachedPostRiseDropSemitones: 3,
    minDrawableSegmentPoints: 3,
    smoothingWindowPoints: 11
};

export async function computePitchCurve(audioUrl) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Fetch and decode audio
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const float32Array = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    const stepSize = Math.floor(sampleRate * PITCH_CONFIG.frameStepSeconds);
    const windowSize = Math.floor(sampleRate * PITCH_CONFIG.windowSeconds);
    
    const pitches = [];
    for (let i = 0; i < float32Array.length - windowSize; i += stepSize) {
        const window = float32Array.slice(i, i + windowSize);
        const candidate = detectPitchCandidate(window, sampleRate);
        pitches.push({
            time: i / sampleRate,
            pitch: candidate ? candidate.pitch : null,
            confidence: candidate ? candidate.confidence : 0,
            rms: candidate ? candidate.rms : 0
        });
    }
    
    return cleanPitchTrack(pitches);
}

function detectPitchCandidate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    let mean = 0;

    for (let i = 0; i < SIZE; i++) {
        mean += buf[i];
    }
    mean /= SIZE;

    const windowed = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
        const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (SIZE - 1)));
        const val = (buf[i] - mean) * hann;
        windowed[i] = val;
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < PITCH_CONFIG.minRms) return null;

    const minLag = Math.max(2, Math.floor(sampleRate / PITCH_CONFIG.maxCandidatePitch));
    const maxLag = Math.min(SIZE - 2, Math.ceil(sampleRate / PITCH_CONFIG.minPitch));
    const difference = new Float32Array(maxLag + 1);

    for (let lag = 1; lag <= maxLag; lag++) {
        let sum = 0;
        for (let i = 0; i < SIZE - lag; i++) {
            const delta = windowed[i] - windowed[i + lag];
            sum += delta * delta;
        }
        difference[lag] = sum;
    }

    let runningSum = 0;
    let bestLag = -1;
    let bestValue = Infinity;

    for (let lag = 1; lag <= maxLag; lag++) {
        runningSum += difference[lag];
        difference[lag] = runningSum === 0 ? 1 : (difference[lag] * lag) / runningSum;

        if (lag >= minLag && difference[lag] < bestValue) {
            bestValue = difference[lag];
            bestLag = lag;
        }
    }

    for (let lag = minLag; lag <= maxLag; lag++) {
        if (difference[lag] < PITCH_CONFIG.yinThreshold) {
            while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) {
                lag++;
            }
            bestLag = lag;
            bestValue = difference[lag];
            break;
        }
    }
    
    if (bestLag <= 0) return null;

    const refinedLag = parabolicMinimum(difference, bestLag);
    const pitch = sampleRate / refinedLag;
    const confidence = 1 - Math.max(0, Math.min(1, bestValue));

    if (!isCandidatePitchInRange(pitch) || confidence < getMinConfidenceForPitch(pitch)) return null;

    return { pitch, confidence, rms };
}

function parabolicMinimum(values, index) {
    const left = values[index - 1];
    const center = values[index];
    const right = values[index + 1];
    const denominator = left + right - 2 * center;
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return index;
    return index + (left - right) / (2 * denominator);
}

function cleanPitchTrack(points) {
    const octaveCorrected = correctOctaveErrors(points);
    const rangeFiltered = octaveCorrected.map(p => ({
        ...p,
        pitch: isPitchInRange(p.pitch) && p.confidence >= getMinConfidenceForPitch(p.pitch) ? p.pitch : null
    }));

    const highFragmentFiltered = rejectShortHighFragments(rangeFiltered);
    const postRiseTrimmed = trimPostRiseTails(highFragmentFiltered);
    const medianFiltered = rejectMedianOutliers(postRiseTrimmed);
    const jumpFiltered = rejectAbruptJumps(medianFiltered);
    const interpolated = interpolateShortGaps(jumpFiltered);
    return enforceSmoothJumps(smoothPitchTrack(interpolated));
}

function correctOctaveErrors(points) {
    return points.map((point, index) => {
        if (point.pitch === null || point.pitch < PITCH_CONFIG.octaveSuspectPitch) return point;

        const halvedPitch = point.pitch / 2;
        if (!isPitchInRange(halvedPitch)) {
            return { ...point, pitch: null, rejected: 'high-out-of-range' };
        }

        const localMedian = getLocalPitchMedian(points, index);
        if (localMedian === null) {
            return { ...point, pitch: halvedPitch, octaveCorrected: true };
        }

        const originalDistance = Math.abs(semitoneDistance(point.pitch, localMedian));
        const halvedDistance = Math.abs(semitoneDistance(halvedPitch, localMedian));

        if (halvedDistance + PITCH_CONFIG.octaveCorrectionMarginSemitones < originalDistance) {
            return { ...point, pitch: halvedPitch, octaveCorrected: true };
        }

        if (originalDistance > PITCH_CONFIG.maxMedianDeviationSemitones) {
            return { ...point, pitch: null, rejected: 'high-contour-mismatch' };
        }

        return point;
    });
}

function getLocalPitchMedian(points, index) {
    const halfWindow = Math.floor(PITCH_CONFIG.smoothingWindowPoints / 2);
    const values = [];

    for (let i = Math.max(0, index - halfWindow); i <= Math.min(points.length - 1, index + halfWindow); i++) {
        if (i === index || points[i].pitch === null) continue;
        if (isPitchInRange(points[i].pitch)) values.push(points[i].pitch);
    }

    return values.length >= 3 ? getMedian(values) : null;
}

function rejectShortHighFragments(points) {
    const cleaned = points.map(point => ({ ...point }));
    let index = 0;

    while (index < cleaned.length) {
        if (cleaned[index].pitch === null) {
            index++;
            continue;
        }

        const segmentStart = index;
        const segmentPitches = [];
        while (index < cleaned.length && cleaned[index].pitch !== null) {
            segmentPitches.push(cleaned[index].pitch);
            index++;
        }

        const segmentEnd = index - 1;
        const segmentDuration = cleaned[segmentEnd].time - cleaned[segmentStart].time;
        const segmentMedian = getMedian(segmentPitches);

        if (segmentMedian >= PITCH_CONFIG.octaveSuspectPitch &&
            segmentDuration <= PITCH_CONFIG.maxHighFragmentSeconds) {
            for (let i = segmentStart; i <= segmentEnd; i++) {
                cleaned[i] = { ...cleaned[i], pitch: null, rejected: 'short-high-fragment' };
            }
        }
    }

    return cleaned;
}

function trimPostRiseTails(points) {
    const cleaned = points.map(point => ({ ...point }));
    let index = 0;
    let previousRisingPeak = null;

    while (index < cleaned.length) {
        if (cleaned[index].pitch === null) {
            index++;
            continue;
        }

        const segmentStart = index;
        while (index < cleaned.length && cleaned[index].pitch !== null) {
            index++;
        }
        const segmentEnd = index - 1;
        if (segmentEnd <= segmentStart) continue;

        const segmentDuration = cleaned[segmentEnd].time - cleaned[segmentStart].time;
        const segmentMedian = getMedian(
            cleaned.slice(segmentStart, segmentEnd + 1).map(point => point.pitch)
        );

        if (previousRisingPeak &&
            cleaned[segmentStart].time - previousRisingPeak.time <= PITCH_CONFIG.maxDetachedPostRiseGapSeconds &&
            segmentDuration <= PITCH_CONFIG.maxDetachedPostRiseTailSeconds &&
            semitoneDistance(previousRisingPeak.pitch, segmentMedian) >= PITCH_CONFIG.minDetachedPostRiseDropSemitones) {
            for (let i = segmentStart; i <= segmentEnd; i++) {
                cleaned[i] = { ...cleaned[i], pitch: null, rejected: 'detached-post-rise-tail' };
            }
            continue;
        }

        let peakIndex = segmentStart;
        let lowBeforePeak = cleaned[segmentStart].pitch;
        for (let i = segmentStart; i <= segmentEnd; i++) {
            if (cleaned[i].pitch > cleaned[peakIndex].pitch) peakIndex = i;
            if (i <= peakIndex) lowBeforePeak = Math.min(lowBeforePeak, cleaned[i].pitch);
        }

        const riseToPeak = semitoneDistance(cleaned[peakIndex].pitch, lowBeforePeak);
        const tailDuration = cleaned[segmentEnd].time - cleaned[peakIndex].time;

        if (riseToPeak >= PITCH_CONFIG.minRiseBeforeTailTrimSemitones) {
            previousRisingPeak = {
                time: cleaned[peakIndex].time,
                pitch: cleaned[peakIndex].pitch
            };
        } else if (segmentDuration > PITCH_CONFIG.maxDetachedPostRiseGapSeconds) {
            previousRisingPeak = null;
        }

        if (riseToPeak >= PITCH_CONFIG.minRiseBeforeTailTrimSemitones &&
            tailDuration >= PITCH_CONFIG.minPostRiseTailSeconds) {
            for (let i = peakIndex + 1; i <= segmentEnd; i++) {
                cleaned[i] = { ...cleaned[i], pitch: null, rejected: 'post-rise-tail' };
            }
        }
    }

    return cleaned;
}

function rejectMedianOutliers(points) {
    const halfWindow = Math.floor(PITCH_CONFIG.medianWindowPoints / 2);
    return points.map((point, index) => {
        if (point.pitch === null) return point;

        const neighbors = [];
        for (let i = Math.max(0, index - halfWindow); i <= Math.min(points.length - 1, index + halfWindow); i++) {
            if (points[i].pitch !== null) neighbors.push(points[i].pitch);
        }

        if (neighbors.length < 3) return point;

        const median = getMedian(neighbors);
        const deviation = Math.abs(semitoneDistance(point.pitch, median));
        const maxDeviation = getMaxMedianDeviation(point.pitch, median);
        return deviation > maxDeviation
            ? { ...point, pitch: null, rejected: 'median-outlier' }
            : point;
    });
}

function rejectAbruptJumps(points) {
    const cleaned = points.map(point => ({ ...point }));
    let lastAcceptedIndex = -1;

    for (let i = 0; i < cleaned.length; i++) {
        const point = cleaned[i];
        if (point.pitch === null) continue;

        if (lastAcceptedIndex !== -1) {
            const previous = cleaned[lastAcceptedIndex];
            const frameGap = i - lastAcceptedIndex;
            const timeGap = point.time - previous.time;
            if (timeGap > PITCH_CONFIG.maxInterpolatedGapSeconds) {
                lastAcceptedIndex = i;
                continue;
            }
            const allowedJump = getMaxFrameJump(point.pitch, previous.pitch) * Math.max(1, Math.sqrt(frameGap));

            if (Math.abs(semitoneDistance(point.pitch, previous.pitch)) > allowedJump) {
                const nextStable = findNextStablePitch(cleaned, i);
                const previousDistance = nextStable === null ? Infinity : Math.abs(semitoneDistance(previous.pitch, nextStable));
                const currentDistance = nextStable === null ? Infinity : Math.abs(semitoneDistance(point.pitch, nextStable));

                if (currentDistance > previousDistance || frameGap <= 2) {
                    cleaned[i] = { ...point, pitch: null, rejected: 'abrupt-jump' };
                    continue;
                }
            }
        }

        lastAcceptedIndex = i;
    }

    return cleaned;
}

function findNextStablePitch(points, startIndex) {
    const lookahead = Math.min(points.length, startIndex + PITCH_CONFIG.medianWindowPoints);
    const values = [];
    for (let i = startIndex + 1; i < lookahead; i++) {
        if (points[i].pitch !== null) values.push(points[i].pitch);
    }
    return values.length >= 2 ? getMedian(values) : null;
}

function interpolateShortGaps(points) {
    const interpolated = points.map(point => ({ ...point }));
    let index = 0;

    while (index < interpolated.length) {
        if (interpolated[index].pitch !== null) {
            index++;
            continue;
        }

        const gapStart = index;
        while (index < interpolated.length && interpolated[index].pitch === null) {
            index++;
        }
        const gapEnd = index - 1;
        const before = gapStart - 1;
        const after = index;

        if (before < 0 || after >= interpolated.length) continue;
        if (interpolated[before].pitch === null || interpolated[after].pitch === null) continue;

        const gapSeconds = interpolated[after].time - interpolated[before].time;
        const pitchJump = Math.abs(semitoneDistance(interpolated[after].pitch, interpolated[before].pitch));
        if (gapSeconds > PITCH_CONFIG.maxInterpolatedGapSeconds || pitchJump > PITCH_CONFIG.maxMedianDeviationSemitones) continue;

        const startLog = Math.log2(interpolated[before].pitch);
        const endLog = Math.log2(interpolated[after].pitch);
        const totalSteps = after - before;
        for (let i = gapStart; i <= gapEnd; i++) {
            const t = (i - before) / totalSteps;
            const eased = t * t * (3 - 2 * t);
            interpolated[i] = {
                ...interpolated[i],
                pitch: 2 ** (startLog + (endLog - startLog) * eased),
                interpolated: true
            };
        }
    }

    return interpolated;
}

function smoothPitchTrack(points) {
    const halfWindow = Math.floor(PITCH_CONFIG.smoothingWindowPoints / 2);
    return points.map((point, index) => {
        if (point.pitch === null) return point;

        const weightedLogs = [];
        for (let i = Math.max(0, index - halfWindow); i <= Math.min(points.length - 1, index + halfWindow); i++) {
            if (points[i].pitch === null) continue;
            const distance = Math.abs(i - index);
            const weight = halfWindow + 1 - distance;
            weightedLogs.push({ value: Math.log2(points[i].pitch), weight });
        }

        if (weightedLogs.length < 2) return point;

        const totalWeight = weightedLogs.reduce((sum, item) => sum + item.weight, 0);
        const smoothedLog = weightedLogs.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
        return { ...point, pitch: clampPitch(2 ** smoothedLog) };
    });
}

function enforceSmoothJumps(points) {
    const smoothed = points.map(point => ({ ...point }));
    let previousIndex = -1;

    for (let i = 0; i < smoothed.length; i++) {
        const point = smoothed[i];
        if (point.pitch === null) {
            previousIndex = -1;
            continue;
        }

        if (previousIndex !== -1) {
            const previous = smoothed[previousIndex];
            const jump = semitoneDistance(point.pitch, previous.pitch);
            const timeGap = point.time - previous.time;

            if (timeGap <= PITCH_CONFIG.maxInterpolatedGapSeconds &&
                Math.abs(jump) > getMaxFrameJump(point.pitch, previous.pitch)) {
                const limitedLog = Math.log2(previous.pitch) +
                    Math.sign(jump) * (getMaxFrameJump(point.pitch, previous.pitch) / 12);
                smoothed[i] = {
                    ...point,
                    pitch: clampPitch(2 ** limitedLog),
                    slopeLimited: true
                };
            }
        }

        previousIndex = i;
    }

    return smoothed;
}

function isPitchInRange(pitch) {
    return Number.isFinite(pitch) && pitch >= PITCH_CONFIG.minPitch && pitch <= PITCH_CONFIG.maxPitch;
}

function isCandidatePitchInRange(pitch) {
    return Number.isFinite(pitch) && pitch >= PITCH_CONFIG.minPitch && pitch <= PITCH_CONFIG.maxCandidatePitch;
}

function getMinConfidenceForPitch(pitch) {
    return pitch <= PITCH_CONFIG.lowPitchCutoff
        ? PITCH_CONFIG.lowPitchConfidence
        : PITCH_CONFIG.minConfidence;
}

function getMaxMedianDeviation(pitch, referencePitch) {
    return Math.min(pitch, referencePitch) <= PITCH_CONFIG.lowPitchCutoff
        ? PITCH_CONFIG.maxLowMedianDeviationSemitones
        : PITCH_CONFIG.maxMedianDeviationSemitones;
}

function getMaxFrameJump(pitch, previousPitch) {
    return Math.min(pitch, previousPitch) <= PITCH_CONFIG.lowPitchCutoff
        ? PITCH_CONFIG.maxLowFrameJumpSemitones
        : PITCH_CONFIG.maxFrameJumpSemitones;
}

function clampPitch(pitch) {
    return Math.min(PITCH_CONFIG.maxPitch, Math.max(PITCH_CONFIG.minPitch, pitch));
}

function semitoneDistance(a, b) {
    return 12 * Math.log2(a / b);
}

function getMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

export function drawPitchCurve(canvas, pitches, duration) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);

    if (!pitches || pitches.length === 0) return;

    const drawableSegments = buildDrawableSegments(pitches, width, height, duration);
    const drawablePoints = drawableSegments.flat();

    if (drawablePoints.length === 0) return;

    // Draw pitch curve
    ctx.beginPath();
    ctx.strokeStyle = '#0000FF'; // Blue
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    drawableSegments.forEach(segment => drawSmoothSegment(ctx, segment));
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
            
            drawablePoints.forEach(point => {
                const p = point.source;
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
                const py = height - ((closest.pitch / PITCH_CONFIG.displayMaxPitch) * height);
                
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

function buildDrawableSegments(pitches, width, height, duration) {
    const segments = [];
    let currentSegment = [];
    let previousSource = null;

    pitches.forEach(p => {
        const gapIsDrawable = previousSource &&
            p.time - previousSource.time <= PITCH_CONFIG.maxInterpolatedGapSeconds;

        if (p.pitch === null) {
            if (currentSegment.length >= PITCH_CONFIG.minDrawableSegmentPoints) segments.push(currentSegment);
            currentSegment = [];
            previousSource = null;
            return;
        }

        if (previousSource && !gapIsDrawable) {
            if (currentSegment.length >= PITCH_CONFIG.minDrawableSegmentPoints) segments.push(currentSegment);
            currentSegment = [];
        }

        currentSegment.push({
            x: (p.time / duration) * width,
            y: height - ((p.pitch / PITCH_CONFIG.displayMaxPitch) * height),
            source: p
        });
        previousSource = p;
    });

    if (currentSegment.length >= PITCH_CONFIG.minDrawableSegmentPoints) segments.push(currentSegment);
    return segments;
}

function drawSmoothSegment(ctx, segment) {
    if (segment.length === 0) return;
    ctx.moveTo(segment[0].x, segment[0].y);

    if (segment.length === 1) {
        ctx.lineTo(segment[0].x + 0.01, segment[0].y);
        return;
    }

    for (let i = 1; i < segment.length - 1; i++) {
        const current = segment[i];
        const next = segment[i + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }

    const last = segment[segment.length - 1];
    ctx.lineTo(last.x, last.y);
}
