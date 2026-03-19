# Cantonese Jyutping Tutorial

A modern, interactive web application for learning Cantonese Jyutping pronunciation through structured lessons, quizzes, and audio practice.

## Features

- **5 Comprehensive Lessons**: Progressive learning structure
- **Interactive Quizzes**: Multiple quiz types (matching, fill-in-the-blank, multiple choice)
- **Audio Samples**: Native pronunciation examples
- **Voice Recording**: Record and compare your own pronunciation
- **Google Sheets Integration**: Easy content management through Google Sheets
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **GitHub Pages Ready**: Static site ready to deploy

## Project Structure

```
epepep/
├── index.html              # Main landing page
├── lesson.html             # Lesson template page
├── css/
│   └── styles.css          # Main stylesheet (warm color scheme)
├── js/
│   ├── app.js              # Main application logic
│   ├── lesson.js           # Lesson page functionality
│   ├── quiz.js             # Quiz components and logic
│   ├── audio.js            # Audio playback and recording
│   └── data-loader.js      # Google Sheets data integration
├── data/
│   └── lessons.json        # Sample lesson data structure
└── audio/                  # Audio files directory (to be added)
```

## Data Structure

Lesson data can be maintained in Google Sheets and loaded into the application. See `data/lessons.json` for the expected structure.

### Google Sheets Format

Your Google Sheet should have the following structure:
- Sheet 1: Lessons metadata
- Sheet 2: Audio samples
- Sheet 3: Quiz questions

## Deployment to GitHub Pages

1. Push this repository to GitHub
2. Go to repository Settings → Pages
3. Select source: Deploy from branch (main)
4. Select folder: / (root)
5. Click Save

Your site will be available at: `https://[username].github.io/[repository-name]/`

## Local Development

Simply open `index.html` in a modern web browser. For best results, use a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js
npx serve
```

Then visit `http://localhost:8000`

## Browser Requirements

- Modern browser with ES6+ support
- Web Audio API support (for recording feature)
- MediaRecorder API support

## Future Enhancements

- Progress tracking
- Spaced repetition system
- Additional quiz types
- Certificate of completion
- Dark mode toggle

## License

MIT License
