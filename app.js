/* ==========================================================================
   Restora - Simple & Elegant Application Logic (app.js)
   ========================================================================== */

// 1. Application State
const state = {
  fileQueue: [], // Array of converted files
  activeIndex: -1 // Selected index in queue for preview
};

// 2. DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const clearQueueBtn = document.getElementById('clear-queue-btn');
const saveAllBtn = document.getElementById('save-all-btn');
const toastContainer = document.getElementById('toast-container');

// Preview Panel elements
const workspaceGrid = document.getElementById('workspace-grid');
const previewPanel = document.getElementById('preview-panel');
const videoPlayer = document.getElementById('video-player');
const activeVideoTitle = document.getElementById('active-video-title');
const videoInfoSize = document.getElementById('video-info-size');
const saveActiveBtn = document.getElementById('save-active-btn');

// 3. Initialization
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
});

// 4. Set up Event Listeners
function setupEventListeners() {
  // Drag and drop handlers
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files);
    }
  });

  // Action buttons
  clearQueueBtn.addEventListener('click', clearQueue);

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFileSelection(fileInput.files);
      fileInput.value = ''; // Reset input to allow re-upload if deleted from queue
    }
  });
  saveActiveBtn.addEventListener('click', downloadActiveFile);
  if (saveAllBtn) {
    saveAllBtn.addEventListener('click', downloadAllFiles);
  }

  const scanSdBtn = document.getElementById('scan-sd-btn');
  if (scanSdBtn) {
    scanSdBtn.addEventListener('click', scanSDCard);
  }

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  const playerErrorOverlay = document.getElementById('player-error-overlay');
  const playerErrorText = document.getElementById('player-error-text');

  videoPlayer.addEventListener('error', () => {
    const error = videoPlayer.error;
    let msg = "Playback failed. The video format might not be supported.";
    if (error) {
      if (error.code === 3) {
        msg = "Playback failed: Decoding error. The video may be using an unsupported codec (e.g. H.265/HEVC) which your browser cannot decode natively.";
      } else if (error.code === 4) {
        msg = "Playback failed: Format not supported. The browser cannot open this type of video container or codec.";
      }
    }
    if (playerErrorText) {
      playerErrorText.textContent = msg;
    }
    if (playerErrorOverlay) {
      playerErrorOverlay.classList.remove('hidden');
    }
  });

  videoPlayer.addEventListener('loadstart', () => {
    if (playerErrorOverlay) {
      playerErrorOverlay.classList.add('hidden');
    }
  });
}

// Theme Handling
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('theme-icon-dark').classList.add('hidden');
    document.getElementById('theme-icon-light').classList.remove('hidden');
  }
}

function toggleTheme() {
  const body = document.body;
  const isLight = body.classList.toggle('light-theme');
  
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  
  if (isLight) {
    darkIcon.classList.add('hidden');
    lightIcon.classList.remove('hidden');
    showToast('Switched to light theme.', 'info');
  } else {
    lightIcon.classList.add('hidden');
    darkIcon.classList.remove('hidden');
    showToast('Switched to dark theme.', 'info');
  }
}

// 5. Scan Connected SD Card (UNTITLED/DVR/VIDEO)
async function scanSDCard() {
  if (!('showDirectoryPicker' in window)) {
    showToast("Directory Picker is not supported in this browser. Please use Chrome, Edge, or Opera.", "error", 5000);
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker();
    showToast(`Scanning "${dirHandle.name}" for recordings...`, 'info');
    
    let targetHandle = null;

    // 1. Check if they selected the 'VIDEO' folder directly
    if (dirHandle.name.toUpperCase() === 'VIDEO') {
      targetHandle = dirHandle;
    } else if (dirHandle.name.toUpperCase() === 'DVR') {
      try {
        targetHandle = await dirHandle.getDirectoryHandle('VIDEO');
      } catch (e) {
        targetHandle = dirHandle; // fallback to scanning DVR directly
      }
    } else {
      try {
        const dvr = await dirHandle.getDirectoryHandle('DVR');
        targetHandle = await dvr.getDirectoryHandle('VIDEO');
      } catch (e) {
        try {
          const untitled = await dirHandle.getDirectoryHandle('UNTITLED');
          const dvr = await untitled.getDirectoryHandle('DVR');
          targetHandle = await dvr.getDirectoryHandle('VIDEO');
        } catch (e2) {
          targetHandle = dirHandle; // fallback
        }
      }
    }

    // Iterate files in the targeted folder
    const filesToProcess = [];
    for await (const entry of targetHandle.values()) {
      const nameLower = entry.name.toLowerCase();
      // Filter: accept only .build extension
      if (entry.kind === 'file' && nameLower.endsWith('.build')) {
        const file = await entry.getFile();
        filesToProcess.push(file);
      }
    }

    if (filesToProcess.length === 0) {
      showToast(`No compatible video files found in target directory: ${targetHandle.name}`, 'info', 4000);
      return;
    }

    handleFileSelection(filesToProcess);
    showToast(`Loaded ${filesToProcess.length} videos from SD Card.`, 'success');
  } catch (err) {
    if (err.name !== 'AbortError') { // User closed picker without selection
      showToast(err.message || "Failed to scan folder.", 'error');
      console.error(err);
    }
  }
}

// 6. Auto-Repair Logic (Scans magic bytes to automatically strip firmware headers)
function autoRepairBytes(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const limit = bytes.length; // Scan the entire file for signatures
  
  // 1. MP4 'ftyp' signature (66 74 79 70)
  for (let i = 0; i <= limit - 4; i++) {
    if (bytes[i] === 0x66 && bytes[i+1] === 0x74 && bytes[i+2] === 0x79 && bytes[i+3] === 0x70) {
      const start = Math.max(0, i - 4); // MP4 box starts 4 bytes before type label
      if (start > 0) {
        console.log(`Auto-detected and stripped firmware header of ${start} bytes.`);
      }
      return {
        repairedBytes: bytes.slice(start),
        strippedBytes: start,
        format: 'mp4'
      };
    }
  }

  // 2. WebM / MKV EBML signature (1A 45 DF A3)
  for (let i = 0; i <= limit - 4; i++) {
    if (bytes[i] === 0x1A && bytes[i+1] === 0x45 && bytes[i+2] === 0xDF && bytes[i+3] === 0xA3) {
      if (i > 0) {
        console.log(`Auto-detected and stripped firmware header of ${i} bytes.`);
      }
      return {
        repairedBytes: bytes.slice(i),
        strippedBytes: i,
        format: 'webm'
      };
    }
  }

  // 3. AVI 'RIFF' signature (52 49 46 46) and 'AVI ' (41 56 49 20)
  for (let i = 0; i <= limit - 12; i++) {
    if (bytes[i] === 0x52 && bytes[i+1] === 0x49 && bytes[i+2] === 0x46 && bytes[i+3] === 0x46) {
      if (bytes[i+8] === 0x41 && bytes[i+9] === 0x56 && bytes[i+10] === 0x49 && bytes[i+11] === 0x20) {
        if (i > 0) {
          console.log(`Auto-detected and stripped firmware header of ${i} bytes.`);
        }
        return {
          repairedBytes: bytes.slice(i),
          strippedBytes: i,
          format: 'avi'
        };
      }
    }
  }

  // 4. MP4 'mdat' or 'moov' fallback signature
  for (let i = 0; i <= limit - 4; i++) {
    if (bytes[i] === 0x6d && bytes[i+1] === 0x64 && bytes[i+2] === 0x61 && bytes[i+3] === 0x74) { // mdat
      const start = Math.max(0, i - 4);
      if (start > 0) {
        console.log(`Auto-detected MP4 'mdat' at offset ${start} and stripped header.`);
      }
      return {
        repairedBytes: bytes.slice(start),
        strippedBytes: start,
        format: 'mp4'
      };
    }
    if (bytes[i] === 0x6d && bytes[i+1] === 0x6f && bytes[i+2] === 0x6f && bytes[i+3] === 0x76) { // moov
      const start = Math.max(0, i - 4);
      if (start > 0) {
        console.log(`Auto-detected MP4 'moov' at offset ${start} and stripped header.`);
      }
      return {
        repairedBytes: bytes.slice(start),
        strippedBytes: start,
        format: 'mp4'
      };
    }
  }

  // 5. Raw H.264 / H.265 Annex-B start code fallback (00 00 00 01 or 00 00 01)
  for (let i = 0; i <= limit - 5; i++) {
    if (bytes[i] === 0x00 && bytes[i+1] === 0x00 && (bytes[i+2] === 0x01 || (bytes[i+2] === 0x00 && bytes[i+3] === 0x01))) {
      const startCodeOffset = bytes[i+2] === 0x01 ? 3 : 4;
      const nalTypeByte = bytes[i + startCodeOffset];
      if (
        nalTypeByte === 0x67 || nalTypeByte === 0x27 || nalTypeByte === 0x47 || nalTypeByte === 0x07 || // H.264 SPS
        nalTypeByte === 0x68 || nalTypeByte === 0x28 || nalTypeByte === 0x48 || // H.264 PPS
        nalTypeByte === 0x40 || nalTypeByte === 0x42 || nalTypeByte === 0x44 || // H.265 VPS/SPS/PPS
        nalTypeByte === 0x09 || // AUD
        (nalTypeByte & 0x1F) === 5 // Keyframe Slice
      ) {
        if (i > 0) {
          console.log(`Auto-detected raw H.264/H.265 start code and stripped ${i} bytes.`);
        }
        return {
          repairedBytes: bytes.slice(i),
          strippedBytes: i,
          format: 'mp4' // Return as mp4 so browser attempts playback as MP4 blob
        };
      }
    }
  }

  // Fallback: return original bytes unchanged
  return {
    repairedBytes: bytes,
    strippedBytes: 0,
    format: 'unknown'
  };
}

// 7. Handle File Selection and Conversion
function handleFileSelection(files) {
  let count = 0;
  let skippedCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const nameLower = file.name.toLowerCase();
    
    // Strict Filter: Accept only .build, .BUILD
    if (!nameLower.endsWith('.build')) {
      continue;
    }
    
    // Avoid duplicate entries
    const isDuplicate = state.fileQueue.some(item => item.originalName === file.name);
    if (isDuplicate) {
      skippedCount++;
      continue;
    }
    
    // Create converted name
    let cleanName = file.name.replace(/\.BUILD$/i, '')
                             .replace(/\.build$/i, '');
    if (!cleanName.endsWith('.mp4')) {
      cleanName += '.mp4';
    }

    const queueItem = {
      id: generateId(),
      originalName: file.name,
      convertedName: cleanName,
      size: file.size,
      status: 'processing',
      repairedBytes: null,
      objectUrl: null
    };
    
    state.fileQueue.push(queueItem);
    const itemIndex = state.fileQueue.length - 1;
    renderQueue();

    // Read the file asynchronously to extract & repair bytes
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const result = autoRepairBytes(e.target.result);
        queueItem.repairedBytes = result.repairedBytes;
        queueItem.size = result.repairedBytes.length; // Update displayed size to reflect trimmed bytes
        queueItem.strippedBytes = result.strippedBytes;
        queueItem.format = result.format;
        queueItem.status = 'ready';
      } catch (err) {
        queueItem.status = 'error';
        console.error(err);
      }
      renderQueue();
      updateButtonStates();
      
      // Auto select the first successfully loaded item to show video player
      if (state.activeIndex === -1 && queueItem.status === 'ready') {
        selectQueueItem(itemIndex);
      }
    };
    
    reader.onerror = function() {
      queueItem.status = 'error';
      renderQueue();
      updateButtonStates();
    };
    
    reader.readAsArrayBuffer(file);
    count++;
  }
  
  renderQueue();
  updateButtonStates();
  
  if (count > 0) {
    if (skippedCount > 0) {
      showToast(`Loaded ${count} recordings (${skippedCount} duplicates skipped).`, 'info');
    } else {
      showToast(`Loaded ${count} video recordings.`, 'info');
    }
  } else if (skippedCount > 0) {
    showToast(`Skipped ${skippedCount} duplicate files.`, 'info');
  } else {
    showToast("No compatible recordings selected (.build).", "info");
  }
}

// 8. Video Preview Player Controller
function selectQueueItem(index) {
  if (index < 0 || index >= state.fileQueue.length) return;
  
  const item = state.fileQueue[index];
  if (item.status !== 'ready' || !item.repairedBytes) return;

  state.activeIndex = index;
  
  // Highlight active row in UI list
  const cardElements = queueList.getElementsByClassName('queue-item');
  for (let i = 0; i < cardElements.length; i++) {
    if (i === index) {
      cardElements[i].classList.add('active');
    } else {
      cardElements[i].classList.remove('active');
    }
  }

  // Create local Object URL for video player preview
  if (!item.objectUrl) {
    const mp4Blob = new Blob([item.repairedBytes], { type: 'video/mp4' });
    item.objectUrl = URL.createObjectURL(mp4Blob);
  }

  // Show player panel & expand grid layout to 2 columns
  workspaceGrid.classList.remove('single-panel');
  workspaceGrid.classList.add('double-panel');
  previewPanel.classList.remove('hidden');

  // Update Player Details
  activeVideoTitle.textContent = getCleanDisplayName(item.originalName);
  videoInfoSize.textContent = formatBytes(item.repairedBytes.length);

  // If format is unknown, show warning message on player overlay
  const playerErrorOverlay = document.getElementById('player-error-overlay');
  const playerErrorText = document.getElementById('player-error-text');
  if (item.format === 'unknown') {
    if (playerErrorText) {
      playerErrorText.textContent = "Unrecognized format: Could not find any standard video container signatures (MP4, WebM, AVI). The file might be encrypted or not a video.";
    }
    if (playerErrorOverlay) {
      playerErrorOverlay.classList.remove('hidden');
    }
  } else {
    if (playerErrorOverlay) {
      playerErrorOverlay.classList.add('hidden');
    }
  }
  
  // Load Video in Player
  videoPlayer.src = item.objectUrl;
  videoPlayer.load();
  videoPlayer.play().catch(e => console.log("Auto-play blocked, waiting for user interaction."));
}

// 9. Download Functions
function downloadFile(item) {
  if (!item.repairedBytes) return;

  const mp4Blob = new Blob([item.repairedBytes], { type: 'video/mp4' });
  const url = URL.createObjectURL(mp4Blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = item.convertedName;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  
  showToast(`Saving video: ${getCleanDisplayName(item.convertedName)}`, 'success');
}

function downloadActiveFile() {
  if (state.activeIndex === -1) return;
  downloadFile(state.fileQueue[state.activeIndex]);
}

function downloadAllFiles() {
  const readyItems = state.fileQueue.filter(item => item.status === 'ready');
  if (readyItems.length === 0) return;
  
  readyItems.forEach((item, index) => {
    // Stagger downloads slightly to prevent browser blocking multiple downloads
    setTimeout(() => {
      downloadFile(item);
    }, index * 250);
  });
}

// 10. Queue Management
function deleteQueueItem(index, event) {
  if (event) event.stopPropagation();
  
  const item = state.fileQueue[index];
  if (item.objectUrl) {
    URL.revokeObjectURL(item.objectUrl);
  }
  
  state.fileQueue.splice(index, 1);
  
  // Handle selected index checks
  if (state.activeIndex === index) {
    closePreviewPanel();
  } else if (state.activeIndex > index) {
    state.activeIndex--;
  }

  renderQueue();
  updateButtonStates();
  showToast('File removed.', 'info');
}

function clearQueue() {
  state.fileQueue.forEach(item => {
    if (item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
    }
  });
  
  state.fileQueue = [];
  closePreviewPanel();
  renderQueue();
  updateButtonStates();
  showToast('Queue cleared.', 'info');
}

function closePreviewPanel() {
  state.activeIndex = -1;
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  
  previewPanel.classList.add('hidden');
  workspaceGrid.classList.remove('double-panel');
  workspaceGrid.classList.add('single-panel');
}

function updateButtonStates() {
  const hasItems = state.fileQueue.length > 0;
  clearQueueBtn.disabled = !hasItems;
  
  const hasReadyItems = state.fileQueue.some(item => item.status === 'ready');
  if (saveAllBtn) {
    saveAllBtn.disabled = !hasReadyItems;
  }
}

// Helper to strip extensions for UI display
function getCleanDisplayName(filename) {
  return filename.replace(/\.BUILD$/i, '')
                 .replace(/\.build$/i, '')
                 .replace(/\.mp4$/i, '');
}

// 11. Render Queue List
function renderQueue() {
  queueCount.textContent = state.fileQueue.length;
  
  if (state.fileQueue.length === 0) {
    queueList.classList.add('empty');
    queueList.innerHTML = `
      <div class="queue-empty-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p>No recordings loaded. Select or scan files to restore them instantly.</p>
      </div>
    `;
    return;
  }
  
  queueList.classList.remove('empty');
  queueList.innerHTML = '';
  
  state.fileQueue.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = `queue-item ${index === state.activeIndex ? 'active' : ''}`;
    card.addEventListener('click', () => selectQueueItem(index));
    
    let badgeText = 'READY';
    let badgeClass = 'badge-ready';
    
    if (item.status === 'processing') {
      badgeText = 'Restoring...';
      badgeClass = 'badge-processing';
    } else if (item.status === 'error') {
      badgeText = 'FAILED';
      badgeClass = 'badge-failed';
    } else if (item.format === 'unknown') {
      badgeText = 'NO SIGNATURE';
      badgeClass = 'badge-warning';
    }
    
    const displayName = getCleanDisplayName(item.originalName);
    
    card.innerHTML = `
      <div class="item-meta">
        <div class="item-name" title="${displayName}">${displayName}</div>
        <div class="item-details">
          <span>${formatBytes(item.size)}</span>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="circle-btn delete-btn" title="Remove" id="del-btn-${item.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    `;
    
    // Wire up delete event (prevent list row selection)
    card.querySelector('.delete-btn').addEventListener('click', (e) => deleteQueueItem(index, e));
    
    queueList.appendChild(card);
  });
}

// 12. Utility Functions
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }
  
  toast.innerHTML = `
    ${iconSvg}
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toast-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
    setTimeout(() => {
      if (toast.parentNode === toastContainer) {
        toastContainer.removeChild(toast);
      }
    }, 300);
  }, duration);
}
