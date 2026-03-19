# Google Sheets Integration Setup

This tutorial supports loading lesson data from Google Sheets for easy content management.

## Benefits

- Edit lessons without touching code
- Collaborate with content creators
- Update content in real-time
- No need for JSON editing

## Setup Instructions

### Step 1: Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it something like "Cantonese Jyutping Lessons"

### Step 2: Structure Your Sheets

Create **3 separate sheets** in your spreadsheet:

#### Sheet 1: Lessons
Columns:
- A: Lesson Number (1, 2, 3, etc.)
- B: Title
- C: Description
- D: Introduction (full text)
- E: Key Points (separated by `|` pipe character)

Example:
```
1 | Introduction to Jyutping Tones | Learn the 6 basic tones | Cantonese has 6 main tones... | Point 1|Point 2|Point 3
```

#### Sheet 2: Audio
Columns:
- A: Lesson Number
- B: Character
- C: Jyutping
- D: Meaning
- E: Audio File Path (relative, e.g., `audio/si1.mp3`)
- F: Notes (optional)

Example:
```
1 | 詩 | si1 | poem (Tone 1: high level) | audio/si1.mp3 | 
```

#### Sheet 3: Quizzes
Columns:
- A: Lesson Number
- B: Quiz Type (`multiple-choice`, `matching`, `fill-blank`, `true-false`)
- C: Question
- D: Options (for multiple choice: separated by `|`; for matching: pairs separated by `;` with `|` between left and right)
- E: Correct Answer (for multiple choice: index 0-3; for fill-blank: answer or multiple answers separated by `|`)
- F: Explanation (optional)

Example Multiple Choice:
```
1 | multiple-choice | How many main tones? | 4 tones|5 tones|6 tones|7 tones | 2 | Cantonese has 6 main tones
```

Example Matching:
```
2 | matching | Match the Jyutping | baa1|bus;paa4|climb;daa2|hit |  | 
```

Example Fill in Blank:
```
1 | fill-blank | The romanization system is called ___. |  | Jyutping|jyutping | Jyutping is the standard system
```

### Step 3: Get Google Sheets API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable "Google Sheets API"
   - Go to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create credentials
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy your API key
5. (Optional but recommended) Restrict your API key:
   - Edit the API key
   - Under "API restrictions", select "Restrict key"
   - Select only "Google Sheets API"
   - Under "Website restrictions", add your GitHub Pages URL

### Step 4: Make Your Sheet Public

1. In your Google Sheet, click "Share"
2. Click "Change to anyone with the link"
3. Set permission to "Viewer"
4. Copy the Spreadsheet ID from the URL
   - URL format: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

### Step 5: Configure the Application

Edit `js/data-loader.js`:

```javascript
// Change this line
const DATA_SOURCE = 'google-sheets'; // Changed from 'local'

// Fill in these values
const GOOGLE_SHEETS_CONFIG = {
    apiKey: 'YOUR_API_KEY_HERE',
    spreadsheetId: 'YOUR_SPREADSHEET_ID_HERE',
    lessonRange: 'Lessons!A2:E',  // Adjust if needed
    audioRange: 'Audio!A2:F',      // Adjust if needed
    quizRange: 'Quizzes!A2:G'      // Adjust if needed
};
```

### Step 6: Deploy and Test

1. Commit and push your changes to GitHub
2. Visit your GitHub Pages site
3. Check browser console for any errors
4. Verify lessons load correctly

## Troubleshooting

### "Failed to load from Google Sheets"
- Check that your API key is correct
- Verify the spreadsheet ID
- Ensure the sheet is publicly accessible
- Check browser console for specific errors

### "No lessons available"
- Verify sheet names match exactly (case-sensitive)
- Check that data starts at row 2 (row 1 should be headers)
- Ensure all required columns have data

### Audio files not playing
- Verify audio file paths are correct and relative to your site root
- Ensure audio files are uploaded to your repository
- Check browser console for 404 errors

## Sample Spreadsheet

You can make a copy of our sample spreadsheet:
[Link to be added]

## Security Notes

- API keys should be restricted to your domain
- Never expose admin/write access keys in frontend code
- Consider using a backend proxy for production apps
- The current setup is suitable for public, read-only educational content

## Alternative: Stay with Local JSON

If Google Sheets integration seems complex, you can continue using the local `data/lessons.json` file. Simply keep `DATA_SOURCE = 'local'` in the data-loader.js file and edit the JSON directly.
