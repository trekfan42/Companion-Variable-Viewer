const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200,          // Default width
        height: 800,         // Default height
        minWidth: 500,       // Minimum size to prevent issues
        minHeight: 400,
        backgroundColor: '#000000',
        title: 'Companion Variable Dashboard',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
}

// Function to handle the exportToXML request
async function handleExportToXML(xmlData) {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save XML File',
        defaultPath: 'companion_variables.xml',
        filters: [{ name: 'XML Files', extensions: ['xml'] }]
    });

    if (filePath) {
        try {
            fs.writeFileSync(filePath, xmlData);
            return { success: true, message: 'File saved successfully' };
        } catch (error) {
            return { success: false, message: 'Error saving file: ' + error.message };
        }
    } else {
        return { success: false, message: 'File save cancelled' };
    }
}

// --- IPC IPC Handlers ---

ipcMain.handle('export-to-xml', (event, xmlData) => handleExportToXML(xmlData));

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


