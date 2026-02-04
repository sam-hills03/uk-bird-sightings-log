const SUPABASE_URL = 'https://vpfoyxvkkttzlitfajgf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZm95eHZra3R0emxpdGZhamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NDAxMTQsImV4cCI6MjA3NjUxNjExNH0._vyK8s2gXPSu18UqEEWujLU2tAqNZEh3mNwVQcbskxA';

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

const entriesContainer = document.getElementById('entries-container');
const addEntryBtn = document.getElementById('add-entry-btn');
const sightingForm = document.getElementById('sighting-form');

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
            console.log("Loaded", allUKBirds.length, "UK birds");
        } else {
            console.error("uk_birds.json not found");
            document.getElementById('bird-list').innerHTML = 
                '<p style="color: red; padding: 20px;">Error: uk_birds.json file not found.</p>';
            return;
        }
        
        populateSpeciesDatalist(); 
        filterAndDisplayBirds();
        await loadSightings();
        await loads(); 
        addSightingEntry(); 
        setupTabSwitching();
        setupPagination();
        setupSummaryFilter();
        setupSearchBar();
        setupModal();
    } catch (error) {
        console.error("Failed to load UK bird list:", error);
    }
}

async function loadSightings() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        // If no user is logged in, clear the list and exit
        if (!user) {
            mySightings = [];
            updateAllDisplays();
            return;
        }

        const { data, error } = await supabaseClient
            .from('sightings')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        mySightings = data || [];
        console.log("Loaded", mySightings.length, "sightings for user:", user.email);
        updateAllDisplays();
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
}s

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

// ============================================
// D. SUMMARY & MODALS
// ============================================

function setupSummaryFilter() {
    const filter = document.getElementById('summary-rarity-filter');
    if (filter) {
        filter.addEventListener('change', (e) => {
            currentSummaryRarityFilter = e.target.value;
            displaySeenBirdsSummary();
        });
    }
}

function displaySeenBirdsSummary() {
    const summaryContainer = document.getElementById('seen-birds-summary');
    if (!summaryContainer) return;
    
    summaryContainer.innerHTML = '';
    const speciesMap = new Map();
    const validSightings = mySightings.filter(sighting => isSpeciesValid(sighting.species)); 

    validSightings.forEach(sighting => {
        const species = sighting.species;
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

    let filteredSpecies = Array.from(speciesMap.keys());
    
    if (currentSummaryRarityFilter !== 'All') {
        filteredSpecies = filteredSpecies.filter(species => {
            const birdData = allUKBirds.find(b => b.CommonName === species);
            return birdData && birdData.Rarity === currentSummaryRarityFilter;
        });
    }
    
    if (filteredSpecies.length === 0) {
        summaryContainer.innerHTML = `<p style="padding: 20px; text-align: center;">No birds seen with rarity: ${currentSummaryRarityFilter}</p>`;
        return;
    }

    const cardTemplate = document.getElementById('bird-card-template');
    
    filteredSpecies.forEach(species => {
        const birdData = allUKBirds.find(b => b.CommonName === species);
        if (!birdData) return;
        
        const sightingsData = speciesMap.get(species);
        const sightingCount = sightingsData.sightings.length;
        const cardClone = cardTemplate.content.cloneNode(true);
        const card = cardClone.querySelector('.bird-card');
        
        card.classList.add('seen');
        
        const badge = document.createElement('div');
        badge.classList.add('seen-badge');
        badge.textContent = '✓'; 
        card.appendChild(badge);
        
        const countBadge = document.createElement('div');
        countBadge.classList.add('sighting-count-badge');
        countBadge.textContent = sightingCount;
        card.appendChild(countBadge);

        card.querySelector('.card-common-name').textContent = birdData.CommonName;
        card.querySelector('.card-latin-name').textContent = birdData.LatinName !== 'No Data' ? birdData.LatinName : '';
        card.querySelector('.card-status-text').textContent = `Seen ${sightingCount} time${sightingCount === 1 ? '' : 's'}`;

        const rarityTagEl = card.querySelector('.card-rarity-tag');
        rarityTagEl.textContent = birdData.Rarity;
        rarityTagEl.classList.add(`rarity-${birdData.Rarity}`);

        // --- UPDATED IMAGE LOGIC ---
        const imageEl = card.querySelector('.card-image');
        const imageContainer = card.querySelector('.card-image-container');
        const placeholderDiv = document.createElement('div');
        placeholderDiv.classList.add('image-placeholder');
        placeholderDiv.textContent = 'Loading...';
        imageContainer.appendChild(placeholderDiv);
        
        // This goes inside your display loop
getBirdImage(birdData.CommonName, birdData.LatinName).then(result => {
    if (result.url) {
        imageEl.src = result.url;
        
        // If result.isVerified is true, add the UI indicator
        if (result.isVerified) {
            const imageContainer = card.querySelector('.card-image-container');
            
            // Add a badge so you know it's verified
            const badge = document.createElement('div');
            badge.className = 'verified-check-badge';
            badge.innerHTML = '  Verified';
            imageContainer.appendChild(badge);
            
            // Hide the "Keep" button since it's already done
            const keepBtn = card.querySelector('.keep-btn');
            if (keepBtn) keepBtn.style.display = 'none';
            
            card.classList.add('verified-card');
        }

        handleImageVerification(card, birdData);
    }
});
        
        // Modal trigger remains the same, but we prevent it 
        // if clicking the verification buttons
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.image-verify-overlay')) {
                showSightingModal(species, birdData, sightingsData.sightings);
            }
        });
        
        card.style.cursor = 'pointer';
        summaryContainer.appendChild(card);
    });
}
async function showSightingModal(species, birdData, sightings) {
    const modal = document.getElementById('sighting-modal');
    
    // Set Names
    document.getElementById('modal-species-name').textContent = species;
    document.getElementById('modal-species-info').textContent = `${birdData.LatinName || ''} • ${birdData.Rarity || ''}`;
    
    // 1. CLEAR & FETCH FIELD NOTES
    const descriptionBox = document.getElementById('modal-description-text');
    descriptionBox.textContent = "Consulting the archives...";
    const description = await fetchBirdDescription(species);
    descriptionBox.textContent = description;
    
    // 2. BUILD SIGHTINGS LIST
    const modalList = document.getElementById('modal-sightings-list');
    modalList.innerHTML = '';
    
    if (sightings && sightings.length > 0) {
        sightings.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sighting => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${new Date(sighting.date).toLocaleDateString()}</span> - <span>${sighting.location}</span>`;
            modalList.appendChild(li);
        });
    } else {
        modalList.innerHTML = '<li style="border:none; background:none; font-style:italic;">No personal sightings recorded yet.</li>';
    }
    
    modal.style.display = 'block';
}

function setupModal() {
    const modal = document.getElementById('sighting-modal');
    const closeBtn = document.querySelector('.modal-close');
    if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => { if (event.target === modal) modal.style.display = 'none'; };
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
// F. BIRD LIST & SEARCH
// ============================================

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

function filterAndDisplayBirds() {
    const filterValue = document.getElementById('rarity-filter')?.value || 'All';
    const listContainer = document.getElementById('bird-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; 

    // 1. Filter the list
    let filteredBirds = filterValue === 'All' ? allUKBirds : allUKBirds.filter(b => b.Rarity === filterValue);
    
    if (currentSearchQuery.trim() !== '') {
        const q = currentSearchQuery.toLowerCase();
        filteredBirds = filteredBirds.filter(b => 
            b.CommonName.toLowerCase().includes(q) || (b.LatinName || '').toLowerCase().includes(q)
        );
    }
    
    const seenSpecies = getUniqueSeenSpecies();
    const cardTemplate = document.getElementById('bird-card-template');

    // 2. Build the cards
    filteredBirds.forEach(bird => {
        const cardClone = cardTemplate.content.cloneNode(true);
        const card = cardClone.querySelector('.bird-card');
        const imageContainer = card.querySelector('.card-image-container');
        const imageEl = card.querySelector('.card-image');

        // Mark as seen if in your sightings
        if (seenSpecies.has(bird.CommonName)) card.classList.add('seen');

        // Set Text Data
        card.querySelector('.card-common-name').textContent = bird.CommonName;
        const rarityTag = card.querySelector('.card-rarity-tag');
        rarityTag.textContent = bird.Rarity;
        rarityTag.className = `card-rarity-tag rarity-${bird.Rarity}`;

        // Handle Images (Check Cache/Supabase first)
        getBirdImage(bird.CommonName, bird.LatinName).then(result => {
            if (result && result.url) {
                imageEl.src = result.url;
                
                // Add Verified Checkmark if saved in DB
                if (result.isVerified) {
                    card.classList.add('verified-card');
                    const vBadge = document.createElement('div');
                    vBadge.className = 'verified-check-badge';
                    vBadge.innerHTML = '  Verified';
                    imageContainer.appendChild(vBadge);
                    
                    const keepBtn = card.querySelector('.keep-btn');
                    if (keepBtn) keepBtn.style.display = 'none';
                }

                // Initialize the pencil menu logic
                handleImageVerification(card, bird);
            } else {
                imageEl.style.display = 'none';
            }
        });
// Add click listener to open the info modal
card.addEventListener('click', (e) => {
    // Only open if you didn't click the "Pencil" icon or its menu
    if (!e.target.closest('.image-verify-overlay')) {
        const birdSightings = mySightings.filter(s => s.species === bird.CommonName);
        showSightingModal(bird.CommonName, bird, birdSightings);
    }
});

card.style.cursor = 'pointer'; // Show hand icon on hover
        listContainer.appendChild(card);
    });
}

function setupSearchBar() {
    const searchBar = document.getElementById('search-bar');
    if (!searchBar) return;
    let timeout;
    searchBar.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            currentSearchQuery = e.target.value;
            filterAndDisplayBirds();
        }, 300);
    });
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

async function getBirdImage(commonName, latinName) {
    // Check local cache
    if (verifiedImageCache.has(commonName)) {
        return { url: verifiedImageCache.get(commonName), isVerified: true };
    }

    try {
        const { data } = await supabaseClient
            .from('verified_images')
            .select('image_url')
            .eq('species', commonName)
            .maybeSingle();

        if (data && data.image_url) {
            verifiedImageCache.set(commonName, data.image_url);
            return { url: data.image_url, isVerified: true };
        }
    } catch (err) {
        console.warn("Storage check failed", err);
    }

    // Fallback to API
    const apiUrl = await getiNaturalistImage(commonName, latinName);
    return { url: apiUrl, isVerified: false };
}

async function getiNaturalistImage(commonName, latinName, page = 1) {
    // If Latin Name is missing or "No Data", use Common Name
    const searchTerm = (latinName && latinName !== 'No Data') ? latinName : commonName;
    
    try {
        const resp = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&iconic_taxa=Aves&rank=species&per_page=1&page=${page}`);
        const data = await resp.json();
        return data.results[0]?.default_photo?.medium_url || null;
    } catch (error) {
        console.error("iNaturalist fetch failed:", error);
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

// ============================================
// H. FORM SUBMISSION
// ============================================

function addSightingEntry() {
    const template = document.getElementById('sighting-template');
    if (!template) return;
    const entryClone = template.content.cloneNode(true);
    const newEntry = entryClone.querySelector('.sighting-entry-group');
    
    newEntry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        newEntry.remove();
        if (entriesContainer.children.length === 0) addSightingEntry();
    });
    entriesContainer.appendChild(newEntry);
}

if (addEntryBtn) addEntryBtn.addEventListener('click', addSightingEntry);

if (sightingForm) {
    sightingForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        // 1. Grab the values we want to keep
        const date = document.getElementById('sighting-date').value;
        const location = document.getElementById('location').value.trim();
        
        if (!date || !location) {
            alert("Please enter both a Date and a Location.");
            return;
        }

        // 2. Save the location to your history
        await saveNewLocation(location);
        
        // 3. Process the birds
        const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');
        let savedCount = 0;

        for (const group of entryGroups) {
            const speciesInput = group.querySelector('.species-input');
            const species = speciesInput?.value.trim();
            
            if (species && isSpeciesValid(species)) {
                await saveSighting({ species, date, location });
                savedCount++;
            }
        }
        
        if (savedCount > 0) {
            alert(`Successfully recorded ${savedCount} sighting(s)!`);
            
            // --- THE CHANGE IS HERE ---
            // Instead of sightingForm.reset(), we only clear the birds:
            entriesContainer.innerHTML = ''; // Remove all current bird rows
            addSightingEntry();              // Add one fresh, empty bird row
            
            // Note: The 'date' and 'location' inputs are NOT cleared, 
            // so they stay ready for your next entry.
        } else {
            alert("No valid bird names were entered.");
        }
    });
}
// ============================================
// I. STATISTICS & CHARTS
// ============================================

function calculateAndDisplayStats() {
    if (allUKBirds.length === 0) return;

    const seenSpecies = getUniqueSeenSpecies();
    const totalSeenCount = seenSpecies.size;
    
    // 1. Update Total Unique Species Count
    const totalSpeciesEl = document.getElementById('total-species');
    if (totalSpeciesEl) totalSpeciesEl.textContent = totalSeenCount;

    // 2. Calculate Percentage of UK List Seen
    const totalUKSpeciesCount = allUKBirds.length;
    const percentage = (totalSeenCount / totalUKSpeciesCount) * 100;
    const percentageSeenEl = document.getElementById('percentage-seen');
    if (percentageSeenEl) percentageSeenEl.textContent = percentage.toFixed(2) + '%';

    // 3. Calculate Percentage Excluding Megas
    const nonMegaBirds = allUKBirds.filter(bird => bird.Rarity !== 'Mega');
    const nonMegaTotalCount = nonMegaBirds.length;
    
    const seenNonMegaCount = Array.from(seenSpecies).filter(speciesName => {
        const bird = allUKBirds.find(b => b.CommonName === speciesName);
        return bird && bird.Rarity !== 'Mega';
    }).length;

    const percentageNoMega = (seenNonMegaCount / nonMegaTotalCount) * 100;
    const percentageNoMegaEl = document.getElementById('percentage-no-mega');
    if (percentageNoMegaEl) percentageNoMegaEl.textContent = percentageNoMega.toFixed(2) + '%';
}

let birdChart = null; // Global variable to track the chart instance

function createMonthlyChart() {
    const ctx = document.getElementById('monthly-chart');
    if (!ctx || mySightings.length === 0) return;

    // Process data: Group sightings by Month-Year
    const monthCounts = {};
    
    mySightings.forEach(sighting => {
        const date = new Date(sighting.date);
        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        monthCounts[monthYear] = (monthCounts[monthYear] || 0) + 1;
    });

    // Sort the months chronologically
    const sortedLabels = Object.keys(monthCounts).sort((a, b) => new Date(a) - new Date(b));
    const sortedData = sortedLabels.map(label => monthCounts[label]);

    // If a chart already exists, destroy it before creating a new one (prevents overlap)
    if (birdChart) {
        birdChart.destroy();
    }

    // Create the bar chart using Chart.js
    birdChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedLabels,
            datasets: [{
                label: 'Sightings',
                data: sortedData,
                backgroundColor: 'rgba(45, 66, 45, 0.6)',
                borderColor: 'rgba(45, 66, 45, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}
// Function to get a summary from Wikipedia
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
// --- UPDATED AUTHENTICATION LOGIC ---

// 1. SIGN UP
async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    if (!email || !password) return alert("Please enter both email and password.");

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    
    if (error) alert("Error: " + error.message);
    else alert("Success! Check your email for a confirmation link.");
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
        
        // CRITICAL: Load user-specific data now that we have a session
        loadSightings(); 
        loadLocations();
    } else {
        // User is GUEST
        if (loggedOutView) loggedOutView.style.display = 'block';
        if (loggedInView) loggedInView.style.display = 'none';
        
        // Clear personal data so the Guest doesn't see the previous user's birds
        mySightings = [];
        savedLocations = [];
        updateAllDisplays();
    }
});

// Attach Event Listeners
document.getElementById('signup-btn').addEventListener('click', handleSignUp);
document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);
// Start the app
loadUKBirds();
document.getElementById('rarity-filter').addEventListener('change', filterAndDisplayBirds);
