// Data Loader Module
// Handles loading lesson data from JSON or Google Sheets

const DATA_SOURCE = 'local';
const LOCAL_DATA_PATH = './data/lessons.json';

export async function loadLessonsData() {
    try {
        const response = await fetch(LOCAL_DATA_PATH);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.lessons || [];
        
    } catch (error) {
        console.error('Error loading local data:', error);
        return [];
    }
}
