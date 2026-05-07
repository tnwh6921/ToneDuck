// Pitch Detection Module
// Calculates and cleans pitch points every 5ms.

const PITCH_CONFIG = {
    minPitch: 40,
    maxPitch: 360,
    maxCandidatePitch: 420,
    displayMaxPitch: 400,
    frameStepSeconds: 0.005,
    windowSeconds: 0.06,
    minRms: 0.0045,
    yinThreshold: 0.14,
    minConfidence: 0.78,
    lowPitchConfidence: 0.58,
    lowPitchCutoff: 100,
    octaveSuspectPitch: 275,
    octaveCorrectionMarginSemitones: 4,
    maxHighFragmentSeconds: 0.12,
    medianWindowPoints: 7,
    maxMedianDeviationSemitones: 3.5,
    maxLowMedianDeviationSemitones: 7,
    maxFrameJumpSemitones: 1.8,
    maxLowFrameJumpSemitones: 3,
    maxEnergeticFrameJumpSemitones: 7,
    maxInterpolatedGapSeconds: 0.08,
    maxEnergeticGapSeconds: 0.16,
    maxEnergeticInterpolationSemitones: 9,
    maxLowToneGapSeconds: 0.18,
    maxLowToneInterpolationSemitones: 14,
    lowToneOctavePitch: 150,
    maleLowToneMaxPitch: 140,
    femaleLowToneMaxPitch: 170,
    femaleLessonMinPitch: 70,
    continuityLookaroundPoints: 5,
    minContinuityRmsRatio: 0.5,
    minContinuityTrendSemitones: 0.45,
    minGapRmsRatio: 0.35,
    minGapValleyRmsRatio: 0.65,
    maxResetDropAcrossGapSemitones: 2.8,
    minRiseBeforeTailTrimSemitones: 2.2,
    minPostRiseTailSeconds: 0.04,
    postRiseTailRmsDropRatio: 0.58,
    postRiseTailSoftRmsRatio: 0.9,
    maxPostRiseTailDriftSemitones: 2.2,
    maxDetachedPostRiseTailSeconds: 0.16,
    maxDetachedPostRiseGapSeconds: 0.14,
    minDetachedPostRiseDropSemitones: 3,
    minHardDetachedPostRiseDropSemitones: 4.5,
    minDrawableSegmentPoints: 3,
    smoothingWindowPoints: 11
};

const PITCH_COLORS = {
    male: '#2563EB',
    female: '#D9466E',
    neutral: '#4F46E5'
};

const VOICE_LABELS = {
    male: '男聲',
    female: '女聲'
};

const VOICE_PITCH_OVERRIDES = {
    // Female lesson samples still need room for low tone-4 fall, but should not
    // draw 40-60 Hz floor hits unless the item itself expects a low tone.
    female: {
        minPitch: PITCH_CONFIG.femaleLessonMinPitch
    },
    male: {
        minPitch: 40
    }
};

/*
Pitch-detection pipeline, kept here for future tuning:
1. Decode audio and analyze overlapping 60 ms frames every 5 ms.
2. Estimate F0 with a YIN-style cumulative difference function. This is more
   stable than raw autocorrelation for short Cantonese syllables.
3. Keep a broad candidate range (40-420 Hz) for male/neutral voices, with a
   lower confidence threshold below 100 Hz so low male dips/falls are not
   silently dropped. Female samples use a moderate low floor, then tone-4 hints
   decide whether unusually low material should be trusted.
4. Normalize common octave-doubling errors, especially short high fragments.
5. Parse jyutping tone numbers when available. Tone 4 is allowed to be low and
   creaky, so octave-doubled frames around 180-220 Hz can be corrected downward
   inside that syllable without flattening real tone-2 rises.
6. Use intensity as a secondary cue. If neighboring frames are still energetic
   and the local slope keeps the same direction, large adjacent F0 steps are
   treated as continuous tonal movement rather than glitches.
7. Reject local median outliers and implausible frame jumps in semitone space,
   except for the energy-supported continuous rises/falls described above.
8. Interpolate short gaps. If the gap stays energetic and has no clear RMS
   valley or pitch reset, allow a slightly longer interpolation window so a
   steady tonal rise/fall is not split into pieces. Do not bridge syllable
   boundaries just because the surrounding frames are loud. Low tone-4 gaps get
   a separate creaky-voice path when both sides are in the same tone-4 syllable.
9. Trim post-rise release artifacts when energy drops, or when the post-peak
   tail resets downward and then stays level. This keeps real second syllables
   or strong falling/rising motion from being mistaken for tone-2 release tails.
*/

export async function computePitchCurve(audioUrl, options = 'neutral') {
    const pitchContext = getPitchContext(options);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Fetch and decode audio
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const float32Array = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    pitchContext.durationSeconds = audioBuffer.duration || (float32Array.length / sampleRate);
    
    const stepSize = Math.floor(sampleRate * PITCH_CONFIG.frameStepSeconds);
    const windowSize = Math.floor(sampleRate * PITCH_CONFIG.windowSeconds);
    
    const pitches = [];
    for (let i = 0; i < float32Array.length - windowSize; i += stepSize) {
        const window = float32Array.slice(i, i + windowSize);
        const candidate = detectPitchCandidate(window, sampleRate, pitchContext);
        pitches.push({
            time: i / sampleRate,
            pitch: candidate && candidate.pitch ? candidate.pitch : null,
            confidence: candidate ? candidate.confidence : 0,
            rms: candidate ? candidate.rms : 0
        });
    }
    
    return cleanPitchTrack(pitches, pitchContext);
}

function detectPitchCandidate(buf, sampleRate, pitchContext = PITCH_CONFIG) {
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
    if (rms < PITCH_CONFIG.minRms) return { pitch: null, confidence: 0, rms };

    const minLag = Math.max(2, Math.floor(sampleRate / pitchContext.maxCandidatePitch));
    const maxLag = Math.min(SIZE - 2, Math.ceil(sampleRate / pitchContext.minPitch));
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
    
    if (bestLag <= 0) return { pitch: null, confidence: 0, rms };

    const refinedLag = parabolicMinimum(difference, bestLag);
    const pitch = sampleRate / refinedLag;
    const confidence = 1 - Math.max(0, Math.min(1, bestValue));

    if (!isCandidatePitchInRange(pitch, pitchContext) || confidence < getMinConfidenceForPitch(pitch, pitchContext)) {
        return { pitch: null, confidence, rms };
    }

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

function cleanPitchTrack(points, pitchContext = PITCH_CONFIG) {
    const octaveCorrected = correctOctaveErrors(points, pitchContext);
    const lowToneCorrected = correctLowToneOctaveErrors(octaveCorrected, pitchContext);
    const rangeFiltered = lowToneCorrected.map(p => ({
        ...p,
        pitch: isPitchInRange(p.pitch, pitchContext) && p.confidence >= getMinConfidenceForPitch(p.pitch, pitchContext) ? p.pitch : null
    }));

    const highFragmentFiltered = rejectShortHighFragments(rangeFiltered);
    const postRiseTrimmed = trimPostRiseTails(highFragmentFiltered);
    const medianFiltered = rejectMedianOutliers(postRiseTrimmed, pitchContext);
    const jumpFiltered = rejectAbruptJumps(medianFiltered, pitchContext);
    const releaseTrimmed = trimPostRiseTails(jumpFiltered);
    const interpolated = interpolateShortGaps(releaseTrimmed, pitchContext);
    return enforceSmoothJumps(smoothPitchTrack(interpolated, pitchContext), pitchContext);
}

function correctOctaveErrors(points, pitchContext = PITCH_CONFIG) {
    return points.map((point, index) => {
        if (point.pitch === null || point.pitch < PITCH_CONFIG.octaveSuspectPitch) return point;

        const halvedPitch = point.pitch / 2;
        if (!isPitchInRange(halvedPitch, pitchContext)) {
            return { ...point, pitch: null, rejected: 'high-out-of-range' };
        }

        const localMedian = getLocalPitchMedian(points, index, pitchContext);
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

function correctLowToneOctaveErrors(points, pitchContext = PITCH_CONFIG) {
    return points.map(point => {
        if (point.pitch === null || point.pitch < PITCH_CONFIG.lowToneOctavePitch) return point;
        if (!isExpectedLowToneAt(point.time, pitchContext)) return point;

        const halvedPitch = point.pitch / 2;
        if (!isPitchInRange(halvedPitch, getLowTonePitchContext(pitchContext))) return point;
        if (halvedPitch > getLowToneMaxPitch(pitchContext)) return point;

        return { ...point, pitch: halvedPitch, octaveCorrected: 'low-tone' };
    });
}

function getLocalPitchMedian(points, index, pitchContext = PITCH_CONFIG) {
    const halfWindow = Math.floor(PITCH_CONFIG.smoothingWindowPoints / 2);
    const values = [];

    for (let i = Math.max(0, index - halfWindow); i <= Math.min(points.length - 1, index + halfWindow); i++) {
        if (i === index || points[i].pitch === null) continue;
        if (isPitchInRange(points[i].pitch, pitchContext)) values.push(points[i].pitch);
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
        if (segmentEnd < segmentStart) continue;

        const segmentDuration = cleaned[segmentEnd].time - cleaned[segmentStart].time;
        const segmentMedian = getMedian(
            cleaned.slice(segmentStart, segmentEnd + 1).map(point => point.pitch)
        );

        if (previousRisingPeak &&
            cleaned[segmentStart].time - previousRisingPeak.time <= PITCH_CONFIG.maxDetachedPostRiseGapSeconds &&
            segmentDuration <= PITCH_CONFIG.maxDetachedPostRiseTailSeconds &&
            shouldTrimDetachedPostRiseTail(cleaned, segmentStart, segmentEnd, previousRisingPeak, segmentMedian)) {
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
                pitch: cleaned[peakIndex].pitch,
                rms: cleaned[peakIndex].rms
            };
        } else if (segmentDuration > PITCH_CONFIG.maxDetachedPostRiseGapSeconds) {
            previousRisingPeak = null;
        }

        if (riseToPeak >= PITCH_CONFIG.minRiseBeforeTailTrimSemitones &&
            tailDuration >= PITCH_CONFIG.minPostRiseTailSeconds &&
            shouldTrimPostRiseTail(cleaned, peakIndex, segmentEnd)) {
            for (let i = peakIndex + 1; i <= segmentEnd; i++) {
                cleaned[i] = { ...cleaned[i], pitch: null, rejected: 'post-rise-tail' };
            }
        }
    }

    return cleaned;
}

function rejectMedianOutliers(points, pitchContext = PITCH_CONFIG) {
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
        return deviation > maxDeviation && !isEnergySupportedLocalTrend(points, index, pitchContext)
            ? { ...point, pitch: null, rejected: 'median-outlier' }
            : point;
    });
}

function rejectAbruptJumps(points, pitchContext = PITCH_CONFIG) {
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
                if (isEnergySupportedMotion(cleaned, lastAcceptedIndex, i, pitchContext)) {
                    lastAcceptedIndex = i;
                    continue;
                }

                const nextStable = findNextStablePitch(cleaned, i, pitchContext);
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

function findNextStablePitch(points, startIndex, pitchContext = PITCH_CONFIG) {
    const lookahead = Math.min(points.length, startIndex + PITCH_CONFIG.medianWindowPoints);
    const values = [];
    for (let i = startIndex + 1; i < lookahead; i++) {
        if (isPitchInRange(points[i].pitch, pitchContext)) values.push(points[i].pitch);
    }
    return values.length >= 2 ? getMedian(values) : null;
}

function interpolateShortGaps(points, pitchContext = PITCH_CONFIG) {
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
        const lowToneGap = isLowToneGap(interpolated, before, gapStart, gapEnd, after, pitchContext);
        const energySupportedGap = isEnergySupportedGap(interpolated, before, gapStart, gapEnd, after, pitchContext);
        const maxGapSeconds = lowToneGap
            ? PITCH_CONFIG.maxLowToneGapSeconds
            : energySupportedGap
            ? PITCH_CONFIG.maxEnergeticGapSeconds
            : PITCH_CONFIG.maxInterpolatedGapSeconds;
        const maxPitchJump = lowToneGap
            ? PITCH_CONFIG.maxLowToneInterpolationSemitones
            : energySupportedGap
            ? PITCH_CONFIG.maxEnergeticInterpolationSemitones
            : PITCH_CONFIG.maxMedianDeviationSemitones;
        if (gapSeconds > maxGapSeconds || pitchJump > maxPitchJump) continue;

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

function smoothPitchTrack(points, pitchContext = PITCH_CONFIG) {
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
        return { ...point, pitch: clampPitch(2 ** smoothedLog, pitchContext) };
    });
}

function enforceSmoothJumps(points, pitchContext = PITCH_CONFIG) {
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
                    pitch: clampPitch(2 ** limitedLog, pitchContext),
                    slopeLimited: true
                };
            }
        }

        previousIndex = i;
    }

    return smoothed;
}

// RMS/intensity is only a supporting cue. We still need plausible F0 motion,
// but energetic neighboring frames can protect real Cantonese rises/falls from
// being broken up by median or jump filters.
function isEnergySupportedLocalTrend(points, index, pitchContext = PITCH_CONFIG) {
    if (!hasStablePitchAndEnergy(points, index, pitchContext)) return false;

    const leftIndex = findNearestPitchIndex(points, index, -1, PITCH_CONFIG.continuityLookaroundPoints, true, pitchContext);
    const rightIndex = findNearestPitchIndex(points, index, 1, PITCH_CONFIG.continuityLookaroundPoints, true, pitchContext);
    if (leftIndex === -1 || rightIndex === -1) return false;

    const leftJump = semitoneDistance(points[index].pitch, points[leftIndex].pitch);
    const rightJump = semitoneDistance(points[rightIndex].pitch, points[index].pitch);
    const leftAllowed = getEnergeticJumpLimit(index - leftIndex);
    const rightAllowed = getEnergeticJumpLimit(rightIndex - index);

    if (Math.abs(leftJump) > leftAllowed || Math.abs(rightJump) > rightAllowed) return false;

    const leftSign = getTrendSign(leftJump);
    const rightSign = getTrendSign(rightJump);
    return leftSign !== 0 && leftSign === rightSign;
}

function isEnergySupportedMotion(points, previousIndex, currentIndex, pitchContext = PITCH_CONFIG) {
    if (!hasStablePitchAndEnergy(points, previousIndex, pitchContext) || !hasStablePitchAndEnergy(points, currentIndex, pitchContext)) {
        return false;
    }

    const jump = semitoneDistance(points[currentIndex].pitch, points[previousIndex].pitch);
    const jumpSign = getTrendSign(jump);
    if (jumpSign === 0 || Math.abs(jump) > getEnergeticJumpLimit(currentIndex - previousIndex)) {
        return false;
    }

    let supportingNeighbors = 0;
    let conflictingNeighbors = 0;
    const leftIndex = findNearestPitchIndex(points, previousIndex, -1, PITCH_CONFIG.continuityLookaroundPoints, true, pitchContext);
    const rightIndex = findNearestPitchIndex(points, currentIndex, 1, PITCH_CONFIG.continuityLookaroundPoints, true, pitchContext);

    if (leftIndex !== -1) {
        const leftSign = getTrendSign(semitoneDistance(points[previousIndex].pitch, points[leftIndex].pitch));
        if (leftSign === jumpSign) supportingNeighbors++;
        else if (leftSign !== 0) conflictingNeighbors++;
    }

    if (rightIndex !== -1) {
        const rightSign = getTrendSign(semitoneDistance(points[rightIndex].pitch, points[currentIndex].pitch));
        if (rightSign === jumpSign) supportingNeighbors++;
        else if (rightSign !== 0) conflictingNeighbors++;
    }

    return supportingNeighbors > 0 && conflictingNeighbors === 0;
}

function isEnergySupportedGap(points, beforeIndex, gapStart, gapEnd, afterIndex, pitchContext = PITCH_CONFIG) {
    if (!hasStablePitchAndEnergy(points, beforeIndex, pitchContext) || !hasStablePitchAndEnergy(points, afterIndex, pitchContext)) {
        return false;
    }

    const gapRms = getMeanRms(points, gapStart, gapEnd);
    const gapMinRms = getMinRms(points, gapStart, gapEnd);
    const endpointRms = Math.min(points[beforeIndex].rms || 0, points[afterIndex].rms || 0);
    const minGapRms = Math.max(PITCH_CONFIG.minRms * 0.7, endpointRms * PITCH_CONFIG.minGapRmsRatio);
    if (gapRms < minGapRms) return false;
    if (endpointRms > 0 && gapMinRms < endpointRms * PITCH_CONFIG.minGapValleyRmsRatio) return false;

    const signedJump = semitoneDistance(points[afterIndex].pitch, points[beforeIndex].pitch);
    const jump = Math.abs(signedJump);
    if (jump > getEnergeticJumpLimit(afterIndex - beforeIndex)) return false;

    if (signedJump < -PITCH_CONFIG.maxResetDropAcrossGapSemitones &&
        !hasDirectionalGapContinuation(points, beforeIndex, afterIndex, -1, pitchContext)) {
        return false;
    }

    return true;
}

function isLowToneGap(points, beforeIndex, gapStart, gapEnd, afterIndex, pitchContext = PITCH_CONFIG) {
    const beforeHint = getToneHintAtTime(points[beforeIndex].time, pitchContext);
    const afterHint = getToneHintAtTime(points[afterIndex].time, pitchContext);
    if (!beforeHint || !afterHint || beforeHint.index !== afterHint.index || !isLowTone(beforeHint.tone)) {
        return false;
    }

    const lowToneContext = getLowTonePitchContext(pitchContext);
    if (!isPitchInRange(points[beforeIndex].pitch, lowToneContext) ||
        !isPitchInRange(points[afterIndex].pitch, lowToneContext)) {
        return false;
    }

    if (Math.max(points[beforeIndex].pitch, points[afterIndex].pitch) > getLowToneMaxPitch(pitchContext)) {
        return false;
    }

    const gapRms = getMeanRms(points, gapStart, gapEnd);
    const endpointRms = Math.min(points[beforeIndex].rms || 0, points[afterIndex].rms || 0);
    if (gapRms < Math.max(PITCH_CONFIG.minRms * 0.35, endpointRms * 0.08)) return false;

    const pitchJump = Math.abs(semitoneDistance(points[afterIndex].pitch, points[beforeIndex].pitch));
    return pitchJump <= PITCH_CONFIG.maxLowToneInterpolationSemitones;
}

function hasStablePitchAndEnergy(points, index, pitchContext = PITCH_CONFIG) {
    return points[index] &&
        points[index].pitch !== null &&
        isPitchInRange(points[index].pitch, pitchContext) &&
        hasStableEnergy(points, index);
}

function hasStableEnergy(points, index) {
    const rms = points[index] ? points[index].rms : 0;
    if (!Number.isFinite(rms) || rms < PITCH_CONFIG.minRms * 0.7) return false;

    const localMedian = getLocalRmsMedian(points, index);
    if (localMedian === null) return rms >= PITCH_CONFIG.minRms;

    return rms >= Math.max(
        PITCH_CONFIG.minRms * 0.7,
        localMedian * PITCH_CONFIG.minContinuityRmsRatio
    );
}

function findNearestPitchIndex(points, startIndex, direction, maxSteps, requireStableEnergy = false, pitchContext = PITCH_CONFIG) {
    const endIndex = direction < 0
        ? Math.max(-1, startIndex - maxSteps - 1)
        : Math.min(points.length, startIndex + maxSteps + 1);

    for (let i = startIndex + direction; direction < 0 ? i > endIndex : i < endIndex; i += direction) {
        const hasPitch = points[i] && points[i].pitch !== null && isPitchInRange(points[i].pitch, pitchContext);
        if (hasPitch && (!requireStableEnergy || hasStableEnergy(points, i))) return i;
    }

    return -1;
}

function getMeanRms(points, startIndex, endIndex) {
    const start = Math.max(0, startIndex);
    const end = Math.min(points.length - 1, endIndex);
    let sum = 0;
    let count = 0;

    for (let i = start; i <= end; i++) {
        const rms = points[i] ? points[i].rms : 0;
        if (Number.isFinite(rms) && rms > 0) {
            sum += rms;
            count++;
        }
    }

    return count > 0 ? sum / count : 0;
}

function getMinRms(points, startIndex, endIndex) {
    const start = Math.max(0, startIndex);
    const end = Math.min(points.length - 1, endIndex);
    let min = Infinity;

    for (let i = start; i <= end; i++) {
        const rms = points[i] ? points[i].rms : 0;
        if (Number.isFinite(rms) && rms > 0) min = Math.min(min, rms);
    }

    return min === Infinity ? 0 : min;
}

function getLocalRmsMedian(points, index) {
    const values = [];
    const start = Math.max(0, index - PITCH_CONFIG.continuityLookaroundPoints);
    const end = Math.min(points.length - 1, index + PITCH_CONFIG.continuityLookaroundPoints);

    for (let i = start; i <= end; i++) {
        const rms = points[i] ? points[i].rms : 0;
        if (Number.isFinite(rms) && rms > 0) values.push(rms);
    }

    return values.length >= 3 ? getMedian(values) : null;
}

function hasDirectionalGapContinuation(points, beforeIndex, afterIndex, direction, pitchContext = PITCH_CONFIG) {
    const leftIndex = findNearestPitchIndex(points, beforeIndex, -1, PITCH_CONFIG.continuityLookaroundPoints, true, pitchContext);
    const rightIndex = findNearestPitchIndex(points, afterIndex, 1, PITCH_CONFIG.continuityLookaroundPoints, true, pitchContext);
    if (leftIndex === -1 || rightIndex === -1) return false;

    const leftSign = getTrendSign(semitoneDistance(points[beforeIndex].pitch, points[leftIndex].pitch));
    const rightSign = getTrendSign(semitoneDistance(points[rightIndex].pitch, points[afterIndex].pitch));
    return leftSign === direction && rightSign === direction;
}

function hasDroppedEnergy(currentRms, referenceRms) {
    return Number.isFinite(currentRms) &&
        Number.isFinite(referenceRms) &&
        currentRms > 0 &&
        referenceRms >= PITCH_CONFIG.minRms &&
        currentRms <= referenceRms * PITCH_CONFIG.postRiseTailRmsDropRatio;
}

function shouldTrimDetachedPostRiseTail(points, segmentStart, segmentEnd, previousRisingPeak, segmentMedian) {
    const dropFromPeak = semitoneDistance(previousRisingPeak.pitch, segmentMedian);
    if (dropFromPeak < PITCH_CONFIG.minDetachedPostRiseDropSemitones) return false;

    const tailRms = getMeanRms(points, segmentStart, segmentEnd);
    if (hasDroppedEnergy(tailRms, previousRisingPeak.rms)) return true;

    const tailPitches = [];
    for (let i = segmentStart; i <= segmentEnd; i++) {
        if (points[i].pitch !== null) tailPitches.push(points[i].pitch);
    }

    const tailDrift = tailPitches.length >= 2
        ? Math.abs(semitoneDistance(tailPitches[tailPitches.length - 1], tailPitches[0]))
        : 0;
    const isFlatReset = tailDrift <= PITCH_CONFIG.maxPostRiseTailDriftSemitones;
    const hasSoftEnergyDrop = tailRms > 0 && tailRms <= previousRisingPeak.rms * PITCH_CONFIG.postRiseTailSoftRmsRatio;
    const isHardReset = dropFromPeak >= PITCH_CONFIG.minHardDetachedPostRiseDropSemitones;

    return isFlatReset && (hasSoftEnergyDrop || isHardReset);
}

function shouldTrimPostRiseTail(points, peakIndex, segmentEnd) {
    const peak = points[peakIndex];
    const tailRms = getMeanRms(points, peakIndex + 1, segmentEnd);
    if (hasDroppedEnergy(tailRms, peak.rms)) return true;

    const tailPitches = [];
    for (let i = peakIndex + 1; i <= segmentEnd; i++) {
        if (points[i].pitch !== null) tailPitches.push(points[i].pitch);
    }
    if (tailPitches.length < PITCH_CONFIG.minDrawableSegmentPoints) return false;

    const tailMedian = getMedian(tailPitches);
    const dropFromPeak = semitoneDistance(peak.pitch, tailMedian);
    const tailDrift = Math.abs(semitoneDistance(tailPitches[tailPitches.length - 1], tailPitches[0]));
    const hasSoftEnergyDrop = tailRms > 0 && tailRms <= peak.rms * PITCH_CONFIG.postRiseTailSoftRmsRatio;

    return dropFromPeak >= PITCH_CONFIG.minDetachedPostRiseDropSemitones &&
        tailDrift <= PITCH_CONFIG.maxPostRiseTailDriftSemitones &&
        hasSoftEnergyDrop;
}

function getTrendSign(semitones) {
    return Math.abs(semitones) >= PITCH_CONFIG.minContinuityTrendSemitones
        ? Math.sign(semitones)
        : 0;
}

function getEnergeticJumpLimit(frameGap) {
    return PITCH_CONFIG.maxEnergeticFrameJumpSemitones * Math.max(1, Math.sqrt(frameGap));
}

function isPitchInRange(pitch, pitchContext = PITCH_CONFIG) {
    return Number.isFinite(pitch) && pitch >= pitchContext.minPitch && pitch <= pitchContext.maxPitch;
}

function isCandidatePitchInRange(pitch, pitchContext = PITCH_CONFIG) {
    return Number.isFinite(pitch) && pitch >= pitchContext.minPitch && pitch <= pitchContext.maxCandidatePitch;
}

function getMinConfidenceForPitch(pitch, pitchContext = PITCH_CONFIG) {
    return pitch <= pitchContext.lowPitchCutoff
        ? pitchContext.lowPitchConfidence
        : pitchContext.minConfidence;
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

function clampPitch(pitch, pitchContext = PITCH_CONFIG) {
    return Math.min(pitchContext.maxPitch, Math.max(pitchContext.minPitch, pitch));
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

export function drawPitchCurve(canvas, pitches, duration, voice = 'neutral') {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);

    if (!pitches || pitches.length === 0) return;

    const drawableSegments = buildDrawableSegments(pitches, width, height, duration);
    const drawablePoints = drawableSegments.flat();

    if (drawablePoints.length === 0) return;

    const pitchColor = getPitchColor(voice);

    // Draw pitch curve
    ctx.beginPath();
    ctx.strokeStyle = pitchColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    drawableSegments.forEach(segment => drawSmoothSegment(ctx, segment));
    ctx.stroke();

    // Hover effect for exact values
    const hoverDiv = document.createElement('div');
    hoverDiv.style.position = 'absolute';
    hoverDiv.style.color = pitchColor;
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
                
                const voiceLabel = VOICE_LABELS[normalizeVoice(voice)];
                hoverDiv.textContent = `${voiceLabel ? voiceLabel + ' · ' : ''}${Math.round(closest.pitch)} Hz`;
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

function normalizeVoice(voice) {
    const normalized = String(voice || '').trim().toLowerCase();
    if (normalized === 'm') return 'male';
    if (normalized === 'f') return 'female';
    return normalized;
}

function normalizePitchOptions(options) {
    if (options && typeof options === 'object') {
        return {
            voice: normalizeVoice(options.voice),
            jyutping: String(options.jyutping || '')
        };
    }

    return {
        voice: normalizeVoice(options),
        jyutping: ''
    };
}

function getPitchContext(options) {
    const normalizedOptions = normalizePitchOptions(options);
    return {
        ...PITCH_CONFIG,
        ...(VOICE_PITCH_OVERRIDES[normalizedOptions.voice] || {}),
        voice: normalizedOptions.voice,
        toneHints: parseJyutpingTones(normalizedOptions.jyutping),
        durationSeconds: 0
    };
}

function getPitchColor(voice) {
    return PITCH_COLORS[normalizeVoice(voice)] || PITCH_COLORS.neutral;
}

function parseJyutpingTones(jyutping) {
    return String(jyutping || '')
        .trim()
        .split(/\s+/)
        .map(syllable => {
            const match = syllable.match(/[1-6]$/);
            return match ? Number(match[0]) : null;
        })
        .filter(tone => tone !== null);
}

function getToneHintAtTime(time, pitchContext = PITCH_CONFIG) {
    const tones = pitchContext.toneHints || [];
    if (!tones.length || !pitchContext.durationSeconds) return null;

    const syllableCount = tones.length;
    const normalizedTime = Math.min(0.999, Math.max(0, time / pitchContext.durationSeconds));
    const index = Math.min(syllableCount - 1, Math.floor(normalizedTime * syllableCount));
    return { tone: tones[index], index };
}

function isExpectedLowToneAt(time, pitchContext = PITCH_CONFIG) {
    const hint = getToneHintAtTime(time, pitchContext);
    return hint ? isLowTone(hint.tone) : false;
}

function isLowTone(tone) {
    return tone === 4;
}

function getLowTonePitchContext(pitchContext = PITCH_CONFIG) {
    return {
        ...pitchContext,
        minPitch: pitchContext.voice === 'female'
            ? PITCH_CONFIG.femaleLessonMinPitch
            : PITCH_CONFIG.minPitch
    };
}

function getLowToneMaxPitch(pitchContext = PITCH_CONFIG) {
    return pitchContext.voice === 'female'
        ? PITCH_CONFIG.femaleLowToneMaxPitch
        : PITCH_CONFIG.maleLowToneMaxPitch;
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
