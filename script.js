// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'YOUR_PROJECT_URL_HERE';
const SUPABASE_KEY = 'YOUR_ANON_KEY_HERE';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    } catch (error) {
        console.error("Failed to load UK bird list:", error);
    }
}

async function loadSightings() {
    try {
        const { data, error } = await supabase
            .from('sightings')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        mySightings = data || [];
        console.log("Loaded", mySightings.length, "sightings");
        updateAllDisplays();
    } catch (error) {
        console.error("Error loading sightings:", error);
    }
}

async function saveSighting(sighting) {
    try {
        const { data, error } = await supabase
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
        const { error } = await supabase
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
        tabContents.forEach(content => {
            content.classList.remove('active-content');
        });
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        const targetContent = document.getElementById(targetTabId);
        if (targetContent) {
            targetContent.classList.add('active-content');
            
            const activeTabButton = document.querySelector(`.tab-button[data-tab="${targetTabId}"]`);
            if (activeTabButton) {
                activeTabButton.classList.add('active');
            }
        }
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTabId = button.getAttribute('data-tab');
            switchTab(targetTabId);
        });
    });

    switchTab('database-view');
}

// ============================================
// C. PAGINATION FOR RAW CHECKLIST
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
    
    console.log("Pagination setup complete");
}

function changePage(direction) {
    const totalPages = Math.ceil(mySightings.length / ITEMS_PER_PAGE);
    const newPage = currentPage + direction;
    
    // Validate page bounds
    if (newPage < 1 || newPage > totalPages) {
        console.log("Invalid page:", newPage);
        return;
    }
    
    currentPage = newPage;
    console.log("Changed to page", currentPage);
    displaySightings();
    
    // Scroll to top of checklist
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

    // Calculate pagination
    const totalPages = Math.ceil(mySightings.length / ITEMS_PER_PAGE);
    
    // Ensure current page is valid
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }
    if (currentPage < 1) {
        currentPage = 1;
    }
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, mySightings.length);
    
    console.log(`Displaying page ${currentPage} of ${totalPages} (items ${startIndex}-${endIndex})`);
    
    // Get the sightings for current page
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
    
    // Enable/disable buttons
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
    
    console.log(`Pagination: page ${currentPage}/${totalPages}, prev disabled: ${isFirstPage}, next disabled: ${isLastPage}`);
}

// ============================================
// D. SUMMARY RARITY FILTER
// ============================================

function setupSummaryFilter() {
    const filter = document.getElementById('summary-rarity-filter');
    if (filter) {
        filter.addEventListener('change', (e) => {
            currentSummaryRarityFilter = e.target.value;
            console.log("Summary filter changed to:", currentSummaryRarityFilter);
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
            speciesMap.set(species, { 
                sightings: [sighting] 
            });
        }
    });

    if (speciesMap.size === 0) {
        summaryContainer.innerHTML = 'No unique birds seen yet.';
        return;
    }

    // Filter by rarity if needed
    let filteredSpecies = Array.from(speciesMap.keys());
    
    console.log("Filtering species by rarity:", currentSummaryRarityFilter);
    console.log("Total species before filter:", filteredSpecies.length);
    
    if (currentSummaryRarityFilter !== 'All') {
        filteredSpecies = filteredSpecies.filter(species => {
            const birdData = allUKBirds.find(b => b.CommonName === species);
            const matches = birdData && birdData.Rarity === currentSummaryRarityFilter;
            if (matches) {
                console.log(`  ${species} matches (${birdData.Rarity})`);
            }
            return matches;
        });
    }
    
    console.log("Species after filter:", filteredSpecies.length);
    
    if (filteredSpecies.length === 0) {
        summaryContainer.innerHTML = `<p>No birds seen with rarity: ${currentSummaryRarityFilter}</p>`;
        return;
    }

    filteredSpecies.forEach(species => {
        const data = speciesMap.get(species);
        const count = data.sightings.length;
        
        // Get bird rarity
        const birdData = allUKBirds.find(b => b.CommonName === species);
        const rarity = birdData ? birdData.Rarity : 'Unknown';
        
        const summaryItem = document.createElement('div');
        summaryItem.classList.add('summary-species-group');

        const heading = document.createElement('h3');
        heading.innerHTML = `
            <span class="species-name">${species}</span> 
            <span class="sighting-count">(${count} time${count === 1 ? '' : 's'} - ${rarity})</span>
        `;
        summaryItem.appendChild(heading);

        const detailList = document.createElement('ul');
        detailList.classList.add('sighting-details');

        const sortedSightings = data.sightings.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedSightings.forEach(sighting => {
            const detailLi = document.createElement('li');
            const dateObj = new Date(sighting.date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString();

            detailLi.textContent = `• Seen at ${sighting.location} on ${formattedDate}`;
            detailList.appendChild(detailLi);
        });

        summaryItem.appendChild(detailList);
        summaryContainer.appendChild(summaryItem);
    });
}

// ============================================
// E. LOCATION MANAGEMENT
// ============================================

async function loadLocations() {
    try {
        const { data, error } = await supabase
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
    if (!location || savedLocations.includes(location)) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('saved_locations')
            .insert([{ location: location }]);
        
        if (error) {
            if (!error.message.includes('duplicate')) {
                throw error;
            }
        } else {
            savedLocations.push(location);
            populateLocationDatalist();
        }
    } catch (error) {
        console.error("Error saving location:", error);
    }
}

function populateLocationDatalist() {
    const datalist = document.getElementById('location-datalist');
    datalist.innerHTML = '';
    savedLocations.forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        datalist.appendChild(option);
    });
}

// ============================================
// F. DYNAMIC FORM ENTRY FUNCTIONS
// ============================================

function populateSpeciesDatalist() {
    const datalist = document.getElementById('species-datalist');
    datalist.innerHTML = '';
    allUKBirds.forEach(bird => {
        const option = document.createElement('option');
        option.value = bird.CommonName; 
        datalist.appendChild(option);
    });
}

function addSightingEntry() {
    const template = document.getElementById('sighting-template');
    const entryClone = template.content.cloneNode(true);
    const newEntry = entryClone.querySelector('.sighting-entry-group');
    
    newEntry.querySelector('.remove-entry-btn').addEventListener('click', () => {
        newEntry.remove();
        if (entriesContainer.children.length === 0) {
            addSightingEntry();
        }
    });
    
    entriesContainer.appendChild(newEntry);
}

addEntryBtn.addEventListener('click', addSightingEntry);

// ============================================
// G. BIRD LIST & IMAGE FUNCTIONS
// ============================================

function getUniqueSeenSpecies() {
    const validSeenSpecies = mySightings
        .filter(s => isSpeciesValid(s.species))
        .map(s => s.species);
        
    return new Set(validSeenSpecies);
}

async function getiNaturalistImage(commonName, latinName) {
    const searchTerms = [latinName, commonName].filter(name => name && name.trim() !== 'No Data');
    
    for (const searchTerm of searchTerms) {
        try {
            const response = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&iconic_taxa=Aves&rank=species&per_page=1`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                
                if (searchTerm === latinName && result.name && result.name.toLowerCase() === latinName.toLowerCase() && result.default_photo && result.default_photo.medium_url) {
                    return result.default_photo.medium_url;
                }
                
                if (searchTerm === commonName && result.preferred_common_name && result.preferred_common_name.toLowerCase() === commonName.toLowerCase() && result.default_photo && result.default_photo.medium_url) {
                    return result.default_photo.medium_url;
                }
            }
        } catch (error) {
            console.error(`iNaturalist search failed for "${searchTerm}":`, error);
        }
    }
    return null;
}

function filterAndDisplayBirds() {
    const filterValue = document.getElementById('rarity-filter').value;
    const listContainer = document.getElementById('bird-list');
    listContainer.innerHTML = ''; 

    const filteredBirds = filterValue === 'All'
        ? allUKBirds
        : allUKBirds.filter(bird => bird.Rarity === filterValue); 
        
    const seenSpecies = getUniqueSeenSpecies();
    const cardTemplate = document.getElementById('bird-card-template');

    filteredBirds.forEach(bird => {
        const cardClone = cardTemplate.content.cloneNode(true);
        const card = cardClone.querySelector('.bird-card');
        const commonName = bird.CommonName;

        if (seenSpecies.has(commonName)) {
            card.classList.add('seen');
            
            const badge = document.createElement('div');
            badge.classList.add('seen-badge');
            badge.textContent = '✓'; 
            card.appendChild(badge);
        }

        const commonNameEl = card.querySelector('.card-common-name');
        const latinNameEl = card.querySelector('.card-latin-name');
        const rarityTagEl = card.querySelector('.card-rarity-tag');
        const statusTextEl = card.querySelector('.card-status-text');
        const imageEl = card.querySelector('.card-image');
        const imageContainer = card.querySelector('.card-image-container');

        commonNameEl.textContent = commonName;
        latinNameEl.textContent = bird.LatinName && bird.LatinName !== 'No Data' ? bird.LatinName : '';
        statusTextEl.textContent = bird.Status && bird.Status !== 'No Data' ? bird.Status : '';

        rarityTagEl.textContent = bird.Rarity;
        rarityTagEl.classList.add(`rarity-${bird.Rarity}`);

        imageEl.src = ''; 
        imageEl.alt = `${commonName} photo`;
        
        const placeholderDiv = document.createElement('div');
        placeholderDiv.classList.add('image-placeholder');
        placeholderDiv.textContent = 'Image not available';
        imageContainer.appendChild(placeholderDiv);
        
        getiNaturalistImage(commonName, bird.LatinName).then(imageUrl => {
            if (imageUrl) {
                imageEl.src = imageUrl;
                imageEl.onload = () => placeholderDiv.remove();
                imageEl.onerror = () => {
                    imageEl.style.display = 'none'; 
                    placeholderDiv.style.display = 'block'; 
                };
            } else {
                imageEl.style.display = 'none'; 
                placeholderDiv.style.display = 'block'; 
            }
        });

        listContainer.appendChild(card);
    });
}

document.getElementById('rarity-filter').addEventListener('change', filterAndDisplayBirds);

// ============================================
// H. SUBMISSION FUNCTIONS
// ============================================

function isSpeciesValid(speciesName) {
    return allUKBirds.some(bird => bird.CommonName.trim() === speciesName.trim());
}

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
    let successCount = 0;
    let invalidEntries = 0;
    
    for (const group of entryGroups) {
        const speciesInput = group.querySelector('.species-input');
        const species = speciesInput ? speciesInput.value.trim() : '';
        
        if (species) {
            if (isSpeciesValid(species)) {
                const success = await saveSighting({
                    species: species,
                    date: date,
                    location: location
                });
                
                if (success) {
                    successCount++;
                }
            } else {
                speciesInput.value = ''; 
                invalidEntries++;
            }
        }
    }

    if (successCount > 0) {
        entriesContainer.innerHTML = ''; 
        addSightingEntry(); 
        document.getElementById('location').value = location; 
        
        if (invalidEntries > 0) {
            alert(`Successfully recorded ${successCount} sightings. Note: ${invalidEntries} entr${invalidEntries === 1 ? 'y was' : 'ies were'} cleared because the species name did not match the UK Bird database.`);
        } else {
            alert(`Successfully recorded ${successCount} sighting${successCount === 1 ? '' : 's'}!`);
        }
    } else {
        if (invalidEntries === 0) {
            alert("Please enter at least one bird species.");
        } else {
            alert(`No valid sightings recorded. Please check your spelling against the UK Bird Database.`);
        }
    }
});

// ============================================
// I. STATS CALCULATIONS
// ============================================

function calculateAndDisplayStats() {
    const totalSpeciesElement = document.getElementById('total-species');
    const percentageElement = document.getElementById('percentage-seen');
    const percentageNoMegaElement = document.getElementById('percentage-no-mega');

    const uniqueSpeciesSeen = getUniqueSeenSpecies();
    const totalUniqueSeen = uniqueSpeciesSeen.size;

    // Total stats
    const totalUKBirds = allUKBirds.length;
    let percentage = 0;
    
    if (totalUKBirds > 0) {
        percentage = (totalUniqueSeen / totalUKBirds) * 100;
    }

    totalSpeciesElement.textContent = totalUniqueSeen;
    percentageElement.textContent = `${percentage.toFixed(2)}%`;
    
    // Stats excluding Mega rarities
    const nonMegaBirds = allUKBirds.filter(bird => bird.Rarity !== 'Mega' && bird.Rarity !== '');
    const nonMegaCount = nonMegaBirds.length;
    
    console.log("Total UK birds:", totalUKBirds);
    console.log("Non-mega UK birds:", nonMegaCount);
    console.log("Unique species seen:", totalUniqueSeen);
    
    const seenNonMega = Array.from(uniqueSpeciesSeen).filter(species => {
        const bird = allUKBirds.find(b => b.CommonName === species);
        const isNonMega = bird && bird.Rarity !== 'Mega' && bird.Rarity !== '';
        return isNonMega;
    });
    
    console.log("Non-mega species seen:", seenNonMega.length);
    
    let percentageNoMega = 0;
    if (nonMegaCount > 0) {
        percentageNoMega = (seenNonMega.length / nonMegaCount) * 100;
    }
    
    console.log("Percentage excluding megas:", percentageNoMega.toFixed(2) + "%");
    
    percentageNoMegaElement.textContent = `${percentageNoMega.toFixed(2)}%`;
}

// ============================================
// J. MONTHLY CHART
// ============================================

let monthlyChartInstance = null;

function createMonthlyChart() {
    console.log("Creating monthly chart with", mySightings.length, "sightings");
    
    if (mySightings.length === 0) {
        console.log("No sightings, skipping chart");
        return;
    }
    
    // Check if Chart is available
    if (typeof Chart === 'undefined') {
        console.error("Chart.js not loaded!");
        return;
    }
    
    // Group sightings by month
    const monthlyCounts = {};
    
    mySightings.forEach(sighting => {
        const date = new Date(sighting.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyCounts[monthKey]) {
            monthlyCounts[monthKey] = new Set();
        }
        
        // Only count unique species per month
        if (isSpeciesValid(sighting.species)) {
            monthlyCounts[monthKey].add(sighting.species);
        }
    });
    
    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyCounts).sort();
    
    console.log("Months with data:", sortedMonths.length);
    
    if (sortedMonths.length === 0) {
        console.log("No valid months, skipping chart");
        return;
    }
    
    // Convert to chart data
    const labels = sortedMonths.map(key => {
        const [year, month] = key.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });
    
    const data = sortedMonths.map(key => monthlyCounts[key].size);
    
    console.log("Chart labels:", labels);
    console.log("Chart data:", data);
    
    // Destroy previous chart if exists
    if (monthlyChartInstance) {
        monthlyChartInstance.destroy();
    }
    
    // Create new chart
    const canvas = document.getElementById('monthly-chart');
    if (!canvas) {
        console.error("Chart canvas not found!");
        return;
    }
    
    const ctx = canvas.getContext('2d');
    monthlyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Unique Species Seen',
                data: data,
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Number of Unique Species'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                }
            }
        }
    });
    
    console.log("Chart created successfully!");
}

// ============================================
// START THE APPLICATION
// ============================================

loadUKBirds();
