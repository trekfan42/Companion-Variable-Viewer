const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,          // Default width
    height: 800,         // Default height
    minWidth: 500,       // Minimum size to prevent issues
    minHeight: 400,
    backgroundColor: '#000000',
    title: 'Companion Variable Dashboard',
    webPreferences: {
      // Allows use of Node.js features in the renderer process (your index.html).
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js') // Optional, for context isolation
        }
    });

  mainWindow.loadFile('index.html');

}

// Function to handle the exportToXML request
async function handleExportToXML(xmlData) {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save XML File',
        defaultPath: 'companion_variables.xml', // Default filename
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

// This method will be called when Electron has finished initialization.
app.whenReady().then(() => {
    ipcMain.handle('export-to-xml', handleExportToXML);
    createWindow();
});


// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Add the following lines to the end of the file:
// Expose the handleExportToXML function to the renderer process
// This is done by the preload script.
app.on('web-contents-created', (event, webContents) => {
    webContents.on('did-finish-load', () => {
        webContents.executeJavaScript(`
            window.electronAPI = {
                exportToXML: (xmlData) => {
                    return window.electron.ipcRenderer.invoke('export-to-xml', xmlData);
                }
            };
        `);
    });
});

// Re-create a window in the app when the dock icon is clicked (macOS).
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
