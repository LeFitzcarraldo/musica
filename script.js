// --- Modern Music Player JavaScript ---
window.addEventListener('load', () => {
    console.log("App loaded. Setting up elements...");
    // --- Element References ---
    const fileInput = document.getElementById('fileInput');
    const fileListDisplay = document.getElementById('fileList');
    const audioPlayer = document.getElementById('audioPlayer');
    const videoPlayer = document.getElementById('videoPlayer'); // Keep for MP4 audio extraction
    const playPauseButton = document.getElementById('playPauseButton');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    const progressBar = document.getElementById('progressBar');
    const currentTimeDisplay = document.getElementById('currentTime');
    const durationDisplay = document.getElementById('duration');
    const volumeButton = document.getElementById('volumeButton'); // Button to toggle slider
    const volumeSliderContainer = document.querySelector('.volume-slider-container');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = volumeButton.querySelector('.volume-icon');
    const volumeMuteIcon = volumeButton.querySelector('.volume-mute-icon');
    const albumArtImg = document.getElementById('albumArt');
    const albumArtContainer = document.getElementById('albumArtContainer');
    const artPlaceholder = document.getElementById('artPlaceholder');
    const trackTitle = document.getElementById('trackTitle');
    const trackArtistAlbum = document.getElementById('trackArtistAlbum');
    const playIcon = playPauseButton.querySelector('.play-icon');
    const pauseIcon = playPauseButton.querySelector('.pause-icon');
    const fileInputLabel = document.getElementById('fileInputLabel'); // Reference for the label button

    // --- State Variables ---
    let trackList = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let currentAudioSource = audioPlayer;
    let currentObjectURL = null;
    let isVolumeSliderVisible = false; // State for volume popover
    let previousVolume = 1; // To store volume before mute

    // Check for jsmediatags (optional metadata library)
    const jsmediatags = window.jsmediatags;
    if (!jsmediatags) { console.warn("jsmediatags library not loaded. Metadata disabled."); }
    else { console.log("jsmediatags library loaded."); }

    // --- Initial UI State ---
    albumArtImg.style.display = 'none'; artPlaceholder.style.display = 'inline-block';
    updateVolumeIcon(); // Set initial volume icon state

    // --- Event Listeners ---
    console.log("Adding event listeners...");
    // File input label doesn't need listener if it's a <label for="fileInput">
    fileInput.addEventListener('change', handleFileSelection);
    playPauseButton.addEventListener('click', togglePlayPause);
    prevButton.addEventListener('click', playPreviousTrack);
    nextButton.addEventListener('click', playNextTrack);
    progressBar.addEventListener('input', handleSeek);
    progressBar.addEventListener('input', updateSliderFill); // Update fill on drag

    // Volume Control Listeners
    volumeButton.addEventListener('click', toggleVolumeSlider);
    volumeSlider.addEventListener('input', handleVolumeChange);
    volumeSlider.addEventListener('input', updateSliderFill); // Update fill on drag

    // Hide volume slider if clicked outside
    document.addEventListener('click', (event) => {
        if (!volumeButton.contains(event.target) && !volumeSliderContainer.contains(event.target)) {
            hideVolumeSlider();
        }
    });


    [audioPlayer, videoPlayer].forEach(player => {
        player.addEventListener('timeupdate', updateProgress);
        player.addEventListener('loadedmetadata', () => {
            console.log(`${player.id} metadata loaded`);
            updateDuration();
            updateSliderFill({ target: progressBar }); // Initial fill after load
        });
        player.addEventListener('ended', playNextTrack);
        player.addEventListener('error', (e) => handleError(e, player.id));
        player.addEventListener('playing', () => {
            console.log(`${player.id} 'playing' event fired.`);
            isPlaying = true; updatePlayPauseButton();
        });
        player.addEventListener('pause', () => {
            console.log(`${player.id} 'pause' event fired.`);
            isPlaying = false; updatePlayPauseButton();
        });
        player.addEventListener('volumechange', updateVolumeIcon); // Update icon on volume change
    });
    console.log("Event listeners added.");

    // --- Initial Slider Fill ---
    updateSliderFill({ target: volumeSlider }); // Set initial volume fill

    // --- Functions ---

    function handleFileSelection(event) {
        console.log("handleFileSelection triggered."); const files = event.target.files;
        console.log(`Files selected: ${files.length}`, files); if (files.length === 0) { console.log("No files selected."); return; }
        trackList = Array.from(files); renderFileList();
        if (trackList.length > 0) {
            console.log("Loading track 0, but NOT auto-playing.");
            loadTrack(0, false);
        }
    }

    function renderFileList() {
        console.log("Rendering file list..."); fileListDisplay.innerHTML = '';
        trackList.forEach((file, index) => {
            const li = document.createElement('li');
            li.textContent = file.name.replace(/\.[^/.]+$/, ""); // Remove extension for display
            li.title = file.name; // Show full name on hover
            li.dataset.index = index;
            li.addEventListener('click', () => { console.log(`Playlist item clicked: Index ${index}`); loadTrack(index, true); });
            fileListDisplay.appendChild(li);
        }); console.log("File list rendered.");
    }

    function loadTrack(index, autoPlayOnClick = false) {
        console.log(`loadTrack called with index: ${index}, autoPlay: ${autoPlayOnClick}`);
        if (index < 0 || index >= trackList.length) {
             console.warn(`Invalid track index: ${index}. Resetting to 0 or stopping.`);
             // Optional: Stop playback or loop to index 0
             if(trackList.length > 0) {
                index = 0; // Loop to first track
             } else {
                // Handle empty track list case (e.g., reset UI)
                 resetPlayerUI();
                return;
             }
        }


        // Revoke previous URL if it exists
        if (currentObjectURL) {
            console.log("Revoking previous Object URL:", currentObjectURL);
            URL.revokeObjectURL(currentObjectURL);
            currentObjectURL = null;
        }

        // Pause and reset the *currently active* source before switching
        if (currentAudioSource) {
            currentAudioSource.pause();
            currentAudioSource.removeAttribute('src'); // Essential to prevent conflicts
            currentAudioSource.load(); // Resets the media element
            console.log(`Paused and reset ${currentAudioSource.id}`);
        }

        currentTrackIndex = index;
        const file = trackList[currentTrackIndex];
        console.log(`Loading file: ${file.name}, Type: ${file.type || 'N/A'}`);

        // Update UI immediately (Basic Info)
        trackTitle.textContent = file.name.replace(/\.[^/.]+$/, ""); // Use cleaned name initially
        trackArtistAlbum.textContent = "Cargando..."; // Placeholder
        albumArtImg.style.display = 'none'; artPlaceholder.style.display = 'inline-block';
        isPlaying = false; updatePlayPauseButton(); updatePlayingListItem(); progressBar.value = 0;
        currentTimeDisplay.textContent = formatTime(0); durationDisplay.textContent = formatTime(0);
        updateSliderFill({ target: progressBar }); // Reset progress bar fill

        // Create new Object URL
        try {
            currentObjectURL = URL.createObjectURL(file);
            console.log("Created Object URL:", currentObjectURL);
        } catch (e) { console.error("Error creating Object URL:", e); handleError(e, 'createObjectURL'); return; }

        // Determine which player element to use (Audio or Video for MP4)
        const fileNameLower = file.name.toLowerCase();
        if (fileNameLower.endsWith('.mp4')) {
            console.log("Selecting videoPlayer for MP4."); currentAudioSource = videoPlayer;
        } else {
            console.log("Selecting audioPlayer."); currentAudioSource = audioPlayer;
        }

        // Set source and load
        console.log(`Setting src for ${currentAudioSource.id}: ${currentObjectURL}`);
        currentAudioSource.src = currentObjectURL;
        currentAudioSource.load(); // Explicitly call load
        console.log(`Src set for ${currentAudioSource.id}. Element will load.`);

        // Restore volume from previous track (or slider value)
        currentAudioSource.volume = volumeSlider.value;
        updateVolumeIcon(); // Update icon based on restored volume

        // Attempt to load metadata
        loadMetadata(file);

        // Handle auto-play if requested (e.g., from playlist click or 'next')
        if (autoPlayOnClick) {
            console.log("Attempting to auto-play track.");
            // Use 'canplay' event to ensure file is ready enough
            const playWhenReadyOnClick = () => {
                console.log(`'canplay' triggered for autoPlay. Attempting play.`);
                currentAudioSource.play().then(() => {
                    console.log("Autoplay successful");
                    isPlaying = true; // Ensure state is correct
                    updatePlayPauseButton();
                }).catch(e => {
                    console.error("Error during auto-play attempt:", e);
                    // Often browsers block autoplay without user interaction
                    // Update UI to show it's ready but paused
                    isPlaying = false;
                    updatePlayPauseButton();
                    handleError(e, `${currentAudioSource.id} (autoPlay promise)`);
                });
                // Listener added with { once: true }, no need to manually remove
            };
             const errorBeforeReadyOnClick = (e) => {
                 console.error(`Error on ${currentAudioSource.id} before autoPlay 'canplay':`, e);
                 handleError(e, `${currentAudioSource.id} (loading for autoPlay)`);
                   // Listener added with { once: true }, no need to manually remove
             };

            currentAudioSource.addEventListener('canplay', playWhenReadyOnClick, { once: true });
             currentAudioSource.addEventListener('error', errorBeforeReadyOnClick, { once: true });
        } else {
            console.log("Track loaded, waiting for user interaction (Play button).");
            // Ensure UI reflects paused state
            isPlaying = false;
            updatePlayPauseButton();
        }
    }

     function resetPlayerUI() {
         console.log("Resetting Player UI to initial state.");
         trackTitle.textContent = "Selecciona archivos...";
         trackArtistAlbum.textContent = "";
         albumArtImg.style.display = 'none';
         artPlaceholder.style.display = 'inline-block';
         progressBar.value = 0;
         progressBar.max = 100; // Reset max
         currentTimeDisplay.textContent = formatTime(0);
         durationDisplay.textContent = formatTime(0);
         updateSliderFill({ target: progressBar });
         isPlaying = false;
         updatePlayPauseButton();
         updatePlayingListItem(); // Clear playing highlight
         if (currentAudioSource) {
            currentAudioSource.pause();
            currentAudioSource.removeAttribute('src');
            currentAudioSource.load();
         }
          currentTrackIndex = -1;
     }

    function togglePlayPause() {
        console.log("togglePlayPause called. isPlaying:", isPlaying);
        // Check if a track is loaded and ready
        if (currentTrackIndex < 0 || !currentAudioSource || !currentAudioSource.src || currentAudioSource.readyState < 2) { // readyState < 2 means not enough data
            console.log("No track loaded or ready to play/pause.");
             // Optional: Try loading first track if available
             if (trackList.length > 0 && currentTrackIndex < 0) {
                 loadTrack(0, true); // Load and try to play first track
             }
            return;
        }

        if (isPlaying) {
            console.log("Pausing...");
            currentAudioSource.pause(); // State updated by 'pause' event
        } else {
            console.log("Attempting play via button...");
            currentAudioSource.play().then(() => {
                 console.log("Playback started successfully via button.");
                // State updated by 'playing' event
             }).catch(e => {
                console.error("Error playing via button:", e);
                handleError(e, `${currentAudioSource.id} (play button promise)`);
                // Ensure UI reflects failure
                isPlaying = false;
                updatePlayPauseButton();
            });
        }
    }

    function playNextTrack() {
        if (trackList.length === 0) return;
        let nextIndex = currentTrackIndex + 1;
        // Loop back to start if at the end
        if (nextIndex >= trackList.length) {
             console.log("Reached end of playlist, looping to start.");
            nextIndex = 0;
        }
        console.log("playNextTrack -> calling loadTrack with index:", nextIndex);
        loadTrack(nextIndex, true); // Load and auto-play next
    }

    function playPreviousTrack() {
        if (trackList.length === 0) return;
        const wasPlaying = isPlaying; // Store state before potential seek

        // If playing for more than 3 seconds, restart current track
        if (currentAudioSource && currentAudioSource.currentTime > 3) {
            console.log("playPreviousTrack -> restarting current track");
            currentAudioSource.currentTime = 0;
            updateSliderFill({ target: progressBar }); // Update fill after seek
            if (!wasPlaying) { // If paused, keep it paused after seek
                currentAudioSource.pause(); // Make sure it stays paused
                isPlaying = false;
                updatePlayPauseButton();
            } else {
                 // If it was playing, the 'playing' event should handle the state,
                 // or we might need to call play() again if seek pauses it.
                 // Let's ensure the button state is updated.
                 updatePlayPauseButton();
                 // A short delay might be needed if seeking briefly pauses playback
                 // setTimeout(() => updatePlayPauseButton(), 50);
            }
        } else { // Otherwise, go to the previous track
            let prevIndex = currentTrackIndex - 1;
            // Loop to end if at the beginning
            if (prevIndex < 0) {
                 console.log("Reached start of playlist, looping to end.");
                prevIndex = trackList.length - 1;
            }
            console.log("playPreviousTrack -> calling loadTrack with index:", prevIndex);
            loadTrack(prevIndex, true); // Load and auto-play previous
        }
    }

    function updatePlayPauseButton() {
        playIcon.classList.toggle('hidden', isPlaying);
        pauseIcon.classList.toggle('hidden', !isPlaying);
        playPauseButton.title = isPlaying ? "Pausa" : "Reproducir";
        // console.log("Play/Pause button updated. isPlaying:", isPlaying);
    }

    function updateProgress() {
        if (!currentAudioSource || !isFinite(currentAudioSource.duration)) return;
        const currentTime = currentAudioSource.currentTime;
        progressBar.value = currentTime;
        currentTimeDisplay.textContent = formatTime(currentTime);
        updateSliderFill({ target: progressBar }); // Update fill during progress
    }

    function updateDuration() {
        if (!currentAudioSource || !isFinite(currentAudioSource.duration)) {
            durationDisplay.textContent = formatTime(0);
            progressBar.max = 100; // Default max if no duration
            progressBar.value = 0;
            return;
        }
        const duration = currentAudioSource.duration;
        durationDisplay.textContent = formatTime(duration);
        progressBar.max = duration; // Set max to actual duration
    }

    function updatePlayingListItem() {
        fileListDisplay.querySelectorAll('li').forEach(li => {
            li.classList.remove('playing');
        });
        const currentLi = fileListDisplay.querySelector(`li[data-index="${currentTrackIndex}"]`);
        if (currentLi) {
            currentLi.classList.add('playing');
            // Only scroll if the playlist container is actually scrollable
            if (fileListDisplay.scrollHeight > fileListDisplay.clientHeight) {
                 currentLi.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }
    }

    function handleSeek() {
        if (!currentAudioSource || !isFinite(currentAudioSource.duration)) return;
        currentAudioSource.currentTime = progressBar.value;
        updateSliderFill({ target: progressBar });// Update fill on manual seek
    }

    // --- Volume Functions ---
    function toggleVolumeSlider() {
        isVolumeSliderVisible = !isVolumeSliderVisible;
        volumeSliderContainer.classList.toggle('hidden', !isVolumeSliderVisible);
        console.log("Volume slider visibility:", isVolumeSliderVisible);
    }

    function hideVolumeSlider() {
        if (isVolumeSliderVisible) {
            isVolumeSliderVisible = false;
            volumeSliderContainer.classList.add('hidden');
            console.log("Volume slider hidden");
        }
    }

    function handleVolumeChange() {
        if (!currentAudioSource) return;
        const newVolume = parseFloat(volumeSlider.value);
        currentAudioSource.volume = newVolume;
        currentAudioSource.muted = (newVolume === 0); // Mute if slider is at 0
        console.log("Volume changed to:", newVolume);
        // updateVolumeIcon(); // volumechange event handles this
        updateSliderFill({ target: volumeSlider });
    }

     function updateVolumeIcon() {
        if (!currentAudioSource) return;
         const currentVolume = currentAudioSource.volume;
         const muted = currentAudioSource.muted || currentVolume === 0;

         volumeIcon.classList.toggle('hidden', muted);
         volumeMuteIcon.classList.toggle('hidden', !muted);
         volumeButton.title = muted ? "Quitar silencio" : "Silenciar";
         // console.log(`Volume icon updated. Volume: ${currentVolume}, Muted: ${muted}`);
     }

    // --- Slider Fill Update ---
    function updateSliderFill(event) {
        const slider = event.target;
        if (!slider) return;
        const min = parseFloat(slider.min || 0);
        const max = parseFloat(slider.max || 100);
        const value = parseFloat(slider.value);
        let percentage = 0;
        if (max > min) { // Avoid division by zero
             percentage = ((value - min) / (max - min)) * 100;
        }

        // Use the accent color defined in CSS for the fill
        const fillColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
        const trackColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-elements').trim();

        slider.style.background = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${percentage}%, ${trackColor} ${percentage}%, ${trackColor} 100%)`;
    }

    // --- Metadata Handling ---
    function loadMetadata(file) {
        console.log(`Attempting metadata for: ${file.name}`);
        // Reset UI elements related to metadata
        albumArtImg.style.display = 'none';
        artPlaceholder.style.display = 'inline-block';
        albumArtImg.src = ''; // Clear previous art
        albumArtImg.alt = 'Album Art';
        // Keep filename as default title until metadata loads
        trackTitle.textContent = file.name.replace(/\.[^/.]+$/, "");
        trackArtistAlbum.textContent = " "; // Use space instead of "Cargando..."


        if (!jsmediatags) {
            console.warn("jsmediatags not loaded, cannot read metadata.");
            trackArtistAlbum.textContent = "(metadatos no disponibles)"; // Indicate missing library
            return;
        }

        jsmediatags.read(file, {
            onSuccess: function (tag) {
                console.log("Metadata loaded:", tag.tags);
                const t = tag.tags;
                // Update track title and artist/album info
                trackTitle.textContent = t.title || file.name.replace(/\.[^/.]+$/, ""); // Fallback to filename
                trackArtistAlbum.textContent = [t.artist, t.album].filter(Boolean).join(' - ') || " ";

                // Handle album art
                if (t.picture) {
                    const { data, format } = t.picture;
                    let base64String = "";
                    // Convert byte array to base64 string
                    try {
                         // Efficient conversion using Uint8Array and btoa might be better
                         // For simplicity, keeping the loop for now:
                         for (let i = 0; i < data.length; i++) {
                             base64String += String.fromCharCode(data[i]);
                         }
                        const dataUrl = `data:${format};base64,${window.btoa(base64String)}`;
                        albumArtImg.src = dataUrl;
                        albumArtImg.alt = t.album || 'Album Art';
                        albumArtImg.style.display = 'block';
                        artPlaceholder.style.display = 'none';
                    } catch(e) {
                        console.error("Error processing album art data:", e);
                         // Fallback if conversion fails
                         albumArtImg.style.display = 'none';
                         artPlaceholder.style.display = 'inline-block';
                    }
                } else {
                    // No picture tag found
                    albumArtImg.src = '';
                    albumArtImg.alt = 'Sin carátula';
                    albumArtImg.style.display = 'none';
                    artPlaceholder.style.display = 'inline-block';
                }
            },
            onError: function (error) {
                console.log(`Metadata error:`, error.type, error.info);
                // Keep filename as title, indicate metadata error
                trackTitle.textContent = file.name.replace(/\.[^/.]+$/, "");
                trackArtistAlbum.textContent = "(error al leer metadatos)";
                albumArtImg.src = '';
                albumArtImg.alt = 'Sin carátula';
                albumArtImg.style.display = 'none';
                artPlaceholder.style.display = 'inline-block';
            }
        });
    }

    // --- Utility Functions ---
    function formatTime(seconds) {
        const secs = Math.floor(seconds || 0);
        const minutes = Math.floor(secs / 60);
        const remainingSeconds = secs % 60;
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    function handleError(e, sourceId) {
        console.error(`---- Playback Error from ${sourceId} ----`);
        console.error("Error Event:", e);
        let errorDetails = "desconocido";
        if (currentAudioSource && currentAudioSource.error) {
            console.error("MediaError Code:", currentAudioSource.error.code); // 1:MEDIA_ERR_ABORTED, 2:MEDIA_ERR_NETWORK, 3:MEDIA_ERR_DECODE, 4:MEDIA_ERR_SRC_NOT_SUPPORTED
            console.error("MediaError Message:", currentAudioSource.error.message);
            errorDetails = `Código: ${currentAudioSource.error.code}`;
             // Provide more user-friendly messages based on code
             switch (currentAudioSource.error.code) {
                 case MediaError.MEDIA_ERR_ABORTED: errorDetails = "Carga abortada"; break;
                 case MediaError.MEDIA_ERR_NETWORK: errorDetails = "Error de red"; break;
                 case MediaError.MEDIA_ERR_DECODE: errorDetails = "Error de decodificación"; break;
                 case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorDetails = "Formato no soportado"; break;
                 default: errorDetails = `Error desconocido (${currentAudioSource.error.code})`;
             }
        } else if (sourceId === 'createObjectURL') {
             errorDetails = "No se pudo crear URL";
        } else if (sourceId.includes('promise')) {
             errorDetails = "Interacción requerida?"; // Common cause for play() promise rejection
        }


        // Update UI to show error state
        trackTitle.textContent = "Error";
        trackArtistAlbum.textContent = `(${errorDetails}) ${trackList[currentTrackIndex]?.name || ""}`;
        albumArtImg.src = ''; albumArtImg.alt = 'Error';
        albumArtImg.style.display = 'none'; artPlaceholder.style.display = 'inline-block'; // Show placeholder on error
        isPlaying = false; updatePlayPauseButton();

        // Optionally try to skip to the next track on error?
        // playNextTrack();

        // Show alert to user (consider less intrusive methods for better UX)
        // alert(`Error al procesar el archivo (${errorDetails}). Revisa la consola (F12).`);
    }

    console.log("Initial setup complete. Ready for file selection.");
}); // End of window.load listener
