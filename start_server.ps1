# Checks for Python, starts a simple HTTP server in the same directory, and opens the HTML file.

$htmlFileName = "Companion variable viewer.html"
$port = 8000
$serverUrl = "http://localhost:$port/$htmlFileName"
$pythonExecutable = "python" # We'll rely on the system PATH having Python or 'py'
$scriptDirectory = Split-Path -Path $MyInvocation.MyCommand.Path -Parent

# --- 1. Python Check ---
Write-Host "Checking for Python..." -ForegroundColor Cyan
$pythonFound = $false

if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonFound = $true
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonExecutable = "py"
    $pythonFound = $true
}

if ($pythonFound) {
    $pythonVersion = (& $pythonExecutable -V 2>&1)
    Write-Host "Python found: $pythonVersion (using executable '$pythonExecutable')" -ForegroundColor Green
}

if (-not $pythonFound) {
    Write-Host "Error: Python not found." -ForegroundColor Red
    Write-Host "Please install Python 3 and ensure it is added to the system PATH." -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit 1
}

$pythonVersion = (& $pythonExecutable -V 2>&1)
Write-Host "Python found: $pythonVersion (using executable '$pythonExecutable')" -ForegroundColor Green

# --- 2. Start Python HTTP Server ---
Write-Host "Starting Python HTTP server on port $port in directory: $scriptDirectory" -ForegroundColor Cyan

# Define Python command to run the server
$serverCommand = "$pythonExecutable -m http.server $port"

# Launch the server process. We need a way to track this process if we compiled this as an EXE, 
# but since it's a script being run by a launcher, we will rely on killing the port later.
$serverProcessArguments = @(
    '-NoProfile', 
    '-ExecutionPolicy', 'Bypass', 
    '-NoExit', 
    '-Command', 
    "cd '$scriptDirectory'; Write-Host ""Companion Server running. Close this window to shut down.""; & $serverCommand"
)

# Start the separate server process (it runs detached)
Start-Process powershell -ArgumentList $serverProcessArguments -WindowStyle Hidden

Write-Host "Server successfully started." -ForegroundColor Green
Write-Host "Dashboard URL: $serverUrl" -ForegroundColor Green

# --- 3. Open HTML File in Browser ---
Start-Sleep -Seconds 1 # Give the server a moment to bind to the port
Write-Host "Opening Companion Variable Dashboard in default browser..." -ForegroundColor Cyan

# Open the dashboard URL
Start-Process $serverUrl

# --- 4. Wait for User Input & Kill Server Process ---

Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Dashboard launched successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Companion Dashboard is now running in your browser." -ForegroundColor Yellow
Read-Host "Press Enter to close this window AND shut down the server."

# KILL PROCESS LOGIC: Find the process listening on the specified port and kill it.
Write-Host "Shutting down HTTP server on port $port..." -ForegroundColor Yellow

try {
    # Find the process ID (PID) listening on the port
    $pid = (Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess

    if ($pid -ne $null) {
        # Kill the process using the PID
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Write-Host "Server process (PID $pid) successfully terminated." -ForegroundColor Green
    } else {
        Write-Host "Warning: No process found listening on port $port to terminate." -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "Error during server shutdown: $($_.Exception.Message)" -ForegroundColor Red
}

exit 0
