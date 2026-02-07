const SUPABASE_URL = 'https://vpfoyxvkkttzlitfajgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZm95eHZra3R0emxpdGZhamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NDAxMTQsImV4cCI6MjA3NjUxNjExNH0._vyK8s2gXPSu18UqEEWujLU2tAqNZEh3mNwVQcbskxA';
const ADMIN_UID = 'ec7bdc5d-fff1-4708-b161-15315c402920';
// Renamed to supabaseClient to avoid conflict with the library itself
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// GLOBAL VARIABLES
// ============================================
let allUKBirds = [];
let mySightings = [];
let savedLocations = [];

// Pagination variables
let currentPage = 1;
const ITEMS_PER_PAGE = 100;

// Summary filter
let currentSummaryRarityFilter = 'All';

// Search filter
let currentSearchQuery = '';

let audioContext, analyser, dataArray, animationId;

const entriesContainer = document.getElementById('entries-container');
const addEntryBtn = document.getElementById('add-entry-btn');
const sightingForm = document.getElementById('sighting-form');

let currentYearFilter = 'Lifetime';

function getFilteredSightings() {
    if (currentYearFilter === 'Lifetime') return mySightings;
    
    return mySightings.filter(s => {
        const sightingYear = new Date(s.date).getFullYear().toString();
        return sightingYear === currentYearFilter;
    });
}

window.handleYearChange = function(year) {
    currentYearFilter = year;
    updateAllDisplays(); // This will now trigger everything to redraw with the new year
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
// A. INITIAL LOAD FUNCTIONS
// ============================================

async function loadUKBirds() {
    try {
        const response = await fetch('uk_birds.json');
        if (response.ok) {
            allUKBirds = await response.json();
        }
        
        populateSpeciesDatalist(); 
        await loadSightings(); 
        await loadLocations(); // Ensure this is correct (you had 'loads()' before)
        
        // --- THE FIX ---
        // This ensures the first input box is there on launch
        addSightingEntry(); 
        // ---------------

        setupTabSwitching();
        setupPagination();
        setupSummaryFilter();
        setupSearchBar();
        setupRarityFilter();
        setupExpeditionSearch();
        
        filterAndDisplayBirds();
        
        // Load the most recent trip as a default display
        if (mySightings.length > 0) {
            const latest = mySightings[0]; // Assuming most recent is first
            const data = getExpeditionData(latest.date, latest.location);
            displayExpeditionCard(data);
        }
    } catch (error) {
        console.error("Failed to load:", error);
    }
}
async function loadUKBirds() {
    try {
        const response = await fetch('uk_birds.json');
        if (response.ok) {
            allUKBirds = await response.json();
        }
        
        populateSpeciesDatalist(); 
        await loadSightings(); 
        await loadLocations(); // Ensure this is correct (you had 'loads()' before)
        
        // --- THE FIX ---
        // This ensures the first input box is there on launch
        addSightingEntry(); 
        // ---------------

        setupTabSwitching();
        setupPagination();
        setupSummaryFilter();
        setupSearchBar();
        setupRarityFilter();
        setupModal();
        
        filterAndDisplayBirds(); 
        
    } catch (error) {
        console.error("Failed to load UK bird list:", error);
    }
}
        async function loadSightings() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        // If no user is logged in, clear sightings and stop
        if (!user) {
            mySightings = [];
            updateAllDisplays();
            return;
        }

        // 1. Fetch the actual data from Supabase
        const { data, error } = await supabaseClient
            .from('sightings')
            .select('*');
            
        if (error) throw error;

        // 2. Now 'data' exists!
        if (data) {
            mySightings = data;
            
            // SORT: Newest sightings first
            mySightings.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // This tells all other parts of the app to refresh
            updateAllDisplays(); 
        }
        // Add this inside the 'if (data)' block of loadSightings, after the sort
if (mySightings.length > 0) {
    const latest = mySightings[0];
    const tripData = getExpeditionData(latest.date, latest.location);
    if (tripData) displayExpeditionCard(tripData);
}

        console.log("Loaded", mySightings.length, "sightings.");
    } catch (error) {
        console.error("Error loading sightings:", error);
    }
}
   
async function saveSighting(sighting) {
    try {
        // Get the logged-in user's data
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (!user) {
            alert("You must be logged in to save sightings.");
            return false;
        }

        const { data, error } = await supabaseClient
            .from('sightings')
            .insert([{
                species: sighting.species,
                date: sighting.date,
                location: sighting.location,
                user_id: user.id // <--- Ensure this matches your column name exactly
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

async function deleteSightingFromDB(idToDelete) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (!user) {
            alert("You must be logged in to delete sightings.");
            return false;
        }

        const { error } = await supabaseClient
            .from('sightings')
            .delete()
            .eq('id', idToDelete)
            .eq('user_id', user.id); // Extra security: ensure the ID belongs to the user
        
        if (error) throw error;
        
        mySightings = mySightings.filter(sighting => sighting.id !== idToDelete);
        updateAllDisplays();
        
        return true;
    } catch (error) {
        console.error("Error deleting sighting:", error);
        return false;
    }
}

function updateAllDisplays() {
    displaySightings();
    displaySeenBirdsSummary(); 
    calculateAndDisplayStats();
    filterAndDisplayBirds();
    createMonthlyChart();

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
// B. TAB SWITCHING LOGIC
// ============================================

function switchTab(targetTabId) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabContents.forEach(content => content.classList.remove('active-content'));
    tabButtons.forEach(button => button.classList.remove('active'));

    const targetContent = document.getElementById(targetTabId);
    const targetButton = document.querySelector(`.tab-button[data-tab="${targetTabId}"]`);

    if (targetContent && targetButton) {
        targetContent.classList.add('active-content');
        targetButton.classList.add('active');
    }
}

// Ensure this part is inside your DOMContentLoaded or a setup function
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.getAttribute('data-tab'));
        });
    });

    // Set the default view
    switchTab('database-view');
}

// ============================================
// C. PAGINATION
// ============================================

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
        checklistView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

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

function updatePaginationControls(totalPages, startIndex, endIndex) {
    const pageInfo = totalPages > 0 
        ? `Page ${currentPage} of ${totalPages} (Showing ${startIndex + 1}-${endIndex} of ${mySightings.length})`
        : 'No sightings';
    
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
// D. SUMMARY & MODALS
// ============================================


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
            speciesMap.set(species, { sightings: [sighting] });
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
        
        // ADD 'summary-card' class to keep these styles separate from the main DB
        card.classList.add('seen', 'summary-card');

        // Set Text Data
        card.querySelector('.card-common-name').textContent = birdData.CommonName;
        card.querySelector('.card-latin-name').textContent = birdData.LatinName !== 'No Data' ? birdData.LatinName : '';
        card.querySelector('.card-status-text').textContent = `Seen ${sightingCount} time${sightingCount === 1 ? '' : 's'}`;

        // Set Badges (ONLY if it's a summary card)
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
        
        // --- THE CRITICAL FIX FOR SIGHTINGS LIST ---
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.image-verify-overlay')) {
                // Pass the EXACT list of sightings we just calculated above
                showSightingModal(birdData.CommonName, birdData, sightingsData.sightings);
                fetchBirdSong(birdData.LatinName, birdData.CommonName);
            }
        });
        // Inside your displaySeenBirdsSummary loop:
const cardClone = cardTemplate.content.cloneNode(true);
const card = cardClone.querySelector('.bird-card');

// Store the sightings data directly on the card element
card.dataset.sightings = JSON.stringify(sightingsData.sightings);

card.addEventListener('click', (e) => {
    if (!e.target.closest('.image-verify-overlay')) {
        // Retrieve the data from the "backpack"
        const storedSightings = JSON.parse(card.dataset.sightings);
        console.log("Opening modal with sightings:", storedSightings);
        
        showSightingModal(birdData.CommonName, birdData, storedSightings);
        fetchBirdSong(birdData.LatinName, birdData.CommonName);
    }
});
        
        summaryContainer.appendChild(card);
    });
}
async function showSightingModal(species, birdData, sightings) {
    console.log("Opening modal for:", species, sightings); // Debug check
    const modal = document.getElementById('sighting-modal');
    if (!modal) return;

    // 1. Basic Info (Always works)
    document.getElementById('modal-species-name').textContent = species;
    document.getElementById('modal-species-info').textContent = `${birdData?.LatinName || ''} • ${birdData?.Rarity || ''}`;

    // 2. Render YOUR Sightings (Protected)
    try {
        const modalList = document.getElementById('modal-sightings-list');
        modalList.innerHTML = '';
        if (sightings && sightings.length > 0) {
            const sortedSightings = [...sightings].sort((a, b) => new Date(b.date) - new Date(a.date));
            sortedSightings.forEach(sighting => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${new Date(sighting.date).toLocaleDateString()}</strong> — ${sighting.location}`;
                modalList.appendChild(li);
            });
        } else {
            modalList.innerHTML = '<li>No personal sightings recorded.</li>';
        }
    } catch (e) { console.error("Sightings List Error:", e); }

    // 3. Wikipedia (Protected)
    const descriptionBox = document.getElementById('modal-description-text');
    descriptionBox.textContent = "Consulting the archives...";
    try {
        const desc = await fetchBirdDescription(species);
        descriptionBox.textContent = desc;
    } catch (e) { descriptionBox.textContent = "Field notes unavailable."; }

    // 4. Audio (Protected - This is likely where the crash was happening)
    try {
        fetchBirdSong(birdData?.LatinName, species);
    } catch (e) { console.error("Audio Trigger Error:", e); }
    
    modal.style.display = 'block';
}
async function fetchBirdSong(latinName, commonName) {
    const audioPlayer = document.getElementById('bird-audio-player');
    const loadingOverlay = document.getElementById('audio-loading-overlay');
    const recordingLoc = document.getElementById('recording-location');
    if (!audioPlayer) return;

    // UI Reset
    audioPlayer.pause();
    loadingOverlay.style.display = 'flex';
    recordingLoc.textContent = "Tuning signal...";

    const query = (latinName && latinName !== 'No Data') ? latinName.trim() : commonName.trim();
    
    // Using AllOrigins "Raw" mode to avoid the JSON.parse error
    const xenoUrl = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(xenoUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        const data = await response.json(); // Now it fetches JSON directly

        if (data && data.recordings && data.recordings.length > 0) {
            const bestMatch = data.recordings[0];
            let fileUrl = bestMatch.file;
            if (fileUrl.startsWith('//')) fileUrl = 'https:' + fileUrl;
            
            audioPlayer.src = fileUrl;
            audioPlayer.load();
            recordingLoc.textContent = `Captured: ${bestMatch.loc}`;
        } else {
            recordingLoc.textContent = "No recordings found.";
        }
    } catch (error) {
        recordingLoc.textContent = "Signal lost.";
    } finally {
        loadingOverlay.style.display = 'none';
    }
}
// ============================================
// E. LOCATIONS
// ============================================

async function loadLocations() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (!user) {
            savedLocations = [];
            populateLocationDatalist();
            return;
        }

        const { data, error } = await supabaseClient
            .from('saved_locations')
            .select('location')
            .eq('user_id', user.id) // Filter by the user's ID
            .order('location', { ascending: true });
        
        if (error) throw error;
        savedLocations = data ? data.map(item => item.location) : [];
        populateLocationDatalist();
    } catch (error) {
        console.error("Error loading locations:", error);
    }
}

async function saveNewLocation(location) {
    if (!location || savedLocations.includes(location)) return;
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (!user) {
            console.log("No user logged in - skipping location save.");
            return;
        }

        console.log("Saving location:", location, "for user:", user.id);

        const { error } = await supabaseClient
            .from('saved_locations')
            .insert([{ 
                location: location, 
                user_id: user.id 
            }]);
        
        if (error) {
            console.error("Supabase Error:", error.message);
        } else {
            console.log("Location successfully saved!");
            savedLocations.push(location);
            populateLocationDatalist();
        }
    } catch (error) {
        console.error("Error:", error);
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

    // --- CRITICAL CLEANSE ---
    // Remove any classes or badges that might have "leaked" into the template
    card.classList.remove('verified-card', 'seen');
    imageContainer.querySelectorAll('.verified-check-badge').forEach(b => b.remove());

    // Basic Data
    if (seenSpecies.has(bird.CommonName)) card.classList.add('seen');
    card.querySelector('.card-common-name').textContent = bird.CommonName;
    
    const rarityTag = card.querySelector('.card-rarity-tag');
    rarityTag.textContent = bird.Rarity;
    rarityTag.className = `card-rarity-tag rarity-${bird.Rarity}`;

    // Apply Image Logic (Passing unique references)
    applyBirdImageData(card, imageContainer, imageEl, bird);

    card.addEventListener('click', (e) => {
        if (!e.target.closest('.image-verify-overlay')) {
            const birdSightings = mySightings.filter(s => s.species === bird.CommonName);
            showSightingModal(birdData.CommonName, birdData, sightingsData.sightings);
        }
    });

    card.style.cursor = 'pointer';
    listContainer.appendChild(card);
});

    // Admin check once the loop is done
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
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
        return { url: verifiedImageCache.get(commonName), isVerified: true };
    }

    try {
        const { data } = await supabaseClient
            .from('verified_images')
            .select('image_url')
            .eq('species', commonName)
            .maybeSingle();

        // 2. ONLY return isVerified: true if data actually exists in Supabase
        if (data && data.image_url) {
            verifiedImageCache.set(commonName, data.image_url);
            return { url: data.image_url, isVerified: true };
        }
    } catch (err) {
        console.warn("Storage check failed", err);
    }

    // 3. FALLBACK: If not in Supabase, fetch from iNaturalist and mark isVerified as FALSE
    const apiUrl = await getiNaturalistImage(commonName, latinName);
    return { url: apiUrl, isVerified: false }; // This line MUST say false
}

// Keep this helper too
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add a second cache just for "failed" birds so we stop pestering the API
const failedBirdsCache = new Set();

async function getiNaturalistImage(commonName, latinName, page = 1, retries = 3) {
    // 1. If we already tried this bird and it failed, don't try again this session
    if (failedBirdsCache.has(commonName) || verifiedImageCache.has(commonName)) {
        return verifiedImageCache.get(commonName) || null;
    }

    await sleep(300); // 0.3 second delay between every request

    const searchTerm = (latinName && latinName !== 'No Data') ? latinName : commonName;
    
    // Using a different endpoint (taxon_id search) often bypasses the strict CORS throttle
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&iconic_taxa=Aves&rank=species&per_page=1`;

    try {
        const resp = await fetch(url);

        if (resp.status === 429 && retries > 0) {
            await sleep(2000); 
            return getiNaturalistImage(commonName, latinName, page, retries - 1);
        }

        // If the API blocks us (CORS), it usually returns no status or 0
        if (!resp.ok) throw new Error('CORS or Network Block');

        const data = await resp.json();
        const photoUrl = data.results[0]?.default_photo?.medium_url || null;
        
        if (photoUrl) {
            verifiedImageCache.set(commonName, photoUrl);
        } else {
            failedBirdsCache.add(commonName); // Mark as "no photo found"
        }
        
        return photoUrl;
    } catch (error) {
        // SILENT FAIL: We stop logging the error to clear your console
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
            
            const { error } = await supabaseClient
                .from('verified_images')
                .upsert({ species: birdData.CommonName, image_url: imageEl.src });
            
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
                const { data: uploadData, error: uploadError } = await supabaseClient
                    .storage
                    .from('bird-images')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabaseClient
                    .storage
                    .from('bird-images')
                    .getPublicUrl(fileName);

                const { error: dbError } = await supabaseClient
                    .from('verified_images')
                    .upsert({ species: birdData.CommonName, image_url: urlData.publicUrl });

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

function addSightingEntry() {
    // Check current count
    const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');
    
    // 1. STOP if at 20
    if (entryGroups.length >= 20) {
        alert("Maximum of 20 birds per submission reached.");
        return;
    }

    const template = document.getElementById('sighting-template');
    if (!template) return;
    const entryClone = template.content.cloneNode(true);
    const newEntry = entryClone.querySelector('.sighting-entry-group');
    
    // 2. Setup Remove Button
    newEntry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        newEntry.remove();
        // Always keep at least one row
        if (entriesContainer.querySelectorAll('.sighting-entry-group').length === 0) {
            addSightingEntry();
        }
        
        // 3. Re-enable "Add" styling
        if (addEntryBtn) {
            addEntryBtn.style.opacity = '1';
            addEntryBtn.style.cursor = 'pointer';
        }
    });

    entriesContainer.appendChild(newEntry);

    // 4. Disable "Add" styling visually if we just hit 20
    if (entriesContainer.querySelectorAll('.sighting-entry-group').length === 20) {
        if (addEntryBtn) {
            addEntryBtn.style.opacity = '0.5';
            addEntryBtn.style.cursor = 'not-allowed';
        }
    }
}
// Set default date to today
const dateInput = document.getElementById('sighting-date');
if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
}

// Ensure the button is actually listening
if (addEntryBtn) {
    addEntryBtn.onclick = addSightingEntry;
}

if (sightingForm) {
    sightingForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const date = document.getElementById('sighting-date').value;
        const location = document.getElementById('location').value.trim();
        
        // Use the existing entriesContainer variable
        const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');

        if (!date || !location) {
            alert("Please enter both a Date and a Location.");
            return;
        }

        // 1. Prepare Progress Bar
        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        
        if (progressContainer) progressContainer.style.display = 'block';
        let savedCount = 0;
        const totalToSave = entryGroups.length;

        try {
            // 2. Save Location
            await saveNewLocation(location);
            
            // 3. The Save Loop (The part that actually talks to the database)
            for (const group of entryGroups) {
                const speciesInput = group.querySelector('.species-input');
                const species = speciesInput?.value.trim();
                
                if (species && isSpeciesValid(species)) {
                    // This sends the data to Supabase
                    await saveSighting({ species, date, location });
                    savedCount++;
                    
                    // Update progress bar
                    if (progressBar && progressText) {
                        const percent = (savedCount / totalToSave) * 100;
                        progressBar.style.width = percent + "%";
                        progressText.textContent = `${savedCount} / ${totalToSave}`;
                    }
                }
            }

            // 4. Selective Reset (Keeps Date/Location)
            alert(`Successfully recorded ${savedCount} sightings!`);
            
            // Clear bird names
            const speciesInputs = entriesContainer.querySelectorAll('.species-input');
            speciesInputs.forEach(input => input.value = ''); 

            // Remove extra rows, leave only the first one
            const allRows = entriesContainer.querySelectorAll('.sighting-entry-group');
            for (let i = 1; i < allRows.length; i++) {
                allRows[i].remove();
            }

            // Reset UI states
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressBar) progressBar.style.width = "0%";
            if (addEntryBtn) {
                addEntryBtn.style.opacity = '1';
                addEntryBtn.style.cursor = 'pointer';
            }

            updateAllDisplays();

        } catch (error) {
            console.error("Upload failed:", error);
            alert("There was an error saving your sightings. Check the console for details.");
        }
    });
}
// ============================================
// I. STATISTICS & CHARTS
// ============================================

function calculateAndDisplayStats() {
    const sightingsToUse = getFilteredSightings(); // Respects Lifetime vs Annual toggle
    const seenSpeciesNames = new Set(sightingsToUse.map(s => s.species));
    const totalSeenCount = seenSpeciesNames.size;
    const totalPossible = allUKBirds.length;

    // 1. Update Basic Text Stats
    const totalSpeciesEl = document.getElementById('total-species');
    if (totalSpeciesEl) totalSpeciesEl.textContent = totalSeenCount;

    const percentageSeenEl = document.getElementById('percentage-seen');
    if (percentageSeenEl) {
        const percentage = totalPossible > 0 ? (totalSeenCount / totalPossible) * 100 : 0;
        percentageSeenEl.textContent = percentage.toFixed(2) + '%';
    }

    // 2. Percentage Excluding Megas
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

    // 3. ID Card Rank & Progress Logic
    // 3. ID Card Rank & Progress Logic
    const ranks = [
        { name: "Passerine", level: "1", threshold: 0, color: "#8c2e1b" },    // Earthy Red
        { name: "Corvid", level: "2", threshold: 10, color: "#5d544b" },      // Slate Grey
        { name: "Charadriiform", level: "3", threshold: 50, color: "#416863" }, // Deep Teal
        { name: "Falconiform", level: "4", threshold: 150, color: "#2c2621" },  // Iron Black
        { name: "Aquiline", level: "5", threshold: 300, color: "#d4af37" }    // Gold
    ];

    let currentRank = ranks[0];
    let nextRank = ranks[1];

    for (let i = 0; i < ranks.length; i++) {
        if (totalSeenCount >= ranks[i].threshold) {
            currentRank = ranks[i];
            nextRank = ranks[i + 1] || ranks[i]; 
        }
    }

    // Update the Rank Title (next to name)
    const rankTitleElement = document.querySelector('.id-rank-title');
    if (rankTitleElement) rankTitleElement.textContent = currentRank.name;

    // --- NEW STAMP UPDATE LOGIC ---
    const waxSeal = document.querySelector('.rank-stamp-seal');
    const sealText = document.querySelector('.seal-inner-text');
    
    if (waxSeal && sealText) {
        waxSeal.style.backgroundColor = currentRank.color;
        sealText.textContent = `LVL ${currentRank.level}`; // Changes from UK to LVL 1, 2, etc.
    }
    const progressBar = document.getElementById('level-progress-bar');
    const nextLevelName = document.getElementById('next-level-name');
    const currentDisplay = document.getElementById('current-count-display');
    const targetDisplay = document.getElementById('target-count-display');

    if (progressBar && nextLevelName) {
        let progressPercent = 0;
        if (currentRank.name === "Grand Archivist") {
            progressPercent = 100;
            nextLevelName.textContent = "Ultimate Rank Achieved";
        } else {
            // This math gives you that 52% look for 158/300
            progressPercent = Math.min((totalSeenCount / nextRank.threshold) * 100, 100);
            nextLevelName.textContent = `Next: ${nextRank.name}`;
        }

        progressBar.style.width = `${progressPercent}%`;
        if (currentDisplay) currentDisplay.textContent = totalSeenCount;
        if (targetDisplay) targetDisplay.textContent = nextRank.threshold;
    }

    // 4. Update Other UI Elements
    calculateMilestones(); 
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

    const milestones = [
        { name: 'Life List', current: uniqueSpeciesCount, tiers: [100, 200, 400], unit: 'species' },
        { name: 'Journalist', current: totalSightings, tiers: [500, 1500, 3000], unit: 'logs' },
        { name: 'Specialist', current: maxAtOneLoc, tiers: [50, 150, 300], unit: 'at one location' },
        { name: 'Mega Finder', current: megaCount, tiers: [5, 10, 20], unit: 'megas' }
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

let birdChart = null; 

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
            // SortKey: "2025-01" (Reliable for alphabetical sorting of chronological dates)
            const sortKey = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, '0');
            // DisplayLabel: "Jan 2025"
            const label = date.toLocaleString('default', { month: 'short', year: 'numeric' });
            
            if (!monthCounts[sortKey]) {
                monthCounts[sortKey] = { count: 0, label: label };
            }
            monthCounts[sortKey].count++;
        });

        // Sort keys chronologically (e.g., 2024-12 before 2025-01)
        const sortedKeys = Object.keys(monthCounts).sort();
        
        // Map data in the sorted order
        labels = sortedKeys.map(key => monthCounts[key].label);
        data = sortedKeys.map(key => monthCounts[key].count);
    }

    // 2. Destroy old chart instance if it exists
    if (birdChart) { birdChart.destroy(); }

    // 3. Create the Chart
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
                    ticks: { stepSize: 1, font: { family: 'Courier New' } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    ticks: { 
                        font: { family: 'Courier New', size: 10 },
                        autoSkip: true, // Prevents overlapping labels on narrow mobile screens
                        maxRotation: 45
                    },
                    grid: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}
// --- UPDATED AUTHENTICATION LOGIC ---

function getExpeditionData(date, location) {
    // Filter sightings for this specific trip
    const tripSightings = mySightings.filter(s => s.date === date && s.location === location);
    
    if (tripSightings.length === 0) return null;

    // Find the rarest bird in this group
    // We look up each bird in allUKBirds to get its Rarity rank
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

// 1. SIGN UP
async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    if (!email || !password) return alert("Please enter both email and password.");

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) alert("Error: " + error.message);
    else alert("Success! Check your email for a confirmation link.");
}
function displayExpeditionCard(tripData) {
    if (!tripData) return;

    // Update Header & Seal
    document.getElementById('expedition-date').textContent = new Date(tripData.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
                    tripsMap.set(key, { date: s.date, location: s.location });
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

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
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
    if (e.target.id === 'login-btn') { e.preventDefault(); handleLogin(); }
    if (e.target.id === 'signup-btn') { e.preventDefault(); handleSignUp(); }
    if (e.target.id === 'logout-btn') { e.preventDefault(); handleLogout(); }

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
                formStatus.style.color = '#416863'; // Naturalist Green
                formStatus.textContent = "Thank you. The report has been filed.";
                helpForm.reset();
                // Close popup after a short delay
                setTimeout(() => { bugPopup.style.display = 'none'; }, 2000);
            } else {
                throw new Error("Failed to send");
            }
        } catch (error) {
            formStatus.style.display = 'block';
            formStatus.style.color = '#682d1f'; // Wax Seal Red
            formStatus.textContent = "Submission failed. Please try again.";
        }
    });
}
// Attach Event Listeners
document.getElementById('signup-btn').addEventListener('click', handleSignUp);
document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);
// Start the app
loadUKBirds();

// 1. Setup the Search Bar Listener
setupSearchBar(); 

// 2. Setup the Database Rarity Filter Listener
const rarityFilter = document.getElementById('rarity-filter');
if (rarityFilter) {
    rarityFilter.addEventListener('change', filterAndDisplayBirds);
}

// 3. Setup the Summary Filter (The global window function you already have)
window.handleSummaryFilterChange = function(value) {
    currentSummaryRarityFilter = value;
    displaySeenBirdsSummary();
};
// --- EXPEDITION HUB LINKING ---

// Call the Search Setup
setupExpeditionSearch();
document.addEventListener('click', function(e) {
    // --- 1. Open Bird Details & Fetch Song ---
    const birdCard = e.target.closest('.bird-card');
    if (birdCard) {
        // Only trigger if we aren't clicking the verify buttons
        if (!e.target.closest('.image-verify-overlay')) {
            const nameEl = birdCard.querySelector('.card-common-name');
            if (nameEl) {
                const speciesName = nameEl.textContent;
                const bird = allUKBirds.find(b => b.CommonName === speciesName);
                
                if (bird) {
                    // Use 'bird' here because that's what you defined above
                    showSightingModal(bird.CommonName, bird, []); 
                    fetchBirdSong(bird.LatinName, bird.CommonName);
                }
            }
        }
    }

    // --- 2. Stop Audio when Closing Modal ---
    if (e.target.classList.contains('modal-close') || e.target.id === 'sighting-modal') {
        const audioPlayer = document.getElementById('bird-audio-player');
        const gramophoneBtn = document.getElementById('gramophone-btn');
        
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = ""; 
            if (gramophoneBtn) gramophoneBtn.classList.remove('playing');
            
            if (typeof animationId !== 'undefined') {
                cancelAnimationFrame(animationId);
            }
        }
    }
}); // <--- THIS was the missing '}' that caused the error!

// Initialize the gramophone listeners
setupAudioPlayer();
