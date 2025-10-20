// ============================================
// SUPABASE CONFIGURATION
// ============================================
// IMPORTANT: Replace these with YOUR values from Supabase dashboard
const SUPABASE_URL = 'YOUR_PROJECT_URL_HERE';  // Example: 'https://xxxxx.supabase.co'
const SUPABASE_KEY = 'YOUR_ANON_KEY_HERE';     // The long anon/public key

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// GLOBAL VARIABLES
// ============================================
let allUKBirds = [];
let mySightings = [];
let savedLocations = [];

const entriesContainer = document.getElementById('entries-container');
const addEntryBtn = document.getElementById('add-entry-btn');
const sightingForm = document.getElementById('sighting-form');


// ============================================
// A. INITIAL LOAD FUNCTIONS
// ============================================

async function loadUKBirds() {
    try {
        const response = await fetch('uk_birds.json');
        allUKBirds = await response.json();
        
        populateSpeciesDatalist(); 
        filterAndDisplayBirds();
        await loadSightings();
        await loadLocations(); 
        addSightingEntry(); 
        setupTabSwitching(); 
    } catch (error) {
        console.error("Failed to load UK bird list:", error);
    }
}

// Load sightings from Supabase database
async function loadSightings() {
    try {
        const { data, error } = await supabase
            .from('sightings')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        mySightings = data || [];
        updateAllDisplays();
    } catch (error) {
        console.error("Error loading sightings:", error);
        alert("Failed to load sightings from database. Check console for details.");
    }
}

// Save a new sighting to Supabase
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
        
        // Add the returned data (with id) to our local array
        if (data && data.length > 0) {
            mySightings.unshift(data[0]); // Add to beginning
            updateAllDisplays();
        }
        
        return true;
    } catch (error) {
        console.error("Error saving sighting:", error);
        return false;
    }
}

// Delete a sighting from Supabase
async function deleteSightingFromDB(idToDelete) {
    try {
        const { error } = await supabase
            .from('sightings')
            .delete()
            .eq('id', idToDelete);
        
        if (error) throw error;
        
        // Remove from local array
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
// C. LOCATION MANAGEMENT
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
            // If it's a duplicate error, ignore it
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
// D. DYNAMIC FORM ENTRY FUNCTIONS
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
// E. BIRD LIST & IMAGE FUNCTIONS
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
// F. SUBMISSION & CHECKLIST FUNCTIONS
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

function displaySightings() {
    const list = document.getElementById('sightings-list');
    list.innerHTML = ''; 

    if (mySightings.length === 0) {
        list.innerHTML = 'No sightings recorded yet.';
        return;
    }

    mySightings.forEach(sighting => {
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
}

async function deleteSighting(idToDelete) {
    if (confirm("Are you sure you want to delete this sighting?")) {
        await deleteSightingFromDB(idToDelete);
    }
}


// ============================================
// G. SEEN BIRD SUMMARY FUNCTION
// ============================================

function displaySeenBirdsSummary() {
    const summaryContainer = document.getElementById('seen-birds-summary');
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

    speciesMap.forEach((data, species) => {
        const count = data.sightings.length;
        
        const summaryItem = document.createElement('div');
        summaryItem.classList.add('summary-species-group');

        const heading = document.createElement('h3');
        heading.innerHTML = `
            <span class="species-name">${species}</span> 
            <span class="sighting-count">(${count} times seen)</span>
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
// H. STATS CALCULATIONS
// ============================================

function calculateAndDisplayStats() {
    const totalSpeciesElement = document.getElementById('total-species');
    const percentageElement = document.getElementById('percentage-seen');

    const uniqueSpeciesSeen = getUniqueSeenSpecies();
    const totalUniqueSeen = uniqueSpeciesSeen.size;

    const totalUKBirds = allUKBirds.length;
    let percentage = 0;
    
    if (totalUKBirds > 0) {
        percentage = (totalUniqueSeen / totalUKBirds) * 100;
    }

    totalSpeciesElement.textContent = totalUniqueSeen;
    percentageElement.textContent = `${percentage.toFixed(2)}%`;
}


// ============================================
// START THE APPLICATION
// ============================================

loadUKBirds();