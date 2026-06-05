/* ============================================================
   MINES PREDICTOR PRO — script.js
   UI DEMO ONLY — Not a real gambling predictor.

   Fixes in this version:
   - Daily limit localStorage logic fully repaired
   - Verify popup now shows AFTER loading starts (not before)
   - GIF popup appended inside tile (not body) — no mobile drift
   - Inline onclick handlers replaced with addEventListener
   - Stale GIFs cleaned up on clearAllTiles()
   - predictBtn text/limit count made consistent
   - isVerifying safety guard on page restore
============================================================ */


/* ========================
   ASSET FILE NAMES
   Change here if you rename any file
======================== */
const ASSETS = {
  diamondPNG : 'diamond.png',  /* shown inside revealed tiles      */
  diamondGIF : 'diamond.gif',  /* animation played inside the tile */
  sounds: {
    verify  : 'verify.mp3',    /* verify button click sound        */
    predict : 'predict.mp3',   /* predict button click sound       */
    success : 'success.mp3',   /* played after verification done   */
    diamond : 'diamond.mp3'    /* played per diamond reveal        */
  }
};


/* ========================
   GAME CONFIGURATIONS
   4 possible random outcomes — one is picked at verify time
======================== */
const CONFIGS = [
  { mines: 4, gems: 21, profit: '2.09x', diamonds: 4 },
  { mines: 5, gems: 20, profit: '2x',    diamonds: 3 },
  { mines: 6, gems: 19, profit: '2.35x', diamonds: 3 },
  { mines: 7, gems: 18, profit: '1.94x', diamonds: 2 }
];


/* ========================
   DAILY LIMIT SETTINGS
   MAX_PREDICTIONS = how many predicts are allowed per day
======================== */
const MAX_PREDICTIONS = 2;
const PREDICTION_KEY  = 'mines_prediction_data';

/* Today's date string e.g. "2025-06-01" — used as the daily key */
const TODAY_KEY = new Date().toISOString().split('T')[0];


/* ========================
   HASH VALIDATION PATTERN
   Minimum 6 characters — letters, numbers, hyphens allowed
======================== */
const HASH_PATTERN = /^[A-Za-z0-9\-]{8,}$/;


/* ========================
   DOM ELEMENT REFERENCES
   All grabbed once at page load
======================== */
const hashInput      = document.getElementById('hash-input');
const verifyBtn      = document.getElementById('verify-btn');
const predictBtn     = document.getElementById('predict-btn');
const resultsSection = document.getElementById('results-section');
const minesValue     = document.getElementById('mines-value');
const gemsValue      = document.getElementById('gems-value');
const profitValue    = document.getElementById('profit-value');
const allTiles       = document.querySelectorAll('.tile');

/* Popup elements */
const customPopup      = document.getElementById('custom-popup');
const verifyPopup      = document.getElementById('verify-popup');
const closeLimitBtn    = document.getElementById('close-limit-popup');
const closeVerifyBtn   = document.getElementById('close-verify-popup');


/* ========================
   APP STATE
   Tracks what has happened in this session
======================== */
let currentConfig = null;   /* the randomly chosen config object    */
let isVerified    = false;  /* true once verification is complete   */
let isVerifying   = false;  /* true while the loading timer runs    */


/* ============================================================
   SOUND SYSTEM
   Each function creates a fresh Audio instance so sounds
   can overlap without cutting each other off.
============================================================ */

function playVerifySound() {
  const audio = new Audio(ASSETS.sounds.verify);
  audio.play().catch(() => {});  /* silently ignore if browser blocks autoplay */
}

function playPredictSound() {
  const audio = new Audio(ASSETS.sounds.predict);
  audio.play().catch(() => {});
}

function playSuccessSound() {
  const audio = new Audio(ASSETS.sounds.success);
  audio.play().catch(() => {});
}

function playDiamondSound() {
  const audio = new Audio(ASSETS.sounds.diamond);
  audio.play().catch(() => {});
}


/* ============================================================
   UTILITY: RANDOM INTEGER
   Returns a whole number between min and max (both included)
============================================================ */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


/* ============================================================
   UTILITY: SHUFFLE ARRAY  (Fisher-Yates algorithm)
   Returns a new shuffled copy — original array is not changed
============================================================ */
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}


/* ============================================================
   DAILY LIMIT HELPERS
   Read and write today's prediction count in localStorage.

   Stored format:
   { "date": "2025-06-01", "count": 1 }
============================================================ */

/* Returns the stored prediction data for today, or a fresh object */
function getTodayData() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREDICTION_KEY));
    /* FIX: old code compared stored value to TODAY_KEY string,
       but stored value is a JSON object — it never matched.
       Now we correctly check stored.date === TODAY_KEY */
    if (stored && stored.date === TODAY_KEY) {
      return stored;
    }
  } catch (e) {
    /* localStorage parse error — treat as fresh day */
  }
  return { date: TODAY_KEY, count: 0 };
}

/* Saves updated prediction data back to localStorage */
function saveTodayData(data) {
  try {
    localStorage.setItem(PREDICTION_KEY, JSON.stringify(data));
  } catch (e) {
    /* localStorage might be blocked in some browsers — fail silently */
  }
}

/* Returns true if user has reached today's limit */
function isDailyLimitReached() {
  return getTodayData().count >= MAX_PREDICTIONS;
}


/* ============================================================
   PAGE LOAD — RESTORE STATE
   If daily limit was already reached before page reload,
   disable the predict button immediately on load.
============================================================ */
(function restoreStateOnLoad() {
  if (isDailyLimitReached()) {
    predictBtn.disabled    = true;
    predictBtn.textContent = 'Used Today';
  }
})();


/* ============================================================
   HASH INPUT LISTENER
   Enables Verify button when input is valid.
   Resets the whole session if user edits hash after verifying.
============================================================ */
hashInput.addEventListener('input', function () {
  const hashValue   = hashInput.value.trim();
  const isValidHash = HASH_PATTERN.test(hashValue);

  /* Only enable Verify if hash is valid AND we are not mid-verification */
  verifyBtn.disabled = !isValidHash || isVerifying;

  /* If user types while already verified — reset everything */
  if (isVerified) {
    resetSession();
  }
});


/* ============================================================
   RESET SESSION
   Called when user changes the hash after verifying.
   Brings everything back to the initial state.
============================================================ */
function resetSession() {
  isVerified    = false;
  isVerifying   = false;
  currentConfig = null;

  /* Reset verify button */
  verifyBtn.classList.remove('verified', 'loading');
  verifyBtn.textContent = 'Verify';
  verifyBtn.disabled    = !HASH_PATTERN.test(hashInput.value.trim());

  /* Disable predict button (unless daily limit already hit) */
  if (!isDailyLimitReached()) {
    predictBtn.disabled    = true;
    predictBtn.textContent = 'Predict';
  }

  /* Hide results */
  resultsSection.style.display = 'none';

  /* Clear all tile diamonds */
  clearAllTiles();
}


/* ============================================================
   VERIFY BUTTON — CLICK HANDLER
   Flow: play sound → show warning popup → start loading timer
         → after timer: mark verified, show results, enable predict
============================================================ */
verifyBtn.addEventListener('click', function () {

  /* Guard: ignore if already verifying or already verified */
  if (isVerifying || isVerified) return;

  /* Extra guard: validate hash one more time */
  if (!HASH_PATTERN.test(hashInput.value.trim())) {
    alert('⚠️ Please enter a valid Client Seed (min 6 characters).');
    return;
  }

  /* Play verify click sound */
  playVerifySound();

  /* Lock state — prevents double-clicks */
  isVerifying         = true;
  verifyBtn.disabled  = true;
  predictBtn.disabled = true;

  /* Show loading state on button immediately */
  verifyBtn.classList.add('loading');
  verifyBtn.textContent = 'Verifying...';

  /* Pick a random config now — result is locked in during loading */
  currentConfig = CONFIGS[randomInt(0, CONFIGS.length - 1)];

  /* FIX: show verify warning popup AFTER loading state is set,
     not before — so the user sees the button change first */
  verifyPopup.style.display = 'flex';

  /* Random loading time between 4 and 10 seconds */
  const loadingTime = randomInt(4, 10) * 1000;

  setTimeout(function () {

    /* Loading complete */
    isVerifying = false;
    isVerified  = true;

    /* Update verify button to success state */
    verifyBtn.classList.remove('loading');
    verifyBtn.classList.add('verified');
    verifyBtn.textContent = 'Verified ✅';
    verifyBtn.disabled    = true; /* stays permanently disabled */

    /* Play success sound */
    playSuccessSound();

    /* Fill in and show results */
    showResults(currentConfig);

    /* Enable predict button only if daily limit not reached */
    if (!isDailyLimitReached()) {
      predictBtn.disabled    = false;
      predictBtn.textContent = 'Predict';
    } else {
      predictBtn.disabled    = true;
      predictBtn.textContent = 'Used Today';
    }

  }, loadingTime);
});


/* ============================================================
   SHOW RESULTS
   Populates Mines, Gems, Expected Profit and reveals the section
============================================================ */
function showResults(config) {
  minesValue.textContent  = config.mines;
  gemsValue.textContent   = config.gems;
  profitValue.textContent = config.profit;

  /* Trigger fadeSlideIn animation by switching display */
  resultsSection.style.display = 'block';
}


/* ============================================================
   PREDICT BUTTON — CLICK HANDLER
   Checks daily limit → clears grid → reveals diamonds
============================================================ */
predictBtn.addEventListener('click', function () {

  /* Guard: only run if fully verified */
  if (!isVerified || !currentConfig) return;

  /* Read today's prediction count */
  const todayData = getTodayData();

  /* Check if limit is already reached */
  if (todayData.count >= MAX_PREDICTIONS) {
    customPopup.style.display = 'flex';
    predictBtn.disabled       = true;
    predictBtn.textContent    = 'Used Today';
    return;
  }

  /* Increment and save the count */
  todayData.count++;
  saveTodayData(todayData);

  /* Play predict sound */
  playPredictSound();

  /* Update button to show usage — disable after limit hit */
  if (todayData.count >= MAX_PREDICTIONS) {
    /* After this prediction, the limit is reached */
    predictBtn.textContent = 'Used Today';
    predictBtn.disabled    = true;
  }

  /* Clear any previously revealed tiles */
  clearAllTiles();

  /* Shuffle all 25 tile indexes and pick the first N */
  const allIndexes    = Array.from({ length: 25 }, (_, i) => i);
  const shuffled      = shuffleArray(allIndexes);
  const chosenIndexes = shuffled.slice(0, currentConfig.diamonds);

  /* Reveal each chosen tile with a 300ms stagger */
  chosenIndexes.forEach(function (tileIndex, order) {
    setTimeout(function () {
      revealTile(tileIndex);
    }, order * 300);
  });
setTimeout(function () {

  hashInput.value = "";
  isVerified = false;
  currentConfig = null;

  verifyBtn.classList.remove("verified", "loading");
  verifyBtn.textContent = "Verify";
  verifyBtn.disabled = true;

  predictBtn.disabled = true;
  predictBtn.textContent = "Predict";

}, (currentConfig.diamonds * 300) + 1000);
});


/* ============================================================
   REVEAL TILE
   Adds diamond PNG + GIF animation to a specific tile
============================================================ */
function revealTile(index) {
  const tile = allTiles[index];

  /* Add revealed CSS class — triggers dark background + popIn */
  tile.classList.add('revealed');

  /* Create and insert diamond PNG */
  const img       = document.createElement('img');
  img.src         = ASSETS.diamondPNG;
  img.alt         = 'Diamond';
  img.className   = 'diamond-img';
  tile.appendChild(img);

  /* Play diamond sound */
  playDiamondSound();

  /* Show GIF animation inside the tile */
  showGifPopup(tile);
}


/* ============================================================
   SHOW GIF POPUP
   FIX: GIF is now appended INSIDE the tile using absolute
   positioning — not to document.body with fixed positioning.
   This prevents the GIF from drifting on mobile when the
   keyboard opens or the page scrolls.
============================================================ */
function showGifPopup(tile) {
  const gif       = document.createElement('img');
  gif.src         = ASSETS.diamondGIF;
  gif.className   = 'diamond-gif-popup'; /* styled in CSS: absolute, inset 0 */
  gif.alt         = '';

  /* Append inside the tile — tile has position:relative + overflow:hidden */
  tile.appendChild(gif);

  /* Auto-remove after 1.2 seconds — adjust to match your GIF length */
  setTimeout(function () {
    if (gif.parentNode) gif.remove();
  }, 1200);
}


/* ============================================================
   CLEAR ALL TILES
   FIX: now removes BOTH .diamond-img AND .diamond-gif-popup
   Old code only removed .diamond-img — stale GIFs could linger
============================================================ */
function clearAllTiles() {
  allTiles.forEach(function (tile) {
    tile.classList.remove('revealed');

    /* Remove diamond PNG */
    const img = tile.querySelector('.diamond-img');
    if (img) img.remove();

    /* FIX: also remove any GIF that was still playing */
    const gif = tile.querySelector('.diamond-gif-popup');
    if (gif) gif.remove();
  });
}


/* ============================================================
   POPUP CLOSE HANDLERS
   FIX: replaced inline onclick="closePopup()" in HTML with
   proper addEventListener — keeps JS separate from HTML
============================================================ */

/* Close the daily limit popup */
closeLimitBtn.addEventListener('click', function () {
  customPopup.style.display = 'none';
});

/* Close the verify warning popup */
closeVerifyBtn.addEventListener('click', function () {
  verifyPopup.style.display = 'none';
});

/* Also close popups when clicking the dark overlay background */
customPopup.addEventListener('click', function (e) {
  if (e.target === customPopup) customPopup.style.display = 'none';
});

verifyPopup.addEventListener('click', function (e) {
  if (e.target === verifyPopup) verifyPopup.style.display = 'none';
});


/* ============================================================
   LOGO IMAGE FALLBACK
   If logo.png fails to load, replace with diamond emoji
============================================================ */
const logoImg = document.querySelector('.logo-img');
if (logoImg) {
  logoImg.addEventListener('error', function () {
    logoImg.style.display = 'none';
    const logoBox = document.querySelector('.header-logo');
    if (logoBox) {
      logoBox.style.fontSize  = '32px';
      logoBox.textContent     = '💎';
    }
  });
}
