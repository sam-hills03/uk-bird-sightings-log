// script.js

// Global variables to hold all data
let allUKBirds = [];
let mySightings = [];
let savedLocations = []; 
const SIGHTINGS_KEY = 'birdSightings';
const LOCATIONS_KEY = 'savedLocations'; 

const entriesContainer = document.getElementById('entries-container');
const addEntryBtn = document.getElementById('add-entry-btn');
const sightingForm = document.getElementById('sighting-form');


// --- A. INITIAL LOAD FUNCTIONS ---

async function loadUKBirds() {
    try {
        const response = await fetch('uk_birds.json');
        allUKBirds = await response.json();
        
        // Initial setup calls
        populateSpeciesDatalist(); 
        filterAndDisplayBirds();
        loadSightings();
        loadLocations(); 
        addSightingEntry(); 
        setupTabSwitching(); 
    } catch (error) {
        console.error("Failed to load UK bird list. Check your uk_birds.json file and path.", error);
    }
}

function loadSightings() {
    const storedSightings = localStorage.getItem(SIGHTINGS_KEY);
    if (storedSightings) {
        mySightings = JSON.parse(storedSightings);
    }
    updateAllDisplays();
}

function saveSightings() {
    localStorage.setItem(SIGHTINGS_KEY, JSON.stringify(mySightings));
    updateAllDisplays();
}

function updateAllDisplays() {
    displaySightings();
    displaySeenBirdsSummary(); 
    calculateAndDisplayStats();
    // Re-filter and display birds whenever stats change (or sightings change)
    filterAndDisplayBirds(); 
}


// --- B. TAB SWITCHING LOGIC ---

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

    switchTab('database-view'); // Start on the database view
}


// --- C. LOCATION MANAGEMENT ---
function loadLocations() {
    const storedLocations = localStorage.getItem(LOCATIONS_KEY);
    if (storedLocations) {
        savedLocations = JSON.parse(storedLocations);
    }
    populateLocationDatalist();
}

function saveNewLocation(location) {
    if (location && !savedLocations.includes(location)) {
        savedLocations.push(location);
        localStorage.setItem(LOCATIONS_KEY, JSON.stringify(savedLocations));
        populateLocationDatalist(); 
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


// --- D. DYNAMIC FORM ENTRY FUNCTIONS ---
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


// --- E. BIRD LIST & IMAGE FUNCTIONS (UK BIRD LIST) ---

/**
 * Returns a Set of all unique, validated species names the user has sighted.
 */
function getUniqueSeenSpecies() {
    // We filter the entire list of sightings against the bird database for accuracy
    const validSeenSpecies = mySightings
        .filter(s => isSpeciesValid(s.species))
        .map(s => s.species);
        
    return new Set(validSeenSpecies);
}

/**
 * Fetches the image URL for a bird from iNaturalist API.
 * Uses Latin name first, then Common name as fallback.
 */
async function getiNaturalistImage(commonName, latinName) {
    const searchTerms = [latinName, commonName].filter(name => name && name.trim() !== 'No Data');
    
    for (const searchTerm of searchTerms) {
        try {
            const response = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(searchTerm)}&iconic_taxa=Aves&rank=species&per_page=1`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const result = data.results[0];
                
                // Check for exact Latin name match
                if (searchTerm === latinName && result.name && result.name.toLowerCase() === latinName.toLowerCase() && result.default_photo && result.default_photo.medium_url) {
                    return result.default_photo.medium_url;
                }
                
                // Check for exact Common name match
                if (searchTerm === commonName && result.preferred_common_name && result.preferred_common_name.toLowerCase() === commonName.toLowerCase() && result.default_photo && result.default_photo.medium_url) {
                    return result.default_photo.medium_url;
                }
            }
        } catch (error) {
            console.error(`iNaturalist search failed for "${searchTerm}":`, error);
        }
    }
    return null; // Return null if no exact match or image found
}


function filterAndDisplayBirds() {
    const filterValue = document.getElementById('rarity-filter').value;
    const listContainer = document.getElementById('bird-list');
    listContainer.innerHTML = ''; 

    const filteredBirds = filterValue === 'All'
        ? allUKBirds
        : allUKBirds.filter(bird => bird.Rarity === filterValue); 
        
    // NEW: Get the list of seen birds once for efficient lookup
    const seenSpecies = getUniqueSeenSpecies();

    const cardTemplate = document.getElementById('bird-card-template');

    filteredBirds.forEach(bird => {
        const cardClone = cardTemplate.content.cloneNode(true);
        const card = cardClone.querySelector('.bird-card');
        const commonName = bird.CommonName; // Store for easy comparison

        // NEW: Check if the bird has been seen
        if (seenSpecies.has(commonName)) {
            card.classList.add('seen');
            
            // Add the checkmark badge
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

        // Populate text content
        commonNameEl.textContent = commonName;
        latinNameEl.textContent = bird.LatinName && bird.LatinName !== 'No Data' ? bird.LatinName : '';
        statusTextEl.textContent = bird.Status && bird.Status !== 'No Data' ? bird.Status : '';

        // Add Rarity Tag with class for styling
        rarityTagEl.textContent = bird.Rarity;
        rarityTagEl.classList.add(`rarity-${bird.Rarity}`);

        // Set up image placeholder and loading
        imageEl.src = ''; 
        imageEl.alt = `${commonName} photo`;
        
        const placeholderDiv = document.createElement('div');
        placeholderDiv.classList.add('image-placeholder');
        placeholderDiv.textContent = 'Image not available';
        imageContainer.appendChild(placeholderDiv);
        
        // Fetch image asynchronously
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


// --- F. SUBMISSION & CHECKLIST FUNCTIONS (USER DATA) ---

/**
 * Checks if the entered species name exists in the allUKBirds array.
 */
function isSpeciesValid(speciesName) {
    return allUKBirds.some(bird => bird.CommonName.trim() === speciesName.trim());
}

sightingForm.addEventListener('submit', (e) => {
    e.preventDefault(); 

    const date = document.getElementById('sighting-date').value;
    const location = document.getElementById('location').value.trim();
    
    if (!date || !location) {
        alert("Please enter both a Date and a Location.");
        return;
    }

    saveNewLocation(location);

    const entryGroups = entriesContainer.querySelectorAll('.sighting-entry-group');
    let sightingsToSave = [];
    let invalidEntries = 0; 
    
    entryGroups.forEach(group => {
        const speciesInput = group.querySelector('.species-input');
        const species = speciesInput ? speciesInput.value.trim() : '';
        
        if (species) {
            if (isSpeciesValid(species)) {
                const newSighting = {
                    id: Date.now() + Math.random(), 
                    species: species,
                    date: date,
                    location: location
                };
                
                sightingsToSave.push(newSighting);
            } else {
                speciesInput.value = ''; 
                invalidEntries++;
            }
        }
    });

    if (sightingsToSave.length > 0) {
        mySightings.push(...sightingsToSave); 
        saveSightings(); 
        entriesContainer.innerHTML = ''; 
        addSightingEntry(); 
        document.getElementById('location').value = location; 
        
        if (invalidEntries > 0) {
             alert(`Successfully recorded ${sightingsToSave.length} sightings. Note: ${invalidEntries} entr${invalidEntries === 1 ? 'y was' : 'ies were'} cleared because the species name did not match the UK Bird database.`);
        }
    } else {
        if (invalidEntries === 0) {
            alert("Please enter at least one bird species.");
        } else {
            alert(`No valid sightings recorded. Please check your spelling against the UK Bird Database.`);
        }
    }
});


// Display the user's raw sightings checklist (Raw Checklist tab)
function displaySightings() {
    const list = document.getElementById('sightings-list');
    list.innerHTML = ''; 

    const reversedSightings = [...mySightings].reverse();

    reversedSightings.forEach(sighting => {
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

// Function to delete a sighting
function deleteSighting(idToDelete) {
    if (confirm("Are you sure you want to delete this sighting?")) {
        mySightings = mySightings.filter(sighting => sighting.id !== idToDelete);
        saveSightings(); 
    }
}


// --- G. SEEN BIRD SUMMARY FUNCTION (Species Summary tab) ---

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


// --- H. STATS CALCULATIONS ---

function calculateAndDisplayStats() {
    const totalSpeciesElement = document.getElementById('total-species');
    const percentageElement = document.getElementById('percentage-seen');

    // Stats are now reliably calculated using the validated species list from getUniqueSeenSpecies()
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


// --- START THE APPLICATION ---
loadUKBirds();