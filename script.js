const SUPABASE_URL = 'https://vpfoyxvkkttzlitfajgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZm95eHZra3R0emxpdGZhamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NDAxMTQsImV4cCI6MjA3NjUxNjExNH0._vyK8s2gXPSu18UqEEWujLU2tAqNZEh3mNwVQcbskxA';
const ADMIN_UID = 'ec7bdc5d-fff1-4708-b161-15315c402920';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// ============================================
// Global variables
// ============================================
let allUKBirds = [];
let mySightings = [];
let savedLocations = [];

// Pagination variables
let currentPage = 1;
const ITEMS_PER_PAGE = 100;

// Summary filter
let currentSummaryRarityFilter = 'All';

// Rarity chart
let rarityChart = null;
let birdChart = null;

// Search filter
let currentSearchQuery = '';

// Audio display
let audioContext, analyser, dataArray, animationId;

// Map display
let map; // Global variable to store the map instance

// Location picking map
let pickerMap;
let pickerMarker;

// Cashed location save
let cachedLocations = [];

// Containers
const entriesContainer = document.getElementById('entries-container');
const addEntryBtn = document.getElementById('add-entry-btn');
const sightingForm = document.getElementById('sighting-form');

// Year filter
let currentYearFilter = 'Lifetime';

// Filter results from date select 
function getFilteredSightings() {
	if (currentYearFilter === 'Lifetime') return mySightings;

	return mySightings.filter(s => {
		const sightingYear = new Date(s.date).getFullYear().toString();
		return sightingYear === currentYearFilter;
	});
}

// Actually change year on change
window.handleYearChange = function(year) {
	currentYearFilter = year;
	updateAllDisplays();
};

// Make deleteSighting global
window.deleteSighting = async function(idToDelete) {
	if (confirm("Are you sure you want to delete this sighting?")) {
		await deleteSightingFromDB(idToDelete);

		// Adjust current page if needed
		const totalPages = Math.ceil(mySightings.length / ITEMS_PER_PAGE);
		if (currentPage > totalPages && currentPage > 1) {
			currentPage = totalPages;
		}
	}
};

// ============================================
// Initial loading
// ============================================

// Load sightings from supabase
async function loadSightings() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            mySightings = [];
            updateAllDisplays();
            return;
        }

        // THE FIX: Added .eq('user_id', user.id) 
        // This ensures YOUR checklist only shows YOUR birds
        const { data, error } = await supabaseClient
            .from('sightings')
            .select('*')
            .eq('user_id', user.id); 

        if (error) throw error;
        if (data) {
            mySightings = data;
            mySightings.sort((a, b) => new Date(b.date) - new Date(a.date));
            updateAllDisplays();
        }
    } catch (error) {
        console.error("Error loading personal sightings:", error);
    }
}

//Load all birds on UK birds database
async function loadUKBirds() {
	try {
		const response = await fetch('uk_birds.json');
		if (response.ok) {
			allUKBirds = await response.json();
		}

		// Data loading
		populateSpeciesDatalist();
		await loadSightings(); 
		await loadLocations();

		// UI initialisation
		addSightingEntry();
		setupTabSwitching();
		setupPagination();
		setupSummaryFilter();
		setupSearchBar();
		setupRarityFilter();
		setupModal();
		setupExpeditionSearch();
		setupAudioPlayer();

		// 3. Render database birds
		filterAndDisplayBirds();

		// 4. Load latest trip report
		if (mySightings.length > 0) {
			const latest = mySightings[0];
			const data = getExpeditionData(latest.date, latest.location);
			if (data) displayExpeditionCard(data);
		}

		console.log("Journal System fully online.");
	} catch (error) {
		console.error("Initialization Failed:", error);
	}
}

// Save sightings to database
async function saveSighting(sighting) {
    try {
        // Get the logged-in user's data
        const {
            data: {
                user
            }
        } = await supabaseClient.auth.getUser();

        if (!user) {
            alert("You must be logged in to save sightings.");
            return false;
        }

        const {
            data,
            error
        } = await supabaseClient
            .from('sightings')
            .insert([{
                species: sighting.species,
                date: sighting.date,
                location: sighting.location,
                user_id: user.id,
                // --- ADD THESE TWO LINES ---
                lat: sighting.lat, 
                lng: sighting.lng
                // ---------------------------
            }]);

        if (error) {
            console.error("Supabase Insert Error:", error.message);
            throw error;
        }

        console.log("Sighting saved successfully!");
        return true;
    } catch (error) {
        alert("Failed to save: " + error.message);
        return false;
    }
}

// Delete sighting from raw datalist 
async function deleteSightingFromDB(idToDelete) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return false;

        // Find the location name BEFORE deleting
        const sightingData = mySightings.find(s => s.id === idToDelete);
        const locationToCleanup = sightingData ? sightingData.location : null;

        const { error } = await supabaseClient
            .from('sightings')
            .delete()
            .eq('id', idToDelete)
            .eq('user_id', user.id); 

        if (error) throw error;

        // Update local array
        mySightings = mySightings.filter(s => s.id !== idToDelete);
        
        // IMPORTANT: Perform the cleanup and WAIT for it to finish
        if (locationToCleanup) {
            await cleanupEmptyLocations(locationToCleanup);
        }

        updateAllDisplays();
        return true;
    } catch (error) {
        console.error("Error deleting sighting:", error);
        return false;
    }
}
async function cleanupEmptyLocations(locationName) {
    // 1. Check if any other birds are still at this location
    const { data, error } = await supabaseClient
        .from('sightings')
        .select('id')
        .eq('location', locationName);

    // 2. If NO birds are left, delete the Hub (the red pin)
    if (data && data.length === 0) {
        await supabaseClient
            .from('saved_locations')
            .delete()
            .eq('location', locationName);
            
        console.log(`Location ${locationName} was empty and has been removed from the map.`);
        
        // Refresh the map to show it's gone
        initBirdMap(); 
    }
}

// Updates seen birds, raw list, and stats page
function updateAllDisplays() {
    displaySightings();
    displaySeenBirdsSummary();
    calculateAndDisplayStats();
    filterAndDisplayBirds();
    createMonthlyChart();
    
    // Add this so the big map stays in sync with your data
    if (typeof initBirdMap === 'function') {
        initBirdMap(); 
    }

	// Refresh the Expedition Logbook Card with the latest data
	if (mySightings && mySightings.length > 0) {
		const latest = mySightings[0];
		const tripData = getExpeditionData(latest.date, latest.location);
		if (tripData) {
			displayExpeditionCard(tripData);
		}
	}
}

// ============================================
// Tab switch logic
// ============================================

function switchTab(targetTabId) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabContents.forEach(content => {
        content.classList.remove('active-content');
        content.style.display = 'none'; 
    });
    tabButtons.forEach(button => button.classList.remove('active'));

    const targetContent = document.getElementById(targetTabId);
    if (targetContent) {
        targetContent.classList.add('active-content');
        targetContent.style.display = 'block'; 

        // 1. BIG MAP LOGIC
        if (targetTabId === 'map-tab') {
    if (!map) {
        initBirdMap(); 
    } else {
        // Don't rebuild the whole map, just fix the layout
        requestAnimationFrame(() => {
            map.invalidateSize();
        });
    }
}
        // 2. NEW: SUBMISSION PICKER LOGIC (Step 3)
        else if (targetTabId === 'submission-view') {
            setTimeout(() => {
                initLocationPicker(); // Starts the mini-map
                if (pickerMap) {
                    pickerMap.invalidateSize(); // Forces it to fill the container
                }
            }, 300);
        }
        // 3. STATS LOGIC
        else if (targetTabId === 'stats-view') {
            calculateAndDisplayStats();
            fetchRegistryData();
            if (birdChart) birdChart.destroy();
            if (rarityChart) rarityChart.destroy();

            setTimeout(() => {
                createMonthlyChart();
                createRarityChart();
            }, 100);
        }
    }
}

// Pagnation on the raw checklist page
function setupPagination() {
	const prevBtn = document.getElementById('prev-page-btn');
	const nextBtn = document.getElementById('next-page-btn');
	const prevBtnBottom = document.getElementById('prev-page-btn-bottom');
	const nextBtnBottom = document.getElementById('next-page-btn-bottom');

	if (prevBtn) prevBtn.addEventListener('click', () => changePage(-1));
	if (nextBtn) nextBtn.addEventListener('click', () => changePage(1));
	if (prevBtnBottom) prevBtnBottom.addEventListener('click', () => changePage(-1));
	if (nextBtnBottom) nextBtnBottom.addEventListener('click', () => changePage(1));
}

function changePage(direction) {
	const totalPages = Math.ceil(mySightings.length / ITEMS_PER_PAGE);
	const newPage = currentPage + direction;

	if (newPage < 1 || newPage > totalPages) return;

	currentPage = newPage;
	displaySightings();

	const checklistView = document.getElementById('checklist-view');
	if (checklistView) {
		checklistView.scrollIntoView({
			behavior: 'smooth',
			block: 'start'
		});
	}
}

// Display on raw checklist page
function displaySightings() {
	const list = document.getElementById('sightings-list');
	if (!list) return;

	list.innerHTML = '';

	if (mySightings.length === 0) {
		list.innerHTML = 'No sightings recorded yet.';
		updatePaginationControls(0, 0, 0);
		return;
	}

	const totalPages = Math.ceil(mySightings.length / ITEMS_PER_PAGE);
	if (currentPage > totalPages) currentPage = totalPages;
	if (currentPage < 1) currentPage = 1;

	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
	const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, mySightings.length);
	const pageSightings = mySightings.slice(startIndex, endIndex);

	pageSightings.forEach(sighting => {
		const li = document.createElement('li');
		const dateObj = new Date(sighting.date + 'T00:00:00');
		const formattedDate = dateObj.toLocaleDateString();

		li.innerHTML = `
            <div>
                <strong>${sighting.species}</strong> at ${sighting.location} on ${formattedDate}
            </div>
            <button onclick="deleteSighting(${sighting.id})">Delete</button>
        `;
		list.appendChild(li);
	});

	updatePaginationControls(totalPages, startIndex, endIndex);
}

// More pagnation controls
function updatePaginationControls(totalPages, startIndex, endIndex) {
	const pageInfo = totalPages > 0 ?
		`Page ${currentPage} of ${totalPages} (Showing ${startIndex + 1}-${endIndex} of ${mySightings.length})` :
		'No sightings';

	const pageInfoEl = document.getElementById('page-info');
	const pageInfoBottomEl = document.getElementById('page-info-bottom');

	if (pageInfoEl) pageInfoEl.textContent = pageInfo;
	if (pageInfoBottomEl) pageInfoBottomEl.textContent = pageInfo;

	const prevBtn = document.getElementById('prev-page-btn');
	const nextBtn = document.getElementById('next-page-btn');
	const prevBtnBottom = document.getElementById('prev-page-btn-bottom');
	const nextBtnBottom = document.getElementById('next-page-btn-bottom');

	const isFirstPage = currentPage === 1;
	const isLastPage = currentPage >= totalPages || totalPages === 0;

	if (prevBtn) prevBtn.disabled = isFirstPage;
	if (nextBtn) nextBtn.disabled = isLastPage;
	if (prevBtnBottom) prevBtnBottom.disabled = isFirstPage;
	if (nextBtnBottom) nextBtnBottom.disabled = isLastPage;
}

// ============================================
// Summary and modals
// ============================================

// 
function displaySeenBirdsSummary() {
	const summaryContainer = document.getElementById('seen-birds-summary');
	if (!summaryContainer) return;

	summaryContainer.innerHTML = '';
	const speciesMap = new Map();

	// 1. Group sightings by species
	const validSightings = mySightings.filter(sighting => isSpeciesValid(sighting.species));

	validSightings.forEach(sighting => {
		const species = sighting.species.trim();
		if (speciesMap.has(species)) {
			speciesMap.get(species).sightings.push(sighting);
		} else {
			speciesMap.set(species, {
				sightings: [sighting]
			});
		}
	});

	if (speciesMap.size === 0) {
		summaryContainer.innerHTML = '<p style="padding: 20px; text-align: center;">No unique birds seen yet.</p>';
		return;
	}

	// 2. Filter species by rarity
	let filteredSpecies = Array.from(speciesMap.keys());
	if (currentSummaryRarityFilter && currentSummaryRarityFilter !== 'All') {
		filteredSpecies = filteredSpecies.filter(speciesName => {
			const birdData = allUKBirds.find(b => b.CommonName.trim().toLowerCase() === speciesName.trim().toLowerCase());
			return birdData && birdData.Rarity.trim().toLowerCase() === currentSummaryRarityFilter.trim().toLowerCase();
		});
	}

	const cardTemplate = document.getElementById('bird-card-template');

	// 3. Render the Summary Cards
	filteredSpecies.forEach(species => {
		const birdData = allUKBirds.find(b => b.CommonName.trim() === species);
		if (!birdData) return;

		const sightingsData = speciesMap.get(species);
		const sightingCount = sightingsData.sightings.length;

		const cardClone = cardTemplate.content.cloneNode(true);
		const card = cardClone.querySelector('.bird-card');
		const imageContainer = card.querySelector('.card-image-container');
		const imageEl = card.querySelector('.card-image');

		card.classList.add('seen', 'summary-card');

		// Store the sightings data directly on the card element "backpack"
		card.dataset.sightings = JSON.stringify(sightingsData.sightings);

		// Set Text Data
		card.querySelector('.card-common-name').textContent = birdData.CommonName;
		card.querySelector('.card-latin-name').textContent = birdData.LatinName !== 'No Data' ? birdData.LatinName : '';
		card.querySelector('.card-status-text').textContent = `Seen ${sightingCount} time${sightingCount === 1 ? '' : 's'}`;

		// Set Badges
		const countBadge = card.querySelector('.sighting-count-badge');
		if (countBadge) {
			countBadge.textContent = sightingCount;
			countBadge.style.display = 'flex';
		}
		const seenBadge = card.querySelector('.seen-badge');
		if (seenBadge) seenBadge.style.display = 'flex';

		// Image Logic
		getBirdImage(birdData.CommonName, birdData.LatinName).then(result => {
			if (result && result.url) {
				imageEl.src = result.url;
				if (result.isVerified) {
					card.classList.add('verified-card');
					const vBadge = document.createElement('div');
					vBadge.className = 'verified-check-badge';
					vBadge.innerHTML = '✓ Verified';
					imageContainer.appendChild(vBadge);
				}
				handleImageVerification(card, birdData);
			}
		});

		// --- THE CONSOLIDATED CLICK LISTENER ---
		card.addEventListener('click', (e) => {
			if (!e.target.closest('.image-verify-overlay')) {
				// We don't need to pass the sightings array anymore, the modal finds it itself!
				showSightingModal(birdData.CommonName, birdData);
			}
		});

		summaryContainer.appendChild(card);
	});
}

async function showSightingModal(species, birdData) {
    const modal = document.getElementById('sighting-modal');
    if (!modal) return;

    document.getElementById('modal-species-name').textContent = species;
    document.getElementById('modal-species-info').textContent = `${birdData?.LatinName || ''} • ${birdData?.Rarity || ''}`;

    const modalList = document.getElementById('modal-sightings-list');
    modalList.innerHTML = '';

    const personalSightings = mySightings.filter(s => s.species.trim().toLowerCase() === species.trim().toLowerCase());

    // Fix for the SVG text element
    // Inside showSightingModal
const recordingLoc = document.getElementById('recording-location');
if (recordingLoc) {
    recordingLoc.textContent = "Scanning frequencies...";
}

    // Update the record label to show the bird name
    const svgLabel = document.getElementById('svg-label-text');
    if (svgLabel) svgLabel.textContent = species.toUpperCase();

    if (personalSightings.length > 0) {
        personalSightings.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sighting => {
            const li = document.createElement('li');
            li.style.padding = "10px";
            li.style.borderBottom = "1px solid rgba(0,0,0,0.1)";
            li.innerHTML = `<strong>${new Date(sighting.date).toLocaleDateString('en-GB')}</strong> — ${sighting.location}`;
            modalList.appendChild(li);
        });
    } else {
        modalList.innerHTML = '<li style="font-style:italic; padding:10px;">No personal sightings recorded in your journal yet.</li>';
    }

    const descriptionBox = document.getElementById('modal-description-text');
    descriptionBox.textContent = "Consulting the archives...";
    fetchBirdDescription(species).then(desc => {
        descriptionBox.textContent = desc;
    });

    fetchBirdSong(birdData?.LatinName, species);
    modal.style.display = 'block';
}

// 1. The main function
async function fetchBirdSong(latinName, commonName) {
    const audioPlayer = document.getElementById('bird-audio-player');
    const recordingLoc = document.getElementById('recording-location');
    if (!audioPlayer || !recordingLoc) return;

    audioPlayer.pause();
    recordingLoc.textContent = "Scanning frequencies...";

    // We use the Latin Name to ensure accuracy
    const query = latinName || commonName;

    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=images&imlimit=5`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.query && data.query.pages) {
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            const images = pages[pageId].images || [];

            const audioFile = images.find(img => 
                ['.ogg', '.oga', '.mp3'].some(ext => img.title.toLowerCase().endsWith(ext))
            );

            if (audioFile) {
                const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(audioFile.title)}`;
                const infoRes = await fetch(infoUrl);
                const infoData = await infoRes.json();
                const fileUrl = infoData.query.pages[Object.keys(infoData.query.pages)[0]].imageinfo[0].url;

                audioPlayer.src = fileUrl;
                recordingLoc.textContent = "Captured: Archive Recording";
            } else {
                recordingLoc.textContent = "No recordings found.";
            }
        }
    } catch (e) {
        console.log("Audio skipped:", e);
        recordingLoc.textContent = "Signal lost.";
    }
}
async function attemptSecondarySearch(name) {
	const audioPlayer = document.getElementById('bird-audio-player');
	const recordingLoc = document.getElementById('recording-location');
	const loadingOverlay = document.getElementById('audio-loading-overlay');

	try {
		const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=filetype:audio|${encodeURIComponent(name)}&gsrlimit=1&prop=imageinfo&iiprop=url`;
		const res = await fetch(url);
		const data = await res.json();

		if (data.query && data.query.pages) {
			const pages = data.query.pages;
			const fileUrl = pages[Object.keys(pages)[0]].imageinfo[0].url;
			audioPlayer.src = fileUrl;
			audioPlayer.load();
			recordingLoc.textContent = "Captured: Common Archive";
		} else {
			recordingLoc.textContent = "No recordings in archive.";
		}
	} catch (e) {
		recordingLoc.textContent = "Archive silent.";
	}
	loadingOverlay.style.display = 'none';
}
// Ensure this function exists to clear the "ReferenceError"
function setupAudioPlayer() {
    const tonearm = document.getElementById('tonearm');
    const disc = document.getElementById('vinyl-disc-group');
    const audioPlayer = document.getElementById('bird-audio-player');
    const labelText = document.getElementById('svg-label-text');

    if (!tonearm || !audioPlayer) return;

    tonearm.onclick = () => {
        if (audioPlayer.paused) {
            // Play logic
            audioPlayer.play().then(() => {
                tonearm.classList.add('arm-on-record');
                disc.classList.add('spinning-disc');
                if (typeof startSpectrogram === 'function') startSpectrogram();
            }).catch(err => console.error("Playback failed", err));
        } else {
            // Pause logic
            audioPlayer.pause();
            tonearm.classList.remove('arm-on-record');
            disc.classList.remove('spinning-disc');
        }
    };

    audioPlayer.onended = () => {
        tonearm.classList.remove('arm-on-record');
        disc.classList.remove('spinning-disc');
    };
}

// 2. KICK OFF THE APP (Only call this once!)
loadUKBirds();

// 3. START SPECTROGRAM
function startSpectrogram() {
	const audioPlayer = document.getElementById('bird-audio-player');
	const canvas = document.getElementById('spectrogram-canvas');
	if (!canvas || !audioPlayer.src) return;

	const ctx = canvas.getContext('2d');

	// Initialize Audio Context if it doesn't exist
	if (!audioContext) {
		audioContext = new(window.AudioContext || window.webkitAudioContext)();
		analyser = audioContext.createAnalyser();
		const source = audioContext.createMediaElementSource(audioPlayer);
		source.connect(analyser);
		analyser.connect(audioContext.destination);
		analyser.fftSize = 256;
		dataArray = new Uint8Array(analyser.frequencyBinCount);
	}

	function draw() {
		animationId = requestAnimationFrame(draw);
		analyser.getByteFrequencyData(dataArray);

		// Clear canvas with a slight fade for an "ink bleed" effect
		ctx.fillStyle = 'rgba(244, 241, 232, 0.2)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		const barWidth = (canvas.width / dataArray.length) * 2.5;
		let x = 0;

		for (let i = 0; i < dataArray.length; i++) {
			const barHeight = dataArray[i] / 2;
			// Use your "Naturalist Red" color for the ink
			ctx.fillStyle = `rgba(140, 46, 27, ${barHeight / 100})`;
			ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
			x += barWidth + 1;
		}
	}

	// Stop any previous animation before starting a new one
	if (animationId) cancelAnimationFrame(animationId);
	draw();
}
// ============================================
// E. LOCATIONS
// ============================================

async function loadLocations() {
	try {
		const {
			data: {
				user
			}
		} = await supabaseClient.auth.getUser();

		if (!user) {
			savedLocations = [];
			populateLocationDatalist();
			return;
		}

		const {
			data,
			error
		} = await supabaseClient
			.from('saved_locations')
			.select('location')
			.eq('user_id', user.id) // Filter by the user's ID
			.order('location', {
				ascending: true
			});

		if (error) throw error;
		savedLocations = data ? data.map(item => item.location) : [];
		populateLocationDatalist();
	} catch (error) {
		console.error("Error loading locations:", error);
	}
}

async function saveNewLocation(locationName, lat, lng) {
    if (!locationName) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (!user) {
            console.log("No user logged in - skipping location hub save.");
            return;
        }

        console.log("Syncing location hub:", locationName);

        // 'upsert' handles both creating NEW hubs and updating OLD ones
        const { error } = await supabaseClient
            .from('saved_locations')
            .upsert({ 
                location: locationName, 
                lat: lat ? parseFloat(lat) : null, 
                lng: lng ? parseFloat(lng) : null,
                user_id: user.id 
            }, { onConflict: 'location' });

        if (error) {
            console.error("Supabase Hub Error:", error.message);
        } else {
            // Update your local list so the search bar knows about it
            if (!savedLocations.includes(locationName)) {
                savedLocations.push(locationName);
                populateLocationDatalist();
            }
        }
    } catch (error) {
        console.error("Error in saveNewLocation:", error);
    }
}

function populateLocationDatalist() {
	const datalist = document.getElementById('location-datalist');
	if (!datalist) return;
	datalist.innerHTML = '';
	savedLocations.forEach(loc => {
		const opt = document.createElement('option');
		opt.value = loc;
		datalist.appendChild(opt);
	});
}

// ============================================
// F. BIRD LIST & 
// ============================================

function toggleAdminControls(isAdmin) {
	// This looks for any element with the class 'pencil-icon'
	const adminIcons = document.querySelectorAll('.pencil-icon');

	adminIcons.forEach(icon => {
		if (isAdmin) {
			icon.style.setProperty('display', 'inline-block', 'important');
		} else {
			icon.style.setProperty('display', 'none', 'important');
		}
	});
}

function populateSpeciesDatalist() {
	const datalist = document.getElementById('species-datalist');
	if (!datalist) return;
	datalist.innerHTML = '';
	allUKBirds.forEach(bird => {
		const opt = document.createElement('option');
		opt.value = bird.CommonName;
		datalist.appendChild(opt);
	});
}

// 1. THE MAIN FILTER FUNCTION
function filterAndDisplayBirds() {
	verifiedImageCache.clear();
	const filterValue = document.getElementById('rarity-filter')?.value || 'All';
	const listContainer = document.getElementById('bird-list');
	if (!listContainer) return;

	listContainer.innerHTML = '';

	// Filter the list based on rarity and search query
	let filteredBirds = filterValue === 'All' ? allUKBirds : allUKBirds.filter(b => b.Rarity === filterValue);

	if (currentSearchQuery && currentSearchQuery.trim() !== '') {
		const q = currentSearchQuery.toLowerCase();
		filteredBirds = filteredBirds.filter(b =>
			b.CommonName.toLowerCase().includes(q) || (b.LatinName || '').toLowerCase().includes(q)
		);
	}

	const seenSpecies = new Set(mySightings.map(s => s.species));
	const cardTemplate = document.getElementById('bird-card-template');

	filteredBirds.forEach(bird => {
		const cardClone = cardTemplate.content.cloneNode(true);
		const card = cardClone.querySelector('.bird-card');
		const imageContainer = card.querySelector('.card-image-container');
		const imageEl = card.querySelector('.card-image');

		// 1. DATA ATTRIBUTES (Essential for Edit/Verify scripts)
		card.dataset.commonName = bird.CommonName;
		card.id = `card-${bird.CommonName.replace(/\s+/g, '-')}`;

		// 2. TEXT CONTENT
		card.querySelector('.card-common-name').textContent = bird.CommonName;
		const rarityTag = card.querySelector('.card-rarity-tag');
		rarityTag.textContent = bird.Rarity;
		rarityTag.className = `card-rarity-tag rarity-${bird.Rarity}`;

		// 3. THE MAGIC LINK (This restores badges and edit buttons)
		// This calls your original script that handles the "Confirm" overlay
		if (typeof applyBirdImageData === 'function') {
			applyBirdImageData(card, imageContainer, imageEl, bird);
		}

		// 4. CLICK LISTENER
		card.addEventListener('click', (e) => {
			// Don't open modal if clicking 'Confirm' or Admin buttons
			if (!e.target.closest('.image-verify-overlay') && !e.target.closest('.admin-controls')) {
				const birdSightings = mySightings.filter(s => s.species === bird.CommonName);
				showSightingModal(bird.CommonName, bird, birdSightings);
				fetchBirdSong(bird.LatinName, bird.CommonName);
			}
		});

		listContainer.appendChild(cardClone);
	});
	// Admin check
	supabaseClient.auth.getSession().then(({
		data: {
			session
		}
	}) => {
		const isAdmin = session?.user?.id === ADMIN_UID;
		toggleAdminControls(isAdmin);
	});
}

// 2. THE IMAGE HELPER (Defined outside to keep things tidy)
function applyBirdImageData(card, imageContainer, imageEl, bird) {
	getBirdImage(bird.CommonName, bird.LatinName).then(result => {
		// Ensure we are working with a clean slate inside the async block
		const badge = imageContainer.querySelector('.verified-check-badge');
		if (badge) badge.remove();
		card.classList.remove('verified-card');

		if (result && result.url) {
			imageEl.src = result.url;
			imageEl.style.display = 'block';

			// STRICT CHECK: result.isVerified must exist and be true
			if (result.isVerified === true) {
				card.classList.add('verified-card');

				const vBadge = document.createElement('div');
				vBadge.className = 'verified-check-badge';
				vBadge.innerHTML = '✓ Verified';
				imageContainer.appendChild(vBadge);

				const keepBtn = card.querySelector('.keep-btn');
				if (keepBtn) keepBtn.style.display = 'none';
			} else {
				// Not verified - ensure button is visible
				const keepBtn = card.querySelector('.keep-btn');
				if (keepBtn) keepBtn.style.display = 'inline-block';
			}
			handleImageVerification(card, bird);
		} else {
			imageEl.style.display = 'none';
		}
	});
}

function setupSearchBar() {
	const searchBar = document.getElementById('search-bar');
	if (!searchBar) return;
	let timeout;
	searchBar.addEventListener('input', (e) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			currentSearchQuery = e.target.value; // This updates the global variable
			filterAndDisplayBirds(); // This runs the filter
		}, 300);
	});
}

function setupRarityFilter() {
	const rarityFilter = document.getElementById('rarity-filter');
	if (rarityFilter) {
		rarityFilter.addEventListener('change', () => {
			filterAndDisplayBirds();
		});
	}
}

function getUniqueSeenSpecies() {
	return new Set(mySightings.filter(s => isSpeciesValid(s.species)).map(s => s.species));
}

function isSpeciesValid(name) {
	return allUKBirds.some(b => b.CommonName.trim() === name.trim());
}

// ============================================
// G. IMAGE FETCHING
// ============================================

// Global cache to avoid hitting Supabase too many times in one session
const verifiedImageCache = new Map();

// Keep this exactly as it is (it handles your cache and Supabase check)
async function getBirdImage(commonName, latinName) {
	// 1. Check local cache first
	if (verifiedImageCache.has(commonName)) {
		return {
			url: verifiedImageCache.get(commonName),
			isVerified: true
		};
	}

	try {
		const {
			data
		} = await supabaseClient
			.from('verified_images')
			.select('image_url')
			.eq('species', commonName)
			.maybeSingle();

		// 2. ONLY return isVerified: true if data actually exists in Supabase
		if (data && data.image_url) {
			verifiedImageCache.set(commonName, data.image_url);
			return {
				url: data.image_url,
				isVerified: true
			};
		}
	} catch (err) {
		console.warn("Storage check failed", err);
	}

	// 3. FALLBACK: If not in Supabase, fetch from iNaturalist and mark isVerified as FALSE
	const apiUrl = await getiNaturalistImage(commonName, latinName);
	return {
		url: apiUrl,
		isVerified: false
	}; // This line MUST say false
}

// Keep this helper too
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add a second cache just for "failed" birds so we stop pestering the API
const failedBirdsCache = new Set();

async function getiNaturalistImage(commonName, latinName, page = 1, retries = 3) {
	if (failedBirdsCache.has(commonName) || verifiedImageCache.has(commonName)) {
		return verifiedImageCache.get(commonName) || null;
	}

	await sleep(300);

	const searchTerm = (latinName && latinName !== 'No Data') ? latinName : commonName;
	const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&iconic_taxa=Aves&rank=species&per_page=1`;

	try {
		const resp = await fetch(url);
		if (resp.status === 429 && retries > 0) {
			await sleep(2000);
			return getiNaturalistImage(commonName, latinName, page, retries - 1);
		}
		if (!resp.ok) throw new Error('CORS or Network Block');

		const data = await resp.json();
		const photoUrl = data.results[0]?.default_photo?.medium_url || null;

		if (photoUrl) {
			verifiedImageCache.set(commonName, photoUrl);
		} else {
			failedBirdsCache.add(commonName);
		}
		return photoUrl;
	} catch (error) {
		failedBirdsCache.add(commonName);
		return null;
	}
}

function handleImageVerification(card, birdData) {
	const editBtn = card.querySelector('.verify-edit-btn');
	const controls = card.querySelector('.verify-controls');
	const imageEl = card.querySelector('.card-image');
	const uploadTrigger = card.querySelector('.upload-trigger-btn');
	const fileInput = card.querySelector('.bird-image-upload');

	if (!editBtn || !controls || !imageEl) return;

	// Toggle the verification menu
	editBtn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		const isCurrentlyHidden = controls.style.display === 'none';
		controls.style.display = isCurrentlyHidden ? 'block' : 'none';
	});

	// KEEP BUTTON: Save current API image as the "Verified" one
	const keepBtn = card.querySelector('.keep-btn');
	if (keepBtn) {
		keepBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();

			const {
				error
			} = await supabaseClient
				.from('verified_images')
				.upsert({
					species: birdData.CommonName,
					image_url: imageEl.src
				});

			if (!error) {
				verifiedImageCache.set(birdData.CommonName, imageEl.src);
				controls.style.display = 'none';
				alert("Image verified and saved!");
				// Refresh the display to show the checkmark
				updateAllDisplays();
			}
		});
	}

	// REFRESH BUTTON: Try a different image from the API
	// Inside handleImageVerification(card, birdData)
	const refreshBtn = card.querySelector('.refresh-btn');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', async (e) => {
			e.preventDefault();
			e.stopPropagation(); // CRITICAL: Stop the card click from triggering

			// 1. Set Loading State
			const originalContent = refreshBtn.innerHTML;
			refreshBtn.innerHTML = '⏳ Loading...';
			refreshBtn.style.opacity = '0.7';
			refreshBtn.style.pointerEvents = 'none';

			console.log("Refreshing image for:", birdData.CommonName);

			try {
				// 2. Fetch new image
				// Use a random page to get a different result from iNaturalist
				const randomPage = Math.floor(Math.random() * 20) + 1;
				const newUrl = await getiNaturalistImage(birdData.CommonName, birdData.LatinName, randomPage);

				if (newUrl) {
					const imageEl = card.querySelector('.card-image');
					imageEl.src = newUrl;

					// If there's a placeholder div currently visible, remove it
					const placeholder = card.querySelector('.image-placeholder');
					if (placeholder) placeholder.remove();

					imageEl.style.display = 'block';
				} else {
					alert("Couldn't find another image for this species.");
				}
			} catch (error) {
				console.error("Refresh failed:", error);
				alert("Error fetching new image.");
			} finally {
				// 3. Restore Button State
				refreshBtn.innerHTML = originalContent;
				refreshBtn.style.opacity = '1';
				refreshBtn.style.pointerEvents = 'auto';
			}
		});
	}

	// UPLOAD LOGIC
	if (uploadTrigger && fileInput) {
		uploadTrigger.addEventListener('click', (e) => {
			e.stopPropagation();
			fileInput.click();
		});

		fileInput.addEventListener('change', async (e) => {
			e.stopPropagation();
			const file = e.target.files[0];
			if (!file) return;

			const fileExt = file.name.split('.').pop();
			const fileName = `${birdData.CommonName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`;

			uploadTrigger.textContent = "Uploading...";

			try {
				const {
					data: uploadData,
					error: uploadError
				} = await supabaseClient
					.storage
					.from('bird-images')
					.upload(fileName, file);

				if (uploadError) throw uploadError;

				const {
					data: urlData
				} = supabaseClient
					.storage
					.from('bird-images')
					.getPublicUrl(fileName);

				const {
					error: dbError
				} = await supabaseClient
					.from('verified_images')
					.upsert({
						species: birdData.CommonName,
						image_url: urlData.publicUrl
					});

				if (dbError) throw dbError;

				imageEl.src = urlData.publicUrl;
				verifiedImageCache.set(birdData.CommonName, urlData.publicUrl);
				controls.style.display = 'none';
				alert("Custom photo uploaded successfully!");
				updateAllDisplays();
			} catch (err) {
				console.error(err);
				alert("Upload failed. Check Supabase storage policies.");
			} finally {
				uploadTrigger.textContent = "📤 Upload My Own";
			}
		});
	}
}
async function fetchBirdDescription(speciesName) {
	try {
		const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(speciesName)}`);
		const data = await response.json();
		return data.extract || "No detailed field notes found for this species.";
	} catch (error) {
		console.error("Wiki fetch error:", error);
		return "Field notes are currently unavailable.";
	}
}

// ============================================
// H. FORM SUBMISSION
// ============================================

// 1. The Function (with the safety gate)
function addSightingEntry(isManualClick = false) {
    const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');

    // Safety Gate: If it's an auto-call and we already have a box, stop.
    if (!isManualClick && entryGroups.length >= 1) {
        return;
    }

    if (entryGroups.length >= 20) {
        alert("Maximum of 20 birds per submission reached.");
        return;
    }

    const template = document.getElementById('sighting-template');
    if (!template) return;
    const entryClone = template.content.cloneNode(true);
    const newEntry = entryClone.querySelector('.sighting-entry-group');

    // Remove Button Logic
    newEntry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        newEntry.remove();
        if (entriesContainer.querySelectorAll('.sighting-entry-group').length === 0) {
            addSightingEntry(false); 
        }
        if (addEntryBtn) {
            addEntryBtn.style.opacity = '1';
            addEntryBtn.style.cursor = 'pointer';
        }
    });

    entriesContainer.appendChild(newEntry);
}

// 2. Set default date
const dateInput = document.getElementById('sighting-date');
if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
}

// 3. Event Listener (Manual Click)
if (addEntryBtn) {
    addEntryBtn.onclick = () => addSightingEntry(true);
}

// 4. Initial Load (Auto-start)
// This is the ONLY place this should run when the page opens
if (entriesContainer) {
    entriesContainer.innerHTML = ''; 
    addSightingEntry(false);
}

// 5. Form Submission
if (sightingForm) {
    sightingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const date = document.getElementById('sighting-date').value;
        const location = document.getElementById('location').value.trim();
        const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');

        // NEW: Grab the coordinates from the map picker
        const lat = document.getElementById('selected-lat').value;
        const lng = document.getElementById('selected-lng').value;

        if (!date || !location) {
            alert("Please enter both a Date and a Location.");
            return;
        }

        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');

        if (progressContainer) progressContainer.style.display = 'block';
        let savedCount = 0;
        const totalToSave = entryGroups.length;

        try {
            // This saves the location name to your 'saved_locations' table
            await saveNewLocation(location, lat, lng); 

            for (const group of entryGroups) {
                const speciesInput = group.querySelector('.species-input');
                const species = speciesInput?.value.trim();

                if (species && isSpeciesValid(species)) {
                    // UPDATED: Now sending the coordinates along with the bird!
                    await saveSighting({ 
                        species, 
                        date, 
                        location,
                        lat: lat ? parseFloat(lat) : null,
                        lng: lng ? parseFloat(lng) : null
                    });
                    
                    savedCount++;

                    if (progressBar && progressText) {
                        const percent = (savedCount / totalToSave) * 100;
                        progressBar.style.width = percent + "%";
                        progressText.textContent = `${savedCount} / ${totalToSave}`;
                    }
                }
            }

            alert(`Successfully recorded ${savedCount} sightings!`);

            // RESET FORM: Wipe and start fresh with ONE
            entriesContainer.innerHTML = '';
            addSightingEntry(false);

            if (progressContainer) progressContainer.style.display = 'none';
            if (progressBar) progressBar.style.width = "0%";
            if (addEntryBtn) {
                addEntryBtn.style.opacity = '1';
                addEntryBtn.style.cursor = 'pointer';
            }

            updateAllDisplays();

        } catch (error) {
            console.error("Upload failed:", error);
            alert("There was an error saving your sightings.");
        }
    });
}
function initLocationPicker() {
    // Fix the broken marker icons once and for all
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    if (pickerMap) return; 

    pickerMap = L.map('location-picker-map', {
    tap: false, // Prevents "phantom" clicks on mobile/touch
    touchZoom: true
}).setView([50.8139, -0.3711], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);

    pickerMap.on('click', function(e) {
        setPickerLocation(e.latlng.lat, e.latlng.lng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
}

function setPickerLocation(lat, lng) {
    if (pickerMarker) {
        pickerMarker.setLatLng([lat, lng]);
    } else {
        pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMap);
        pickerMarker.on('dragend', function() {
            const pos = pickerMarker.getLatLng();
            reverseGeocode(pos.lat, pos.lng);
        });
    }
    
    document.getElementById('selected-lat').value = lat;
    document.getElementById('selected-lng').value = lng;
    document.getElementById('display-coords').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Secret Weapon: Turn coordinates into an address name automatically
async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        const name = data.display_name.split(',')[0] || "Unknown Location";
        document.getElementById('location').value = name;
    } catch (err) {
        console.error("Naming failed", err);
    }
}
// ============================================
// I. STATISTICS & CHARTS
// ============================================

function calculateAndDisplayStats() {
	// 1. DATA SAFETY CHECK
	// If your bird list hasn't loaded from the database yet, stop here.
	if (!allUKBirds || allUKBirds.length === 0) {
		console.warn("⚠️ Stats delay: Bird database not yet loaded.");
		return;
	}

	const sightingsToUse = getFilteredSightings() || [];
	const seenSpeciesNames = new Set(sightingsToUse.map(s => s.species));
	const totalSeenCount = seenSpeciesNames.size;
	const totalPossible = allUKBirds.length;

	// 2. FORCE VISIBILITY
	// This ensures the container isn't being hidden by a CSS ghost
	const statsView = document.getElementById('stats-view');
	if (statsView) {
		statsView.style.display = 'block';
		statsView.classList.add('active-content');
	}

	// --- YOUR EXISTING LOGIC (with safety checks) ---
	const totalSpeciesEl = document.getElementById('total-species');
	if (totalSpeciesEl) totalSpeciesEl.textContent = totalSeenCount;

	const percentageSeenEl = document.getElementById('percentage-seen');
	if (percentageSeenEl) {
		const percentage = totalPossible > 0 ? (totalSeenCount / totalPossible) * 100 : 0;
		percentageSeenEl.textContent = percentage.toFixed(2) + '%';
	}

	const nonMegaBirds = allUKBirds.filter(bird => bird.Rarity !== 'Mega');
	const seenNonMegaCount = Array.from(seenSpeciesNames).filter(speciesName => {
		const bird = allUKBirds.find(b => b.CommonName === speciesName);
		return bird && bird.Rarity !== 'Mega';
	}).length;

	const percentageNoMegaEl = document.getElementById('percentage-no-mega');
	if (percentageNoMegaEl && nonMegaBirds.length > 0) {
		const pNoMega = (seenNonMegaCount / nonMegaBirds.length) * 100;
		percentageNoMegaEl.textContent = pNoMega.toFixed(2) + '%';
	}

	// Rank Logic
	const ranks = [{
			name: "Passerine",
			level: "1",
			threshold: 0,
			color: "#f5e0c5"
		},
		{
			name: "Corvid",
			level: "2",
			threshold: 10,
			color: "#cbb093"
		},
		{
			name: "Charadriiform",
			level: "3",
			threshold: 50,
			color: "#dfa478"
		},
		{
			name: "Falconiform",
			level: "4",
			threshold: 150,
			color: "#a1b5aa"
		},
		{
			name: "Aquiline",
			level: "5",
			threshold: 300,
			color: "#a4624c"
		}
	];

	let currentRank = ranks[0];
	let nextRank = ranks[1];

	for (let i = 0; i < ranks.length; i++) {
		if (totalSeenCount >= ranks[i].threshold) {
			currentRank = ranks[i];
			nextRank = ranks[i + 1] || ranks[i];
		}
	}

	const rankTitleElement = document.querySelector('.id-rank-title');
	if (rankTitleElement) rankTitleElement.textContent = currentRank.name;

	const waxSeal = document.querySelector('.rank-stamp-seal');
	const sealText = document.querySelector('.seal-inner-text');
	if (waxSeal && sealText) {
		waxSeal.style.backgroundColor = currentRank.color;
		sealText.textContent = `LVL ${currentRank.level}`;
	}

	const progressBar = document.getElementById('level-progress-bar');
	if (progressBar) {
		const progressPercent = Math.min((totalSeenCount / nextRank.threshold) * 100, 100);
		progressBar.style.width = `${progressPercent}%`;

		const nextLevelName = document.getElementById('next-level-name');
		if (nextLevelName) nextLevelName.textContent = `Next: ${nextRank.name}`;

		const currentDisplay = document.getElementById('current-count-display');
		const targetDisplay = document.getElementById('target-count-display');
		if (currentDisplay) currentDisplay.textContent = totalSeenCount;
		if (targetDisplay) targetDisplay.textContent = nextRank.threshold;
	}

	// Milestones
	if (typeof calculateMilestones === 'function') {
		calculateMilestones();
	}
}

function calculateMilestones() {
	const sightingsToUse = getFilteredSightings(); // Respects the Year Toggle
	const grid = document.getElementById('milestones-grid');
	if (!grid) return;

	grid.innerHTML = '';

	// 1. Calculate Core Counts
	const totalSightings = sightingsToUse.length;
	const uniqueSpeciesCount = new Set(sightingsToUse.map(s => s.species)).size;

	// 2. Calculate Specialist (Most sightings at one spot in the selected period)
	const locCounts = {};
	sightingsToUse.forEach(s => {
		if (s.location) locCounts[s.location] = (locCounts[s.location] || 0) + 1;
	});
	const maxAtOneLoc = Math.max(...Object.values(locCounts), 0);

	// 3. Calculate Mega Finder (Total Megas seen in the selected period)
	const megaCount = sightingsToUse.filter(s => {
		const bird = allUKBirds.find(b => b.CommonName === s.species);
		return bird && bird.Rarity === 'Mega';
	}).length;

	const milestones = [{
			name: 'Life List',
			current: uniqueSpeciesCount,
			tiers: [100, 200, 400],
			unit: 'species'
		},
		{
			name: 'Journalist',
			current: totalSightings,
			tiers: [500, 1500, 3000],
			unit: 'logs'
		},
		{
			name: 'Specialist',
			current: maxAtOneLoc,
			tiers: [50, 150, 300],
			unit: 'at one location'
		},
		{
			name: 'Mega Finder',
			current: megaCount,
			tiers: [5, 10, 20],
			unit: 'megas'
		}
	];

	milestones.forEach(m => {
		let level = 'none';
		let target = m.tiers[0];

		if (m.current >= m.tiers[2]) {
			level = 'gold';
			target = m.tiers[2];
		} else if (m.current >= m.tiers[1]) {
			level = 'silver';
			target = m.tiers[2];
		} else if (m.current >= m.tiers[0]) {
			level = 'bronze';
			target = m.tiers[1];
		}

		const badge = document.createElement('div');
		badge.className = `badge-card ${level}`;
		badge.innerHTML = `
            <div class="badge-icon-container">
                <div class="vintage-seal ${level}">
                    <span class="seal-inner"></span>
                </div>
            </div>
            <div class="badge-info">
                <strong>${m.name}</strong>
                <span>${m.current} / ${target} ${m.unit}</span>
                <div class="badge-level-tag">${level.toUpperCase()}</div>
            </div>
        `;
		grid.appendChild(badge);
	});
}

function getFilteredSightings() {
	if (currentYearFilter === 'Lifetime') return mySightings;

	return mySightings.filter(s => {
		if (!s.date) return false;
		const sightingYear = new Date(s.date).getFullYear().toString();
		return sightingYear === currentYearFilter;
	});
}

function createMonthlyChart() {
	const ctx = document.getElementById('monthly-chart');
	if (!ctx) return;

	const sightingsToUse = getFilteredSightings();
	let labels = [];
	let data = [];

	if (currentYearFilter !== 'Lifetime') {
		// --- 12-MONTH VIEW for specific years ---
		labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const monthCounts = new Array(12).fill(0);

		sightingsToUse.forEach(sighting => {
			const date = new Date(sighting.date);
			monthCounts[date.getMonth()]++;
		});
		data = monthCounts;

	} else {
		// --- CHRONOLOGICAL VIEW for Lifetime (Fixes mobile sorting) ---
		const monthCounts = {};

		mySightings.forEach(sighting => {
			const date = new Date(sighting.date);
			const sortKey = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, '0');
			const label = date.toLocaleString('default', {
				month: 'short',
				year: 'numeric'
			});

			if (!monthCounts[sortKey]) {
				monthCounts[sortKey] = {
					count: 0,
					label: label
				};
			}
			monthCounts[sortKey].count++;
		});

		const sortedKeys = Object.keys(monthCounts).sort();
		labels = sortedKeys.map(key => monthCounts[key].label);
		data = sortedKeys.map(key => monthCounts[key].count);
	}

	// 2. Destroy old chart instance if it exists
	if (birdChart) {
		birdChart.destroy();
	}

	// 3. Create the Chart (Now ctx is properly enclosed inside the function!)
	birdChart = new Chart(ctx, {
		type: 'line',
		data: {
			labels: labels,
			datasets: [{
				label: currentYearFilter === 'Lifetime' ? 'Lifetime' : currentYearFilter,
				data: data,
				backgroundColor: 'rgba(140, 46, 27, 0.2)',
				borderColor: '#8c2e1b',
				borderWidth: 2,
				tension: 0.3,
				pointBackgroundColor: '#8c2e1b',
				fill: true
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						stepSize: 1,
						font: {
							family: 'Courier New'
						}
					},
					grid: {
						color: 'rgba(0,0,0,0.05)'
					}
				},
				x: {
					ticks: {
						font: {
							family: 'Courier New',
							size: 10
						},
						autoSkip: true,
						maxRotation: 45
					},
					grid: {
						display: false
					}
				}
			},
			plugins: {
				legend: {
					display: false
				}
			}
		}
	});
} 

function createRarityChart() {
    const ctx = document.getElementById('rarity-pie-chart');
    if (!ctx) return;

    const sightingsToUse = getFilteredSightings();
    const uniqueSpeciesNames = new Set(sightingsToUse.map(s => s.species));
    
    // 1. Map counts to rarities
    const counts = { "Mega": 0, "Rare": 0, "Scarce": 0, "Local": 0, "Common": 0 };
    
    uniqueSpeciesNames.forEach(name => {
        const bird = allUKBirds.find(b => b.CommonName === name);
        if (bird && counts.hasOwnProperty(bird.Rarity)) {
            counts[bird.Rarity]++;
        }
    });

    if (rarityChart) { rarityChart.destroy(); }

    rarityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#682d1f', '#a4523a', '#416863', '#8a9575', '#ddc8a9'],
                borderWidth: 2,
                borderColor: '#fdfaf0'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: 'EB Garamond', size: 12 } }
                }
            },
            cutout: '70%' // Makes it a ring
        }
    });
}

function getExpeditionData(date, location) {
    const tripSightings = mySightings.filter(s => s.date === date && s.location === location);
    if (tripSightings.length === 0) return null;

    let rarestBird = tripSightings[0].species;
    let highestRarityValue = 0;
    const rarityRank = { "Common": 1, "Local": 2, "Scarce": 3, "Rare": 4, "Mega": 5 };

    tripSightings.forEach(s => {
        const birdInfo = allUKBirds.find(b => b.CommonName === s.species);
        const currentRank = birdInfo ? rarityRank[birdInfo.Rarity] || 0 : 0;
        if (currentRank > highestRarityValue) {
            highestRarityValue = currentRank;
            rarestBird = s.species;
        }
    });

    return {
        date: date,
        location: location,
        speciesCount: new Set(tripSightings.map(s => s.species)).size,
        rarestSpecies: rarestBird,
        allSpecies: Array.from(new Set(tripSightings.map(s => s.species)))
    };
}

async function fetchRegistryData() {
    const listContainer = document.getElementById('leaderboard-list');
    if (!listContainer) return;

    const getRankInfo = (count) => {
        if (count >= 300) return { name: "Aquiline", color: "#a4624c" };
        if (count >= 150) return { name: "Falconiform", color: "#a1b5aa" };
        if (count >= 50) return { name: "Charadriiform", color: "#dfa478" };
        if (count >= 10) return { name: "Corvid", color: "#cbb093" };
        return { name: "Passerine", color: "#f5e0c5" };
    };

    try {
        const [sightingsRes, profilesRes] = await Promise.all([
            supabaseClient.from('sightings').select('user_id, species'),
            supabaseClient.from('profiles').select('id, username')
        ]);

        if (sightingsRes.error) throw sightingsRes.error;

        const nameMap = {};
        if (profilesRes.data) {
            profilesRes.data.forEach(p => {
                nameMap[p.id] = p.username;
            });
        }

        const userStats = {};
        sightingsRes.data.forEach(s => {
            const uid = String(s.user_id);
            if (!userStats[uid]) userStats[uid] = new Set();
            userStats[uid].add(s.species);
        });

        const leaderboard = Object.keys(userStats).map(uid => ({
            id: uid,
            username: nameMap[uid] || `Observer ${uid.substring(0, 5)}`,
            count: userStats[uid].size
        })).sort((a, b) => b.count - a.count);

        listContainer.innerHTML = '';
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (leaderboard.length === 0) {
            listContainer.innerHTML = '<p class="loading-text">No distinguished observers found.</p>';
            return;
        }

        // Render rows
        leaderboard.forEach((obs, index) => {
            const rank = getRankInfo(obs.count);
            const entry = document.createElement('div');
            entry.className = 'registry-entry';
            const isMe = user && String(obs.id) === String(user.id);
            
            if (isMe) {
                entry.style.backgroundColor = "rgba(65, 104, 99, 0.1)";
                entry.style.borderLeft = "4px solid var(--color-primary)";
            }

            entry.innerHTML = `
                <span class="registry-name">${index + 1}. ${obs.username} ${isMe ? '(You)' : ''}</span>
                <span class="registry-rank-badge" style="background-color: ${rank.color}">${rank.name}</span>
                <span class="registry-count" style="font-family: 'Courier New', monospace;">${obs.count} Species</span>
            `;
            listContainer.appendChild(entry);
        });

        // Add the single footer
        const grandTotal = sightingsRes.data.length;
        const footer = document.createElement('div');
        footer.className = 'registry-footer';
        footer.innerHTML = `
            <span class="total-count-label">Total Archive Records:</span>
            <span class="total-count-value">${grandTotal}</span>
        `;
        listContainer.appendChild(footer);

    } catch (err) {
        console.error("Registry failed:", err);
        listContainer.innerHTML = "<p>Archives inaccessible.</p>";
    }
}

// Map setup

async function initBirdMap() {
    if (map) { 
        map.remove(); 
        map = null; 
    }

    // 1. Initialize with Canvas for speed
    map = L.map('bird-map', {
        renderer: L.canvas() 
    }).setView([50.8139, -0.3711], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // 2. Data Sourcing
    const sightings = mySightings || []; 
    
    if (cachedLocations.length === 0) {
        const { data, error } = await supabaseClient
            .from('saved_locations')
            .select('location, lat, lng');
        if (!error) cachedLocations = data;
    }
    const locations = cachedLocations;

    // 3. Setup the Interactive Pane
    // Important: We need 'pointer-events: auto' for the markers to be clickable
    const pane = map.createPane('hubsPane');
    pane.style.zIndex = 650;
    pane.style.pointerEvents = 'none'; 

    // 4. Heat Layer
    const heatData = sightings
        .filter(s => s.lat && s.lng)
        .map(s => [parseFloat(s.lat), parseFloat(s.lng), 0.5]);

    if (heatData.length > 0) {
        L.heatLayer(heatData, { 
            radius: 25, 
            blur: 15, 
            maxZoom: 17,
            gradient: { 0.2: '#416863', 0.4: '#d1ccbc', 0.6: '#e2a76f', 0.9: '#8c2e1b', 1.0: '#5c1e11' }
        }).addTo(map);
    }

    // 5. Drawing Invisible Hubs
    if (locations) {
        locations.forEach(loc => {
            // Ensure we have valid numbers
            const lat = parseFloat(loc.lat);
            const lng = parseFloat(loc.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const locationSightings = sightings.filter(s => s.location === loc.location);
            if (locationSightings.length === 0) return;

            const uniqueSpecies = [...new Set(locationSightings.map(s => s.species))].sort();

            // Create the invisible circle marker
            const hubMarker = L.circleMarker([lat, lng], {
                pane: 'hubsPane',
                radius: 25, // Large hit area
                fillColor: "#ff0000", // Red (but we set opacity to 0)
                color: "transparent",
                weight: 0,
                fillOpacity: 0, // 0 makes it invisible, but still clickable
                interactive: true 
            }).addTo(map);

            hubMarker.bindPopup(`
                <div class="map-popup-container">
                    <header class="map-popup-header">
                        <h3 class="serif-title" style="margin:0; color:#416863;">${loc.location}</h3>
                        <span class="species-count-badge" style="background:#8c2e1b; color:white; padding:2px 6px; border-radius:4px; font-size:0.8rem;">
                            ${uniqueSpecies.length} Species
                        </span>
                    </header>
                    <hr style="border:0; border-top:1px solid #d1ccbc; margin:8px 0;">
                    <div class="map-popup-body">
                        <ul style="list-style:none; padding:0; margin:0; max-height:150px; overflow-y:auto;">
                            ${uniqueSpecies.map(sp => `<li style="padding:2px 0; border-bottom:1px solid #eee;">• ${sp}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `, { maxWidth: 250 });
        });
    }
}
// 1. SIGN UP
async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) return alert("Please enter both email and password.");

    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        alert("Error: " + error.message);
    } else if (data.user) {
        // Create the public profile entry immediately
        const username = email.split('@')[0];
        await supabaseClient
            .from('profiles')
            .upsert({ id: data.user.id, username: username });
            
        alert("Success! Check your email for a confirmation link.");
    }
}

function displayExpeditionCard(tripData) {
	if (!tripData) return;

	// Update Header & Seal
	document.getElementById('expedition-date').textContent = new Date(tripData.date).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
	document.getElementById('expedition-location').textContent = tripData.location;
	document.getElementById('expedition-count').textContent = tripData.speciesCount;

	// Update Highlight
	document.getElementById('expedition-highlight').textContent = tripData.rarestSpecies;

	// Build the Species Grid (The "Stamps")
	const grid = document.getElementById('expedition-species-list');
	grid.innerHTML = '';

	tripData.allSpecies.forEach(species => {
		const stamp = document.createElement('span');
		stamp.className = 'species-stamp'; // You can style this to look like a tiny ink stamp
		stamp.textContent = species;
		grid.appendChild(stamp);
	});
}

function setupExpeditionSearch() {
	const locInput = document.getElementById('trip-location-search');
	const resultsContainer = document.getElementById('trip-search-results');
	const resultsList = document.getElementById('trip-results-list');

	if (!locInput) return;

	locInput.addEventListener('input', () => {
		const query = locInput.value.toLowerCase().trim();

		if (query.length < 2) {
			resultsContainer.style.display = 'none';
			return;
		}

		// Group sightings into unique trips (Date + Location)
		const tripsMap = new Map();

		mySightings.forEach(s => {
			if (s.location.toLowerCase().includes(query)) {
				const key = `${s.date}|${s.location}`;
				if (!tripsMap.has(key)) {
					tripsMap.set(key, {
						date: s.date,
						location: s.location
					});
				}
			}
		});

		const sortedTrips = Array.from(tripsMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

		if (sortedTrips.length > 0) {
			resultsList.innerHTML = '';
			sortedTrips.forEach(trip => {
				const li = document.createElement('li');
				li.className = 'archive-item';
				const d = new Date(trip.date).toLocaleDateString('en-GB');

				li.innerHTML = `
                    <div class="archive-item-content">
                        <strong>${trip.location}</strong>
                        <span class="archive-date">${d}</span>
                    </div>
                `;

				li.onclick = () => {
					const data = getExpeditionData(trip.date, trip.location);
					displayExpeditionCard(data);
					resultsContainer.style.display = 'none';
					locInput.value = '';
				};
				resultsList.appendChild(li);
			});
			resultsContainer.style.display = 'block';
		} else {
			resultsContainer.style.display = 'none';
		}
	});

	// Close drawer if clicking away
	document.addEventListener('click', (e) => {
		if (!e.target.closest('.expedition-hub')) {
			resultsContainer.style.display = 'none';
		}
	});
}

// 2. LOGIN
async function handleLogin() {
	const email = document.getElementById('auth-email').value;
	const password = document.getElementById('auth-password').value;

	if (!email || !password) return alert("Please enter both email and password.");

	const {
		data,
		error
	} = await supabaseClient.auth.signInWithPassword({
		email,
		password
	});

	if (error) alert("Login Failed: " + error.message);
	// Success is handled by onAuthStateChange below
}

// 3. LOGOUT
async function handleLogout() {
	await supabaseClient.auth.signOut();
	// Clear local data and refresh
	mySightings = [];
	location.reload();
}

document.addEventListener('click', function(e) {
	// --- Auth Buttons ---
	if (e.target.id === 'login-btn') {
		e.preventDefault();
		handleLogin();
	}
	if (e.target.id === 'signup-btn') {
		e.preventDefault();
		handleSignUp();
	}
	if (e.target.id === 'logout-btn') {
		e.preventDefault();
		handleLogout();
	}

	// --- Tab Switching ---
	if (e.target.classList.contains('tab-button')) {
		const targetTabId = e.target.getAttribute('data-tab');
		switchTab(targetTabId); // We'll make sure this function exists below
	}

	// --- Modal Close Button ---
	if (e.target.classList.contains('modal-close') || e.target.id === 'sighting-modal') {
		document.getElementById('sighting-modal').style.display = 'none';
	}
});
supabaseClient.auth.onAuthStateChange((event, session) => {
	const loggedOutView = document.getElementById('logged-out-view');
	const loggedInView = document.getElementById('logged-in-view');

	if (session) {
		// User is LOGGED IN
		if (loggedOutView) loggedOutView.style.display = 'none';
		if (loggedInView) loggedInView.style.display = 'block';
		document.getElementById('user-display-name').textContent = session.user.email.split('@')[0];

		// --- STEP 3: ADMIN CHECK ---
		const isAdmin = session.user.id === ADMIN_UID;
		toggleAdminControls(isAdmin);
		// ---------------------------

		loadSightings();
		loadLocations();
	} else {
		// User is GUEST
		if (loggedOutView) loggedOutView.style.display = 'block';
		if (loggedInView) loggedInView.style.display = 'none';

		// --- STEP 3: HIDE FOR GUESTS ---
		toggleAdminControls(false);
		// ------------------------------

		mySightings = [];
		savedLocations = [];
		updateAllDisplays();
	}
});
// --- BUG REPORT / HELP FORM LOGIC ---

const bugFab = document.getElementById('bug-fab');
const bugPopup = document.getElementById('bug-form-popup');
const closeBugBtn = document.getElementById('close-bug-btn');
const helpForm = document.getElementById('help-form');
const formStatus = document.getElementById('form-status');

// 1. Toggle the popup visibility
if (bugFab && bugPopup) {
	bugFab.addEventListener('click', () => {
		const isHidden = bugPopup.style.display === 'none';
		bugPopup.style.display = isHidden ? 'block' : 'none';
	});

	closeBugBtn.addEventListener('click', () => {
		bugPopup.style.display = 'none';
	});
}

// 2. Handle the Formspree submission
// --- BUG REPORT / HELP FORM LOGIC ---
if (helpForm) {
    helpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(helpForm);
        try {
            const response = await fetch(helpForm.action, {
                method: 'POST',
                body: data,
                headers: { 'Accept': 'application/json' }
            });
            if (response.ok) {
                formStatus.style.display = 'block';
                formStatus.style.color = '#416863';
                formStatus.textContent = "Thank you. The report has been filed.";
                helpForm.reset();
                setTimeout(() => {
                    if (bugPopup) bugPopup.style.display = 'none';
                }, 2000);
            }
        } catch (error) {
            formStatus.style.display = 'block';
            formStatus.style.color = '#682d1f';
            formStatus.textContent = "Submission failed.";
        }
    });
}

// --- ATTACH AUTH EVENT LISTENERS ---
const signupBtn = document.getElementById('signup-btn');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

if (signupBtn) signupBtn.onclick = handleSignUp;
if (loginBtn) loginBtn.onclick = handleLogin;
if (logoutBtn) logoutBtn.onclick = handleLogout;

// --- SETUP FILTERS & SEARCH ---
setupSearchBar();
const rarityFilterEl = document.getElementById('rarity-filter');
if (rarityFilterEl) {
    rarityFilterEl.addEventListener('change', filterAndDisplayBirds);
}

window.handleSummaryFilterChange = function(value) {
    currentSummaryRarityFilter = value;
    displaySeenBirdsSummary();
};

// --- EXPEDITION HUB SETUP ---
setupExpeditionSearch();

// --- MAIN GLOBAL CLICK LISTENER ---
// We wrap this carefully to ensure it is closed
document.addEventListener('click', function(e) {
    const birdCard = e.target.closest('.bird-card');
    if (birdCard && !e.target.closest('.image-verify-overlay')) {
        const nameEl = birdCard.querySelector('.card-common-name');
        if (nameEl) {
            const speciesName = nameEl.textContent;
            const bird = allUKBirds.find(b => b.CommonName === speciesName);
            if (bird) {
                const sightings = mySightings.filter(s => s.species === bird.CommonName);
                showSightingModal(bird.CommonName, bird, sightings);
                fetchBirdSong(bird.LatinName, bird.CommonName);
            }
        }
    }

    if (e.target.classList.contains('modal-close') || e.target.id === 'sighting-modal') {
        const audioPlayer = document.getElementById('bird-audio-player');
        const disc = document.getElementById('vinyl-disc-group');
        const tonearm = document.getElementById('tonearm');
        
        if (audioPlayer) {
            audioPlayer.pause();
            if (disc) disc.classList.remove('spinning-disc');
            if (tonearm) tonearm.classList.remove('arm-on-record');
        }
        const modal = document.getElementById('sighting-modal');
        if (modal) modal.style.display = 'none';
    }
}); // This correctly closes the click listener

// --- FINAL INITIALIZATIONS ---
setupAudioPlayer();
loadUKBirds();
