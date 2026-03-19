# Audio Files Directory

This directory will contain audio files for pronunciation samples.

## File Naming Convention

Audio files should be named according to their Jyutping romanization:
- Single syllables: `si1.mp3`, `si2.mp3`, etc.
- Multi-syllable words: `hoeng1_gong2.mp3` (use underscore to separate syllables)

## Supported Formats
- MP3 (recommended)
- WAV
- OGG

## Adding Audio Files

1. Record or obtain audio files for each Jyutping sample
2. Name them according to the convention above
3. Place them in this directory
4. Update the `audioFile` paths in `data/lessons.json` or your Google Sheet

## Notes

- Files in this directory are ignored by git (except this README)
- Keep file sizes reasonable (< 500KB per file)
- Use clear, native speaker recordings when possible
