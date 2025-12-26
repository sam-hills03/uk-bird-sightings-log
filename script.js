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
        await loadLocations(); 
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
        let allSightings = [];
        let from = 0;
        const batchSize = 1000;
        let hasMore = true;
        
        // Fetch in batches until we get everything
        while (hasMore) {
            const { data, error } = await supabaseClient
                .from('sightings')
                .select('*')
                .order('created_at', { ascending: false })
                .range(from, from + batchSize - 1);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                allSightings = allSightings.concat(data);
                from += batchSize;
                
                if (data.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }
        
        mySightings = allSightings;
        console.log("Loaded", mySightings.length, "sightings");
        updateAllDisplays();
    } catch (error) {
        console.error("Error loading sightings:", error);
    }
}

async function saveSighting(sighting) {
    try {
        const { data, error } = await supabaseClient
            .from('sightings')
            .insert([{
                species: sighting.species,
                date: sighting.date,
                location: sighting.location
            }])
            .select();
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            mySightings.unshift(data[0]);
            updateAllDisplays();
        }
        
        return true;
    } catch (error) {
        console.error("Error saving sighting:", error);
        return false;
    }
}

async function deleteSightingFromDB(idToDelete) {
    try {
        const { error } = await supabaseClient
            .from('sightings')
            .delete()
            .eq('id', idToDelete);
        
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

function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(targetTabId) {
        tabContents.forEach(content => content.classList.remove('active-content'));
        tabButtons.forEach(button => button.classList.remove('active'));

        const targetContent = document.getElementById(targetTabId);
        if (targetContent) {
            targetContent.classList.add('active-content');
            const activeTabButton = document.querySelector(`.tab-button[data-tab="${targetTabId}"]`);
            if (activeTabButton) activeTabButton.classList.add('active');
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.getAttribute('data-tab'));
        });
    });

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

        const imageEl = card.querySelector('.card-image');
        const imageContainer = card.querySelector('.card-image-container');
        const placeholderDiv = document.createElement('div');
        placeholderDiv.classList.add('image-placeholder');
        placeholderDiv.textContent = 'Loading...';
        imageContainer.appendChild(placeholderDiv);
        
        getiNaturalistImage(birdData.CommonName, birdData.LatinName).then(imageUrl => {
            if (imageUrl) {
                imageEl.src = imageUrl;
                imageEl.onload = () => placeholderDiv.remove();
            } else {
                imageEl.style.display = 'none';
                placeholderDiv.textContent = 'No Image';
            }
        });
        
        card.addEventListener('click', () => showSightingModal(species, birdData, sightingsData.sightings));
        card.style.cursor = 'pointer';
        summaryContainer.appendChild(card);
    });
}

function showSightingModal(species, birdData, sightings) {
    const modal = document.getElementById('sighting-modal');
    document.getElementById('modal-species-name').textContent = species;
    document.getElementById('modal-species-info').textContent = `${birdData.LatinName || ''} • ${birdData.Rarity || ''}`;
    
    const modalList = document.getElementById('modal-sightings-list');
    modalList.innerHTML = '';
    
    sightings.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sighting => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${new Date(sighting.date).toLocaleDateString()}</span> - <span>${sighting.location}</span>`;
        modalList.appendChild(li);
    });
    
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
        const { data, error } = await supabaseClient
            .from('saved_locations')
            .select('location')
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
        const { error } = await supabaseClient
            .from('saved_locations')
            .insert([{ location: location }]);
        
        if (!error) {
            savedLocations.push(location);
            populateLocationDatalist();
        }
    } catch (error) {
        console.error("Error saving location:", error);
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
    const filterValue = document.getElementById('rarity-filter').value;
    const listContainer = document.getElementById('bird-list');
    if (!listContainer) return;
    listContainer.innerHTML = ''; 

    let filteredBirds = filterValue === 'All' ? allUKBirds : allUKBirds.filter(b => b.Rarity === filterValue);
    
    if (currentSearchQuery.trim() !== '') {
        const q = currentSearchQuery.toLowerCase();
        filteredBirds = filteredBirds.filter(b => 
            b.CommonName.toLowerCase().includes(q) || (b.LatinName || '').toLowerCase().includes(q)
        );
    }
    
    const seenSpecies = getUniqueSeenSpecies();
    const cardTemplate = document.getElementById('bird-card-template');

    filteredBirds.forEach(bird => {
        const cardClone = cardTemplate.content.cloneNode(true);
        const card = cardClone.querySelector('.bird-card');
        if (seenSpecies.has(bird.CommonName)) card.classList.add('seen');

        card.querySelector('.card-common-name').textContent = bird.CommonName;
        card.querySelector('.card-rarity-tag').textContent = bird.Rarity;
        card.querySelector('.card-rarity-tag').classList.add(`rarity-${bird.Rarity}`);

        const imageEl = card.querySelector('.card-image');
        getiNaturalistImage(bird.CommonName, bird.LatinName).then(url => {
            if (url) imageEl.src = url;
            else imageEl.style.display = 'none';
        });

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

async function getiNaturalistImage(commonName, latinName) {
    const searchTerm = latinName !== 'No Data' ? latinName : commonName;
    try {
        const resp = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&iconic_taxa=Aves&rank=species&per_page=1`);
        const data = await resp.json();
        return data.results[0]?.default_photo?.medium_url || null;
    } catch { return null; }
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
        const date = document.getElementById('sighting-date').value;
        const location = document.getElementById('location').value.trim();
        
        if (!date || !location) {
            alert("Please enter both a Date and a Location.");
            return;
        }

        await saveNewLocation(location);
        const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');
        
        for (const group of entryGroups) {
            const speciesInput = group.querySelector('.species-input');
            const species = speciesInput?.value.trim();
            
            if (species && isSpeciesValid(species)) {
                await saveSighting({ species, date, location });
            }
        }
        
        alert("Sightings recorded successfully!");
        sightingForm.reset();
        entriesContainer.innerHTML = '';
        addSightingEntry();
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
        type: 'bar',
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
// Start the app
loadUKBirds();
document.getElementById('rarity-filter').addEventListener('change', filterAndDisplayBirds);
