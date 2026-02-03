// Pixel Adventure - Game UI Logic
const API_BASE_URL = 'http://localhost:8000/api'; // Keep for future
let currentUser = null;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('Pixel Adventure Initializing...');
    
    // Check which page we're on
    const currentPage = window.location.pathname;
    console.log('Current page:', currentPage);
    
    if (currentPage.includes('intro.html') ) {
        console.log('Intro page detected');
        setupIntroPage();
    } else if (currentPage.includes('terms.html')) {
        console.log('Terms page detected');
        initTermsPage();
    } else if (currentPage.includes('login.html')) {
        console.log('Login page detected');
        initLoginPage();
    } else if (currentPage.includes('main.html')) {
        console.log('Main page detected');
        initMainPage();
    }
    
    // Check for existing session
    checkSession();
    
    // Create pixel particles
    createPixelParticles();
    
    // Add keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Add page fade-in effect (ONLY ONCE - remove duplicate at bottom)
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease-in-out';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});

// ===== INTRO PAGE SETUP =====
function setupIntroPage() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', function() {
            showLoadingScreen();
            setTimeout(() => {
                window.location.href = 'terms.html';
            }, 1500);
        });
    }
}

// ===== MAIN PAGE SETUP =====
function initMainPage() {
    updateWelcomeMessage();
    
    // Add loading screen to main page if not present
    if (!document.getElementById('loadingScreen')) {
        const loadingHTML = `
            <div id="loadingScreen" class="pixel-loading">
                <div class="loading-content">
                    <div class="pixel-loader"></div>
                    <h3 class="loading-title">LOADING ADVENTURE...</h3>
                    <div class="loading-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <p class="loading-text" id="loadingText">Initializing pixel engine...</p>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', loadingHTML);
    }
}



// ===== TERMS PAGE  =====
function initTermsPage() {
    const termsBox = document.querySelector('.scroll-box');
    const agreeTerms = document.getElementById('agreeTerms');
    const agreeData = document.getElementById('agreeData');
    
    if (termsBox) {
        termsBox.addEventListener('scroll', function() {
            const scrollPercent = (termsBox.scrollTop + termsBox.clientHeight) / termsBox.scrollHeight;
            
            if (scrollPercent > 0.9 && !agreeTerms.checked) {
                agreeTerms.checked = true;
                updateContinueButton();
                showToast('Terms scrolled to bottom!');
            }
        });
        
        // Checkbox handlers - using Kingdom Chronicles logic
        agreeTerms?.addEventListener('change', updateContinueButton);
        agreeData?.addEventListener('change', updateContinueButton);
        
        // Initialize button state
        updateContinueButton();
    }
}

function updateContinueButton() {
    const agreeTerms = document.getElementById('agreeTerms');
    const agreeData = document.getElementById('agreeData');
    const continueBtn = document.getElementById('continueBtn');
    
    if (continueBtn) {
        const allRequiredAccepted = agreeTerms?.checked && agreeData?.checked;
        continueBtn.disabled = !allRequiredAccepted;
        
        if (allRequiredAccepted) {
            continueBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">CONTINUE</span>';
            continueBtn.classList.add('pixel-btn-primary');
            continueBtn.classList.remove('pixel-btn-secondary');
        } else {
            continueBtn.innerHTML = '<span class="btn-icon">🔒</span><span class="btn-text">ACCEPT TERMS</span>';
            continueBtn.classList.remove('pixel-btn-primary');
            continueBtn.classList.add('pixel-btn-secondary');
        }
    }
}



// Use Kingdom Chronicles' proceed logic
function proceedToLogin() {
    // Save acceptance to localStorage
    localStorage.setItem('termsAccepted', 'true');
    localStorage.setItem('termsAcceptedDate', new Date().toISOString());
    
    // Show loading screen
    showLoadingScreen();
    
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1500);
}

// ===== HELP MODAL (terms.html) =====
window.showHelp = function () {
const modal = document.getElementById('helpModal');
if (modal) modal.style.display = 'block';
};


window.closeHelp = function () {
const modal = document.getElementById('helpModal');
if (modal) modal.style.display = 'none';
};


window.showGuidebook = function () {
// optional: close help first
window.closeHelp();
const modal = document.getElementById('guidebookModal');
if (modal) modal.style.display = 'block';
};


window.closeGuidebook = function () {
const modal = document.getElementById('guidebookModal');
if (modal) modal.style.display = 'none';
};

// ===== LOGIN PAGE (Using Kingdom Chronicles working logic) =====
function initLoginPage() {
    console.log('Setting up login page...');
    
    // Password toggle functionality
    setupPasswordToggles();
    
    // Check if terms were accepted
    if (!localStorage.getItem('termsAccepted')) { 
        console.log('Terms not accepted, redirecting...');
        showToast('Please accept terms first!');
        setTimeout(() => {
            window.location.href = 'intro.html';
        }, 2000);
        return;
    }
    
    // Setup form submissions
    setupLoginForm();
    setupRegisterForm();
    
    // ADD THIS: Set up tab switching with event listeners
    setupTabSwitching();
    
    console.log('Login page setup complete');
}


// Setup tab switching with event listeners
function setupTabSwitching() {
    console.log('Setting up tab switching...');
    
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    console.log('Elements found:', {
        loginTab: loginTab ? '✅' : '❌',
        registerTab: registerTab ? '✅' : '❌',
        loginForm: loginForm ? '✅' : '❌',
        registerForm: registerForm ? '✅' : '❌'
    });
    
    if (loginTab) {
        loginTab.addEventListener('click', function() {
            console.log('Login tab clicked');
            switchTab('login');
        });
    }
    
    if (registerTab) {
        registerTab.addEventListener('click', function() {
            console.log('Register tab clicked');
            switchTab('register');
        });
    }
    
    console.log('Tab switching setup complete');
}

function setupLoginForm() {
  const form = document.getElementById('loginFormData');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!username || !password) {
      showToast('FILL ALL FIELDS');
      return;
    }

    const demoAccounts = [
      { username: 'admin', password: 'admin123' },
      { username: 'player1', password: 'player123' },
    ];

    const demoMatch = demoAccounts.find(
      u => u.username === username && u.password === password
    );

    const users = getRegisteredUsers();
    const savedMatch = users.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    const account = demoMatch || savedMatch;

    if (!account) {
      showToast('INVALID USERNAME OR PASSWORD');
      return;
    }

    localStorage.setItem('session_id', 'session_' + Date.now());
    localStorage.setItem('username', account.username);
    localStorage.setItem('is_guest', 'false');

    showToast('LOGIN SUCCESS!');
    setTimeout(() => window.location.href = 'main.html', 800);
  });
}

function getRegisteredUsers() {
  return JSON.parse(localStorage.getItem('registeredUsers') || '[]');
}

function saveRegisteredUsers(users) {
  localStorage.setItem('registeredUsers', JSON.stringify(users));
}

function setupRegisterForm() {
  const form = document.getElementById('registerFormData');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = document.getElementById('regUsername')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim() || '';
    const password = document.getElementById('regPassword')?.value;
    const confirm = document.getElementById('regConfirmPassword')?.value;

    if (!username || !password) {
      showToast('USERNAME & PASSWORD REQUIRED');
      return;
    }

    if (password !== confirm) {
      showToast('PASSWORDS DO NOT MATCH');
      return;
    }

    const users = getRegisteredUsers();

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      showToast('USERNAME ALREADY TAKEN');
      return;
    }

    users.push({
      id: Date.now(),
      username,
      email,
      password, // (for real apps, never store plain text)
      created_at: new Date().toISOString(),
      level: 1,
      coins: 100,
      xp: 0
    });

    saveRegisteredUsers(users);

    showToast('ACCOUNT CREATED! NOW LOGIN');
    switchTab('login'); // go back to login tab
    form.reset();
  });
}

// Keep your existing validation functions (they're good!)
function validateUsername() {
    const username = document.getElementById('regUsername');
    const feedback = document.getElementById('usernameFeedback');
    
    if (!username || !feedback) return false;
    
    const value = username.value.trim();
    
    if (value.length < 3) {
        feedback.textContent = 'TOO SHORT (MIN 3)';
        feedback.className = 'pixel-input-feedback invalid';
        return false;
    }
    
    if (value.length > 20) {
        feedback.textContent = 'TOO LONG (MAX 20)';
        feedback.className = 'pixel-input-feedback invalid';
        return false;
    }
    
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(value)) {
        feedback.textContent = 'LETTERS, NUMBERS, _ ONLY';
        feedback.className = 'pixel-input-feedback invalid';
        return false;
    }
    
    // Check if username is taken
    const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
    if (registeredUsers.some(u => u.username === value)) {
        feedback.textContent = 'USERNAME TAKEN';
        feedback.className = 'pixel-input-feedback invalid';
        return false;
    }
    
    feedback.textContent = 'USERNAME AVAILABLE ✓';
    feedback.className = 'pixel-input-feedback valid';
    return true;
}



// ===== SESSION MANAGEMENT =====
function checkSession() {

    // protect main.html
    if (window.location.pathname.includes('main.html') &&
        !localStorage.getItem('session_id') &&
        !localStorage.getItem('is_guest')) {
            window.location.href = 'login.html';
            return; // stop running the rest of this function
    }

    const sessionId = localStorage.getItem('session_id');
    const username = localStorage.getItem('username');
    
    if (sessionId && username) {
        currentUser = {
            session_id: sessionId,
            username: username,
            role: localStorage.getItem('role') || 'player'
        };
        
        // If already logged in on login page, redirect
        if (window.location.pathname.includes('login.html')) {
            showToast(`ALREADY LOGGED IN AS ${currentUser.username}`);
            setTimeout(() => {
                window.location.href = 'main.html';
            }, 1500);
        }
        
        // If on main page, update welcome message
        if (window.location.pathname.includes('main.html')) {
            updateWelcomeMessage();
        }
    }
}

function updateWelcomeMessage() {
    const username = localStorage.getItem('username') || 'Adventurer';
    const welcomeElement = document.querySelector('.game-welcome h3');
    
    if (welcomeElement) {
        welcomeElement.textContent = `WELCOME, ${username.toUpperCase()}!`;
    }
    
    // Update stats if available
    const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
    const currentUserData = registeredUsers.find(u => u.username === username);
    
    if (currentUserData) {
        const levelDisplay = document.querySelector('.stat-display:nth-child(1) .stat-value');
        const coinsDisplay = document.querySelector('.stat-display:nth-child(2) .stat-value');
        const xpDisplay = document.querySelector('.stat-display:nth-child(3) .stat-value');
        
        if (levelDisplay) levelDisplay.textContent = currentUserData.level || 1;
        if (coinsDisplay) coinsDisplay.textContent = currentUserData.coins || 0;
        if (xpDisplay) xpDisplay.textContent = `${currentUserData.xp || 0}/100`;
    }
}

// ===== GUEST LOGIN (Using Kingdom Chronicles approach) =====
function guestLogin() {
    playSound('click');
    
    // Create guest session
    const guestData = {
        session_id: 'guest_session_' + Date.now(),
        username: 'GUEST_' + Math.floor(Math.random() * 10000),
        role: 'guest',
        is_guest: true
    };
    
    // Save to localStorage
    localStorage.setItem('session_id', guestData.session_id);
    localStorage.setItem('username', guestData.username);
    localStorage.setItem('role', guestData.role);
    localStorage.setItem('is_guest', 'true');
    localStorage.setItem('guest_id', guestData.session_id);
    
    currentUser = guestData;
    
    showToast('🎭 WELCOME, GUEST ADVENTURER!');
    
    // Show loading screen and redirect
    showLoadingScreen();
    setTimeout(() => {
        window.location.href = 'main.html';
    }, 1500);
}

// ===== NAVIGATION & UTILITIES =====
function goBack() {
  // If we're on login page, always go to terms.html
  if (window.location.pathname.includes('login.html')) {
    window.location.href = 'terms.html';
    return;
  }

  // Otherwise, normal back behavior
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'index.html';
  }
}

function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    playSound('click');
    
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (!loginTab || !registerTab || !loginForm || !registerForm) {
        console.error('Missing tab or form elements!');
        return;
    }
    
    if (tabName === 'login') {
        // Show login form, hide register form
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        
        // Update tab buttons
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        
        console.log('Switched to LOGIN form');
    } else {
        // Show register form, hide login form
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        
        // Update tab buttons
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        
        console.log('Switched to REGISTER form');
    }
}

function showForgotPassword() {
    playSound('click');
    showToast('CONTACT SUPPORT TO RESET PASSWORD');
}

// ===== KINGDOM CHRONICLES LOADING SCREEN =====
function showLoadingScreen() {
    console.log('⏳ Showing loading screen...');
    
    const loadingScreen = document.getElementById('loadingScreen');
    
    if (!loadingScreen) {
        console.error('Loading screen element not found!');
        return;
    }
    
    // Show loading screen
    loadingScreen.style.display = 'flex';
    
    // Get loading elements
    const progressFill = document.querySelector('#loadingScreen .progress-fill') || 
                        document.querySelector('#loadingScreen .loading-progress');
    const loadingText = document.getElementById('loadingText');
    
    if (!loadingText) {
        console.warn('⚠️ loadingText element not found');
    }
    
    // Custom loading messages
    const loadingMessages = [
        'Initializing pixel engine...',
        'Loading sprites...',
        'Generating world...',
        'Almost ready...'
    ];
    
    // Change loading text every 500ms
    let currentMessage = 0;
    if (loadingText) {
        const interval = setInterval(() => {
            if (currentMessage < loadingMessages.length) {
                loadingText.textContent = loadingMessages[currentMessage];
                currentMessage++;
            } else {
                clearInterval(interval);
            }
        }, 500);
    }
    
    // Animate progress bar
    if (progressFill) {
        let currentProgress = 0;
        const progressInterval = setInterval(() => {
            currentProgress += Math.random() * 15;
            if (currentProgress >= 100) {
                currentProgress = 100;
                clearInterval(progressInterval);
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                    console.log('Loading complete');
                }, 500);
            }
            progressFill.style.width = `${currentProgress}%`;
        }, 200);
    } else {
        // If no progress bar, hide after 1.5 seconds
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            console.log('Loading complete');
        }, 1500);
    }
}



// ===== MAIN PAGE FUNCTIONS =====
function startGame() {
    const toast = document.createElement('div');
    toast.className = 'pixel-toast';
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-text">GAME STARTING SOON...</span>
        </div>
    `;
    document.body.appendChild(toast);
    toast.style.display = 'flex';
    
    setTimeout(() => {
        window.location.href = 'character.html';
    }, 1500);
}

function logout() {
    // Clear all session data
    localStorage.removeItem('session_id');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    localStorage.removeItem('is_guest');
    localStorage.removeItem('guest_id');
    localStorage.removeItem('user_email');
    
    // Show logout message
    showToast('Logged out successfully!');
    
    // Redirect to login
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1500);
}



function playSound(_) {
// optional: add audio later
}


function showToast(message = '') {
const toast = document.getElementById('messageToast');
if (!toast) return;


const text = toast.querySelector('.toast-text');
if (text) text.textContent = message;


toast.style.display = 'flex';
clearTimeout(window.__toastTimer);
window.__toastTimer = setTimeout(() => {
toast.style.display = 'none';
}, 2000);
}


function createPixelParticles() {
// optional effect later (safe empty)
}


function setupKeyboardShortcuts() {
// optional later
}


function setupPasswordToggles() {
// optional later
}


function togglePassword(inputId) {
const input = document.getElementById(inputId);
if (!input) return;
input.type = input.type === 'password' ? 'text' : 'password';
}


function celebrateLogin() {}
function celebrateRegistration() {}


//  prevent crashes:
function setupRealTimeValidation() {}
function validatePassword() { return true; }
function validateConfirmPassword() { return true; }