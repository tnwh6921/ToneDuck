# Quick Start Guide

## Getting Started

Your Cantonese Jyutping Tutorial is now set up! Follow these steps to view and customize it.

## View Locally

### Option 1: Simple File Open (Limited Functionality)
1. Open `index.html` in a web browser
2. Note: Some features may not work due to CORS restrictions

### Option 2: Local Web Server (Recommended)

**Using Python 3:**
```powershell
cd c:\Users\annwa\OneDrive\Desktop\Workspace\epepep
python -m http.server 8000
```

Then visit: http://localhost:8000

**Using Node.js:**
```powershell
npx serve
```

**Using VS Code:**
- Install "Live Server" extension
- Right-click on `index.html` → "Open with Live Server"

## Project Overview

### Files Created

```
epepep/
├── index.html              # Main landing page with lesson grid
├── lesson.html             # Individual lesson page
├── README.md               # Project documentation
├── GOOGLE_SHEETS_SETUP.md  # Google Sheets integration guide
├── .gitignore              # Git ignore rules
│
├── css/
│   └── styles.css          # Complete styling (warm color scheme)
│
├── js/
│   ├── app.js              # Home page logic
│   ├── lesson.js           # Lesson page controller
│   ├── quiz.js             # All quiz types (multiple choice, matching, fill-blank)
│   ├── audio.js            # Audio playback & recording
│   └── data-loader.js      # Data loading (JSON or Google Sheets)
│
├── data/
│   └── lessons.json        # Sample lesson data (5 complete lessons)
│
└── audio/
    └── README.md           # Instructions for adding audio files
```

## Customization Guide

### 1. Update Content

**Using Local JSON (Default):**
- Edit `data/lessons.json`
- Follow the existing structure for lessons, audio samples, and quizzes

**Using Google Sheets:**
- Follow instructions in `GOOGLE_SHEETS_SETUP.md`
- Update `js/data-loader.js` with your API key and spreadsheet ID

### 2. Add Audio Files

1. Record or obtain audio files for pronunciation samples
2. Name them according to Jyutping (e.g., `si1.mp3`, `hoeng1_gong2.mp3`)
3. Place in `audio/` directory
4. Update file paths in `lessons.json` or Google Sheet

### 3. Customize Colors

Edit `css/styles.css` to change the color scheme:

```css
:root {
    --primary-color: #E07A5F;      /* Main accent color */
    --secondary-color: #F2CC8F;    /* Secondary accent */
    --accent-color: #81B29A;       /* Additional accent */
    --background: #FAF9F6;         /* Page background */
    --text-primary: #3D405B;       /* Main text color */
}
```

### 4. Modify Layout

- **index.html**: Home page structure
- **lesson.html**: Lesson page layout
- **css/styles.css**: All styling and responsive design

## Deploy to GitHub Pages

### Step 1: Initialize Git Repository

```powershell
cd c:\Users\annwa\OneDrive\Desktop\Workspace\epepep
git init
git add .
git commit -m "Initial commit: Cantonese Jyutping Tutorial"
```

### Step 2: Create GitHub Repository

1. Go to [GitHub](https://github.com)
2. Click "New Repository"
3. Name it (e.g., "cantonese-jyutping-tutorial")
4. Don't initialize with README (you already have one)
5. Click "Create repository"

### Step 3: Push to GitHub

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### Step 4: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click "Settings"
3. Scroll to "Pages" in the left sidebar
4. Under "Source", select "main" branch
5. Select "/ (root)" folder
6. Click "Save"
7. Your site will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## Features Overview

### Lesson Components

1. **Introduction Section**: Text-based introduction to concepts
2. **Audio Samples**: Playback controls with visual waveform
3. **Voice Recording**: Record and compare your pronunciation
4. **Interactive Quizzes**: Multiple types with instant feedback

### Quiz Types

- **Multiple Choice**: Select from 4 options
- **Fill in the Blank**: Type the correct answer
- **Matching**: Match Jyutping with meanings
- **True/False**: Simple true or false questions

### Mobile Responsive

The site is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones

## Browser Requirements

- Modern browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- For recording: Microphone access permission

## Next Steps

1. ✅ Test the site locally
2. ✅ Review the sample lessons
3. ✅ Add your audio files
4. ✅ Customize content in `lessons.json` or set up Google Sheets
5. ✅ Adjust colors and styling to your preference
6. ✅ Deploy to GitHub Pages
7. ✅ Share with learners!

## Troubleshooting

### Site doesn't load
- Make sure you're using a local web server, not just opening the file
- Check browser console for errors (F12)

### Audio doesn't play
- Verify audio files exist in the `audio/` directory
- Check file paths in `lessons.json`
- Ensure audio files are in supported formats (MP3, WAV, OGG)

### Recording doesn't work
- Grant microphone permission when prompted
- Check that your device has a working microphone
- Try in different browsers (Chrome works best)

### Quizzes don't appear
- Check that quiz data is properly formatted in `lessons.json`
- Open browser console to see any error messages

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review GOOGLE_SHEETS_SETUP.md for Google Sheets integration
3. Check browser console for error messages
4. Review the sample data in `data/lessons.json` for formatting examples

## What's Included

✅ Complete HTML structure  
✅ Modern CSS with warm color scheme  
✅ Responsive design for all devices  
✅ Quiz system (4 types)  
✅ Audio playback functionality  
✅ Voice recording capability  
✅ Sample data (5 lessons)  
✅ Google Sheets integration support  
✅ GitHub Pages ready  

Enjoy teaching Cantonese Jyutping! 🎓
