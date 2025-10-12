import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase/Auth Setup (Boilerplate - keeping as is) ---
setLogLevel('Debug');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;

let db, auth, userId;
let isAuthReady = false;

if (firebaseConfig) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    (async () => {
        try {
            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
            userId = auth.currentUser?.uid || crypto.randomUUID();
            isAuthReady = true;
        } catch (error) {
            console.error("Firebase Auth Error:", error);
        }
    })();
}
// --- End Firebase Setup ---

// Dashboard state management
let variableWindows = [];
let editingWindowId = null;

// Global variables for monitoring
let monitorInterval = null;
const FETCH_INTERVAL_MS = 1000;

// NEW: Snap threshold in pixels
const SNAP_THRESHOLD = 10;

// DOM Elements
const ipInput = document.getElementById('companion-ip');
const portInput = document.getElementById('companion-port');
const dashboardContainer = document.getElementById('dashboard-container');
const statusMessage = document.getElementById('status-message');
const toggleButton = document.getElementById('toggle-monitor-button');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const addWindowButton = document.getElementById('add-window-button');

// Modal Elements
const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle = document.getElementById('modal-title');
const modalInputVariable = document.getElementById('modal-input-variable');
const modalTitleInput = document.getElementById('modal-title-input');
const modalBgColor = document.getElementById('modal-bg-color');
const modalFontColor = document.getElementById('modal-font-color');
const modalAlignmentRadios = document.getElementById('modal-alignment-radios');
const modalSubmitButton = document.getElementById('modal-submit-button');

// NEW: Snap Line Elements (will be referenced in onload and renderDashboard)
let snapLineX;
let snapLineY;
let xmlUploadInput; 

// Drag/Resize State
let activeWindowId = null;
let isDragging = false;
let isResizing = false;
let startX = 0;
let startY = 0;
let startWidth = 0;
let startHeight = 0;
let startWindowX = 0;
let startWindowY = 0;

/**
 * Utility function to generate a new window object with defaults.
 */
function createNewWindowObject(id = crypto.randomUUID(), defaults = {}) {
     const centerX = window.innerWidth / 2;
     const centerY = window.innerHeight / 2;
     const windowWidth = defaults.width || 350;
     const windowHeight = defaults.height || 250;
     
     return {
         id: id,
         variableId: defaults.variableId || '',
         customTitle: defaults.customTitle || '',
         value: '...',
         // Center the new window relative to current scroll position
         x: defaults.x || (centerX - (windowWidth / 2) + dashboardContainer.scrollLeft), 
         y: defaults.y || (centerY - (windowHeight / 2) + dashboardContainer.scrollTop),
         width: windowWidth,
         height: windowHeight,
         bgColor: defaults.bgColor || '#000000',
         fontColor: defaults.fontColor || '#ffffff',
         textAlign: defaults.textAlign || 'center',
         isEditing: false
     };
}


/**
 * Toggles the visibility of the sidebar.
 */
window.toggleSidebar = function() {
    sidebar.classList.toggle('open');
}

/**
 * Utility to display status or error messages.
 */
function setStatus(message, type = 'warning') {
    statusMessage.textContent = message;
    statusMessage.className = 'w-full px-3 py-2 text-center rounded-lg text-xs transition-colors duration-200';
    statusMessage.classList.remove('hidden', 'bg-red-900', 'text-red-300', 'bg-green-900', 'text-green-300', 'bg-yellow-900', 'text-yellow-300');

    if (type === 'error') {
        statusMessage.classList.add('bg-red-900', 'text-red-300');
    } else if (type === 'success') {
        statusMessage.classList.add('bg-green-900', 'text-green-300');
    } else { // warning/info
        statusMessage.classList.add('bg-yellow-900', 'text-yellow-300');
    }
}

/**
 * Loads the dashboard state from LocalStorage or initializes default state.
 */
function loadDashboardState() {
    const savedIP = localStorage.getItem('companionIP');
    const savedPort = localStorage.getItem('companionPort');
    const savedWindows = localStorage.getItem('companionWindows');

    if (savedIP) ipInput.value = savedIP;
    if (savedPort) portInput.value = savedPort;

    if (savedWindows) {
        try {
            const loadedWindows = JSON.parse(savedWindows);
            variableWindows = loadedWindows.map(win => ({
                // Merge saved properties with defaults for new properties
                ...createNewWindowObject(win.id, win),
                // Overwrite with actual saved data
                x: win.x,
                y: win.y,
                width: win.width,
                height: win.height,
                variableId: win.variableId,
                customTitle: win.customTitle,
                // Ensure color/alignment properties are present
                bgColor: win.bgColor || '#000000',
                fontColor: win.fontColor || '#ffffff',
                textAlign: win.textAlign || 'center',
                value: '...',
            }));
        } catch (e) {
            console.error("Error parsing saved state from localStorage:", e);
            variableWindows = [];
        }
    }

    if (variableWindows.length === 0) {
        // Initialize with one default window if none exist
        variableWindows.push(createNewWindowObject(crypto.randomUUID(), { variableId: 'internal:time_hms', customTitle: 'System Time' }));
    }
    renderDashboard();
}

/**
 * Saves the current dashboard state and settings to LocalStorage.
 */
function saveDashboardState() {
    // 1. Save settings
    localStorage.setItem('companionIP', ipInput.value.trim());
    localStorage.setItem('companionPort', portInput.value.trim());

    // 2. Save window state (including new properties)
    const stateToSave = variableWindows.map(win => ({
        id: win.id,
        variableId: win.variableId,
        customTitle: win.customTitle, 
        x: win.x,
        y: win.y,
        width: win.width,
        height: win.height,
        bgColor: win.bgColor,
        fontColor: win.fontColor,
        textAlign: win.textAlign,
    }));

    localStorage.setItem('companionWindows', JSON.stringify(stateToSave));
}

/**
 * Calculates and sets the font size for the variable value display based on window size.
 */
function setDynamicFontSize(windowElement) {
    const width = windowElement.offsetWidth;
    const height = windowElement.offsetHeight;
    
    if (width === 0 || height === 0) return; 

    const contentWidth = width - 10; 
    const contentHeight = height - 30; 

    const widthBasedSize = Math.floor(contentWidth * 0.20); 
    const heightBasedSize = Math.floor(contentHeight * 0.50);

    const finalFontSize = Math.min(widthBasedSize, heightBasedSize);

    const valueDisplay = windowElement.querySelector('.value-display');
    if (valueDisplay) {
        valueDisplay.style.fontSize = `${finalFontSize}px`;
    }
}

/**
 * Renders the dashboard based on the current `variableWindows` state.
 */
function renderDashboard() {
    // Clear the container
    dashboardContainer.innerHTML = '';
    
    // Re-add hidden input and snap lines
    dashboardContainer.innerHTML = `
        <input type="file" id="xml-upload-input" accept=".xml" style="display: none;">
        <div id="snap-line-x" class="snap-line-x"></div>
        <div id="snap-line-y" class="snap-line-y"></div>
    `;
    
    // Re-reference snap lines and XML input after clearing innerHTML
    snapLineX = document.getElementById('snap-line-x');
    snapLineY = document.getElementById('snap-line-y');
    xmlUploadInput = document.getElementById('xml-upload-input');
    
    // Re-attach listener
    xmlUploadInput.addEventListener('change', window.importFromXML); 
    
    variableWindows.forEach((win, index) => {
        if (!win.variableId) return;

        const windowElement = document.createElement('div');
        windowElement.className = 'variable-window';
        windowElement.id = `win-${win.id}`;
        windowElement.setAttribute('data-index', index);
        
        // Set position, size, and background color
        windowElement.style.left = `${win.x}px`;
        windowElement.style.top = `${win.y}px`;
        windowElement.style.width = `${win.width}px`;
        windowElement.style.height = `${win.height}px`;
        windowElement.style.backgroundColor = win.bgColor;


        // Set drag listener on the window body
        windowElement.addEventListener('mousedown', (e) => window.handleDragStart(e, win.id));
        windowElement.addEventListener('touchstart', (e) => window.handleTouchStart(e, win.id, 'drag'));

        const titleToDisplay = win.customTitle || win.variableId;

        windowElement.innerHTML = `
            <div class="control-button edit-button" onclick="window.openModal('${win.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M20,16v4a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V6A2,2,0,0,1,4,4H8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
                    <polygon fill="none" points="12.5 15.8 22 6.2 17.8 2 8.3 11.5 8 16 12.5 15.8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="control-button delete-button" onclick="window.deleteWindow('${win.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
            </div>
            <span class="custom-title">${titleToDisplay}</span> <div class="window-content">
                <div id="value-${win.id}" class="value-display" style="color: ${win.fontColor}; text-align: ${win.textAlign};">${win.value || '...'}</div>
            </div>
            <div class="resizer" onmousedown="window.handleResizeStart(event, '${win.id}')" ontouchstart="window.handleTouchStart(event, '${win.id}', 'resize')"></div>
        `;
        
        // Add double-click to open modal on the content area
        windowElement.querySelector('.window-content').addEventListener('dblclick', (e) => {
            e.stopPropagation(); 
            window.openModal(win.id);
        });
        
        dashboardContainer.appendChild(windowElement);
    });
    
    // Apply font sizing after DOM update
    setTimeout(() => {
        document.querySelectorAll('.variable-window').forEach(setDynamicFontSize);
    }, 50);

    // Re-fetch variables if monitoring is active (to update values after render)
    if (monitorInterval) {
         fetchVariable();
    }
}

/**
 * Opens the modal for editing an existing window or creating a new one.
 */
window.openModal = function(id = null) {
    editingWindowId = id;
    let win;

    if (id) {
        // Editing existing window
        win = variableWindows.find(w => w.id === id);
        modalTitle.textContent = `Edit Variable: ${win.customTitle || win.variableId}`;
        modalSubmitButton.textContent = 'Update Monitor';
    } else {
        // Adding new window - create a temporary object for defaults
        win = createNewWindowObject();
        modalTitle.textContent = 'Create New Variable Monitor';
        modalSubmitButton.textContent = 'Add Monitor';
        
        // Close sidebar if open
        if (sidebar.classList.contains('open')) {
            window.toggleSidebar();
        }
    }

    // Populate form fields
    modalInputVariable.value = win.variableId;
    modalTitleInput.value = win.customTitle;
    modalBgColor.value = win.bgColor;
    modalFontColor.value = win.fontColor;
    
    // Populate alignment radios
    modalAlignmentRadios.innerHTML = `
        ${['left', 'center', 'right'].map(align => `
            <label class="text-white flex items-center space-x-1 cursor-pointer">
                <input type="radio" name="modal-align" value="${align}" class="form-radio h-4 w-4 text-companion-blue" ${win.textAlign === align ? 'checked' : ''}>
                <span class="text-sm capitalize">${align}</span>
            </label>
        `).join('')}
    `;
    
    // Show modal
    modalBackdrop.classList.remove('hidden');
    // Auto-focus the variable input field
    setTimeout(() => modalInputVariable.focus(), 100);
}

/**
 * Closes the modal.
 */
window.closeModal = function() {
    modalBackdrop.classList.add('hidden');
    editingWindowId = null;
};


/**
 * Deletes a variable window.
 */
window.deleteWindow = function(id) {
     const win = variableWindows.find(w => w.id === id);
     if (!win) return;
     
     const confirmationMessage = `Are you sure you want to delete the monitor for ${win.customTitle || win.variableId || 'this empty window'}?`;
     if (!confirm(confirmationMessage)) {
        return;
     }
    
    variableWindows = variableWindows.filter(w => w.id !== id);
    saveDashboardState();
    renderDashboard();
}

/**
 * Submits the variable ID and custom title from the modal form.
 */
window.submitVariable = function(event) {
    event.preventDefault();

    let newVariableId = modalInputVariable.value.trim();
    let newCustomTitle = modalTitleInput.value.trim(); 
    let newBgColor = modalBgColor.value;
    let newFontColor = modalFontColor.value;
    let newTextAlign = document.querySelector('input[name="modal-align"]:checked')?.value || 'center';
    
    // Sanitize the input to strip Companion's $( ) wrapper
    if (newVariableId.startsWith('$(') && newVariableId.endsWith(')')) {
        newVariableId = newVariableId.substring(2, newVariableId.length - 1);
    }

    if (!newVariableId.includes(':')) {
        setStatus('Invalid format. Variable ID requires "label:name" (e.g., internal:time_hms).', 'error');
        return;
    }

    if (editingWindowId) {
        // EDIT EXISTING WINDOW
        const win = variableWindows.find(w => w.id === editingWindowId);
        if (win) {
            win.variableId = newVariableId;
            win.customTitle = newCustomTitle;
            win.bgColor = newBgColor;
            win.fontColor = newFontColor;
            win.textAlign = newTextAlign;
            win.value = '...'; // Reset value for immediate refresh
        }
    } else {
        // ADD NEW WINDOW (create a new object and push it)
         const newWin = createNewWindowObject(crypto.randomUUID(), {
             variableId: newVariableId,
             customTitle: newCustomTitle,
             bgColor: newBgColor,
             fontColor: newFontColor,
             textAlign: newTextAlign,
         });
         variableWindows.push(newWin);
    }

    window.closeModal();
    saveDashboardState();
    renderDashboard();
    
    if (monitorInterval) {
        fetchVariable();
    }
}

// --- XML Import/Export Functions (kept as is) ---
function sanitizeFilename(filename) { 
    return filename.replace(/[/\\?%*:|"<>]/g, '') || 'companion_dashboard_export';
}

window.exportToXML = function () {
    const doc = document.implementation.createDocument(null, 'CompanionDashboard', null);
    const root = doc.documentElement;
    const settings = doc.createElement('Settings');
    settings.setAttribute('ip', ipInput.value.trim());
    settings.setAttribute('port', portInput.value.trim());
    root.appendChild(settings);
    const windowsElement = doc.createElement('Windows');
    variableWindows.forEach(win => {
        const el = doc.createElement('Window');
        el.setAttribute('id', win.id);
        el.setAttribute('x', win.x);
        el.setAttribute('y', win.y);
        el.setAttribute('width', win.width);
        el.setAttribute('height', win.height);
        el.setAttribute('variableId', win.variableId || '');
        el.setAttribute('customTitle', win.customTitle || '');
        // ADD NEW PROPERTIES TO XML EXPORT
        el.setAttribute('bgColor', win.bgColor || '#000000');
        el.setAttribute('fontColor', win.fontColor || '#ffffff');
        el.setAttribute('textAlign', win.textAlign || 'center');
        
        windowsElement.appendChild(el);
    });
    root.appendChild(windowsElement);

    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(doc);
    const defaultFilename = 'companion_dashboard_export.xml';
    const sanitizedFilename = sanitizeFilename(defaultFilename);
    const blob = new Blob([xmlString], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Dashboard saved to ${sanitizedFilename}`, 'success');
};


window.triggerImportXML = function() {
    xmlUploadInput.click();
};

window.importFromXML = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                throw new Error("Invalid XML file structure.");
            }

            const newWindows = [];
            const windowNodes = xmlDoc.getElementsByTagName('Window');

            const settingsNode = xmlDoc.getElementsByTagName('Settings')[0];
            if (settingsNode) {
                 ipInput.value = settingsNode.getAttribute('ip') || ipInput.value;
                 portInput.value = settingsNode.getAttribute('port') || ipInput.value;
                 localStorage.setItem('companionIP', ipInput.value);
                 localStorage.setItem('companionPort', ipInput.value);
            }

            for (let i = 0; i < windowNodes.length; i++) {
                const node = windowNodes[i];
                const winData = {
                    id: node.getAttribute('id') || crypto.randomUUID(),
                    x: parseFloat(node.getAttribute('x')) || 50,
                    y: parseFloat(node.getAttribute('y')) || 50,
                    width: parseFloat(node.getAttribute('width')) || 350,
                    height: parseFloat(node.getAttribute('height')) || 250,
                    variableId: node.getAttribute('variableId') || '',
                    customTitle: node.getAttribute('customTitle') || '',
                    // PARSE NEW PROPERTIES FROM XML
                    bgColor: node.getAttribute('bgColor') || '#000000',
                    fontColor: node.getAttribute('fontColor') || '#ffffff',
                    textAlign: node.getAttribute('textAlign') || 'center',
                    value: '...',
                };
                newWindows.push(winData);
            }

            if (newWindows.length === 0) {
                setStatus('XML imported but no valid Window data found.', 'warning');
                return;
            }

            variableWindows = newWindows;
            saveDashboardState();
            renderDashboard();
            setStatus(`Successfully loaded ${newWindows.length} windows from XML.`, 'success');

        } catch (error) {
            console.error("XML Import Error:", error);
            setStatus(`Failed to load XML: ${error.message || 'Invalid file format.'}`, 'error');
        }
    };
    reader.readAsText(file);
};
// --- End XML Functions ---

// --- Dragging, Resizing, and SNAPPING Handlers ---

function getWindowElement(id) {
     return document.getElementById(`win-${id}`);
}

// NEW: Snap Line Rendering Helpers
function hideSnapLines() {
    if (snapLineX) snapLineX.style.display = 'none';
    if (snapLineY) snapLineY.style.display = 'none';
}

function renderSnapLines(snapX, snapY) {
    if (!snapLineX || !snapLineY) return;

    // To convert dashboard (relative) coordinates to fixed (viewport) coordinates:
    const scrollLeft = dashboardContainer.scrollLeft;
    const scrollTop = dashboardContainer.scrollTop;

    if (snapX !== null) {
        // Viewport X = Dashboard X - Scroll X
        const fixedX = snapX - scrollLeft;
        snapLineX.style.left = `${fixedX}px`;
        snapLineX.style.display = 'block';
    } else {
        snapLineX.style.display = 'none';
    }

    if (snapY !== null) {
        // Viewport Y = Dashboard Y - Scroll Y
        const fixedY = snapY - scrollTop;
        snapLineY.style.top = `${fixedY}px`;
        snapLineY.style.display = 'block';
    } else {
        snapLineY.style.display = 'none';
    }
}

// NEW: Snap Detection Logic
function findSnap(currentWin, currentX, currentY, isDragging) {
    let snapX = null;
    let snapY = null;
    let finalX = currentX;
    let finalY = currentY;

    // Get the edges of the currently dragged/resized window
    const current = {
        left: finalX,
        center: finalX + (currentWin.width / 2),
        right: finalX + currentWin.width,
        top: finalY,
        middle: finalY + (currentWin.height / 2),
        bottom: finalY + currentWin.height,
        width: currentWin.width,
        height: currentWin.height
    };
    
    // The list of alignment coordinates to check against. 
    const targetX = [];
    const targetY = [];

    // Collect all snap targets from other windows
    variableWindows.forEach(targetWin => {
        if (targetWin.id === currentWin.id) return;

        // X alignment targets: Left, Center, Right of target window
        targetX.push({ pos: targetWin.x, type: 'left' }); // Left edge
        targetX.push({ pos: targetWin.x + (targetWin.width / 2), type: 'center' }); // Center axis
        targetX.push({ pos: targetWin.x + targetWin.width, type: 'right' }); // Right edge
    
        // Y alignment targets: Top, Middle, Bottom of target window
        targetY.push({ pos: targetWin.y, type: 'top' }); // Top edge
        targetY.push({ pos: targetWin.y + (targetWin.height / 2), type: 'middle' }); // Middle axis
        targetY.push({ pos: targetWin.y + targetWin.height, type: 'bottom' }); // Bottom edge
    });
    
    // --- Horizontal (X) Snapping ---
    const currentXPoints = [
        { pos: current.left, offset: 0 },                       // Current left aligns with target (Left->Left snap)
        { pos: current.center, offset: current.width / 2 },     // Current center aligns with target (Center->Center snap)
        { pos: current.right, offset: current.width },          // Current right aligns with target (Right->Right snap)
    ];

    // If resizing, we only check the right edge
    if (isResizing && !isDragging) {
         currentXPoints.splice(0, 2); 
    }
    
    for (const cPoint of currentXPoints) {
        for (const tPoint of targetX) {
            const delta = Math.abs(cPoint.pos - tPoint.pos);
            
            if (delta <= SNAP_THRESHOLD) {
                // Snap found!
                // Calculate the new X position for the *current* window
                finalX = tPoint.pos - cPoint.offset;
                snapX = tPoint.pos;
                break;
            }
        }
        if (snapX !== null) break;
    }

    // --- Vertical (Y) Snapping ---
    const currentYPoints = [
        { pos: current.top, offset: 0 },                        // Current top aligns with target (Top->Top snap)
        { pos: current.middle, offset: current.height / 2 },    // Current middle aligns with target (Middle->Middle snap)
        { pos: current.bottom, offset: current.height },        // Current bottom aligns with target (Bottom->Bottom snap)
    ];
    
    // If resizing, we only check the bottom edge
    if (isResizing && !isDragging) {
         currentYPoints.splice(0, 2); 
    }

    for (const cPoint of currentYPoints) {
        for (const tPoint of targetY) {
            const delta = Math.abs(cPoint.pos - tPoint.pos);
            
            if (delta <= SNAP_THRESHOLD) {
                // Snap found!
                // Calculate the new Y position for the *current* window
                finalY = tPoint.pos - cPoint.offset;
                snapY = tPoint.pos;
                break;
            }
        }
        if (snapY !== null) break;
    }

    return { finalX, finalY, snapX, snapY };
}

window.handleDragStart = function(e, id) {
    // Updated to also ignore control buttons
    if (e.target.classList.contains('resizer') || e.target.closest('.control-button')) {
        return;
    }
    if (e.button !== 0 && !e.touches) return; 
    
    activeWindowId = id;
    const winElement = getWindowElement(id);
    const win = variableWindows.find(w => w.id === id);

    if (winElement && win) {
        isDragging = true;
        winElement.style.cursor = 'grabbing';
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        startWindowX = win.x;
        startWindowY = win.y;
        
        winElement.style.zIndex = variableWindows.length + 10;
    }
}

window.handleResizeStart = function(e, id) {
    e.stopPropagation(); 
    if (e.button !== 0 && !e.touches) return; 

    activeWindowId = id;
    const winElement = getWindowElement(id);
    const win = variableWindows.find(w => w.id === id);

    if (winElement && win) {
        isResizing = true;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        startWidth = win.width;
        startHeight = win.height;
        
        winElement.style.zIndex = variableWindows.length + 10;
    }
}

window.handleDragMove = function(e) {
    if (!isDragging && !isResizing) return;
    e.preventDefault(); // Prevents scroll/zoom on mobile when dragging

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const winElement = getWindowElement(activeWindowId);
    const win = variableWindows.find(w => w.id === activeWindowId);
    if (!winElement || !win) {
         hideSnapLines();
         return;
    }

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    let newX = win.x;
    let newY = win.y;
    let newWidth = win.width;
    let newHeight = win.height;
    let snapX = null;
    let snapY = null;
    
    // --- 1. Calculate new potential position/size ---
    if (isDragging) {
        newX = startWindowX + deltaX;
        newY = startWindowY + deltaY;
    } else if (isResizing) {
        newWidth = startWidth + deltaX;
        newHeight = startHeight + deltaY;
    }
    
    // --- 2. Apply Snapping (for Dragging and Resizing) ---
    if (isDragging) {
        const snapResult = findSnap(
            { id: win.id, width: win.width, height: win.height }, 
            newX, 
            newY, 
            true // isDragging
        );
        
        newX = snapResult.finalX;
        newY = snapResult.finalY;
        snapX = snapResult.snapX;
        snapY = snapResult.snapY;

        // Update model state for dragging
        win.x = newX;
        win.y = newY;
    } else if (isResizing) {
        // To snap the right/bottom edges during resize, we simulate a drag of the edge
        const simWin = { id: win.id, width: newWidth, height: newHeight };
        
        // Simulated X check: check snap for the right edge of the new width
        const snapResultX = findSnap(
            simWin, 
            win.x, 
            win.y, 
            false // isDragging
        );
        
        if (snapResultX.snapX !== null) {
            // new width = (snapped X coord) - (win.x)
            newWidth = snapResultX.snapX - win.x;
            snapX = snapResultX.snapX;
        }
        
        // Simulated Y check: check snap for the bottom edge of the new height
        const snapResultY = findSnap(
            simWin, 
            win.x, 
            win.y, 
            false // isDragging
        );
        
        if (snapResultY.snapY !== null) {
            // new height = (snapped Y coord) - (win.y)
            newHeight = snapResultY.snapY - win.y;
            snapY = snapResultY.snapY;
        }
        
        // Apply minimum dimensions
        if (newWidth >= 100) { 
            win.width = newWidth;
        } else {
            snapX = null; // Clear snap line if we hit minimum size
        }
        
        if (newHeight >= 50) { 
            win.height = newHeight;
        } else {
            snapY = null; // Clear snap line if we hit minimum size
        }
    }

    // --- 3. Update DOM for position/size ---
    winElement.style.left = `${win.x}px`;
    winElement.style.top = `${win.y}px`;
    winElement.style.width = `${win.width}px`;
    winElement.style.height = `${win.height}px`;

    // Re-calculate font size on resize
    if (isResizing) {
         setDynamicFontSize(winElement);
    }

    // --- 4. Render Snap Lines ---
    renderSnapLines(snapX, snapY);
}

window.handleDragEnd = function(e) {
    if (isDragging || isResizing) {
        isDragging = false;
        isResizing = false;
        
        const winElement = getWindowElement(activeWindowId);
        if (winElement) {
            winElement.style.cursor = 'move';
            winElement.style.zIndex = 1; 
        }
        
        hideSnapLines(); // HIDE lines on drag end
        saveDashboardState();
        activeWindowId = null;
    }
}

window.handleTouchStart = function(e, id, type) {
    e.stopPropagation(); 
    e.preventDefault();
    
    const event = { touches: e.touches, target: e.target };
    if (type === 'drag') {
        window.handleDragStart(event, id);
    } else if (type === 'resize') {
        window.handleResizeStart(event, id);
    }
}

// --- Companion API Fetch Logic (keeping as is) ---
async function fetchVariable() {
    const ip = ipInput.value.trim();
    const port = portInput.value.trim();
    
    if (!ip || !port) {
        setStatus('Companion IP and Port are required.', 'error');
        return;
    }

    const activeWindows = variableWindows.filter(win => win.variableId);
    
    if (activeWindows.length === 0) {
         if (monitorInterval) {
            setStatus('Monitoring is active but no variables are configured.', 'warning');
         }
        return;
    }
    
    for (let i = 0; i < activeWindows.length; i++) {
        const win = activeWindows[i];
        const fullVariableId = win.variableId;
        const parts = fullVariableId.split(':');
        const connectionLabel = parts[0];
        const variableName = parts[1];

        let url = `http://${ip}:${port}/api/variable/${encodeURIComponent(connectionLabel)}/${encodeURIComponent(variableName)}/value`;
        url += `?_t=${Date.now()}`; 

        try {
            const response = await fetch(url, { 
                method: 'GET',
                cache: 'no-store' 
            });

            const valueElement = document.getElementById(`value-${win.id}`);
            const windowElement = getWindowElement(win.id);
            
            if (response.ok) {
                const fetchedValue = await response.text();
                const value = fetchedValue.replace(/\\n/g, '<br>') || 'N/A';
                
                win.value = value;
                if (valueElement) {
                    valueElement.innerHTML = value; 
                    valueElement.style.color = win.fontColor; 
                }
                
                if (windowElement) setDynamicFontSize(windowElement);

                if (monitorInterval) {
                     setStatus(`Monitoring active: ${activeWindows.length} variables updating every 1 second.`, 'success');
                }
            } else {
                win.value = 'ERR';
                if (valueElement) {
                    valueElement.textContent = 'ERR';
                    valueElement.style.color = 'red';
                }
                console.error(`Error fetching ${fullVariableId}: HTTP ${response.status}`);
                setStatus(`Error: HTTP ${response.status} fetching ${fullVariableId}.`, 'error');
            }
        } catch (error) {
            win.value = 'NET';
            const valueElement = document.getElementById(`value-${win.id}`);
            if (valueElement) {
                valueElement.textContent = 'NET';
                valueElement.style.color = 'red';
            }
            console.error(`Network error fetching ${fullVariableId}:`, error);
            setStatus(`Network Error: Cannot reach Companion at ${ip}:${port}.`, 'error');
        }
    }
}

window.toggleMonitoring = function() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        toggleButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        toggleButton.classList.add('bg-green-600', 'hover:bg-green-700');
        toggleButton.textContent = 'Start Monitoring (1s Interval)';
        setStatus('Monitoring stopped.', 'info');
    } else {
        fetchVariable(); 
        monitorInterval = setInterval(fetchVariable, FETCH_INTERVAL_MS);
        toggleButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        toggleButton.classList.add('bg-red-600', 'hover:bg-red-700');
        toggleButton.textContent = 'Stop Monitoring';
        setStatus(`Monitoring started, updating every ${FETCH_INTERVAL_MS / 1000} second.`, 'success');
    }
}

// --- Event Listeners Setup ---

window.onload = function() {
    // Initial DOM references for the elements added by index.html before renderDashboard is called
    snapLineX = document.getElementById('snap-line-x');
    snapLineY = document.getElementById('snap-line-y');
    xmlUploadInput = document.getElementById('xml-upload-input');

    loadDashboardState();
    
    // New Variable button now opens the modal for a new entry
    addWindowButton.addEventListener('click', () => window.openModal(null));

    xmlUploadInput.addEventListener('change', window.importFromXML);

    toggleButton.addEventListener('click', window.toggleMonitoring);

    // Dashboard move/resize listeners
    dashboardContainer.addEventListener('mousemove', window.handleDragMove);
    dashboardContainer.addEventListener('mouseup', window.handleDragEnd);
    dashboardContainer.addEventListener('touchmove', (e) => {
        if (!isDragging && !isResizing) return;
        window.handleDragMove(e);
    }, { passive: false });
    dashboardContainer.addEventListener('touchend', window.handleDragEnd);
};

// Expose helper functions globally for use by dynamically generated content
window.openModal = openModal;
window.closeModal = closeModal;
window.deleteWindow = deleteWindow;
window.submitVariable = submitVariable;
window.exportToXML = exportToXML; 
window.importFromXML = importFromXML; 
window.triggerImportXML = triggerImportXML;
window.toggleSidebar = toggleSidebar; // Ensure this is explicitly exposed globally

window.handleDragStart = handleDragStart;
window.handleResizeStart = handleResizeStart;
window.handleTouchStart = handleTouchStart;
window.handleDragMove = handleDragMove;
window.handleDragEnd = handleDragEnd;

// Re-calculate font size on window resize
window.addEventListener('resize', renderDashboard);