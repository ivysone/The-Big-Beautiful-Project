// Pixel Adventure - Enhanced with Multiple Session Tracking
const API_BASE_URL = "http://localhost:8000/api";
let currentUser = null;
let selectedDifficulty = null;

// ===== TELEMETRY HELPER =====
async function sendCompleteUserData(payload) {
  const enriched = {
    timestamp: new Date().toISOString(),
    ...payload,
  };

  console.log("Sending complete user data:", enriched);

  try {
    const res = await fetch(`${API_BASE_URL}/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enriched),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("API error:", res.status, data);
      showToast(`SAVE FAILED (${res.status})`);
      return null;
    }

    console.log("Data saved successfully:", data);
    showToast("DATA SAVED!");
    return data;
  } catch (err) {
    console.error("API connection failed:", err);
    showToast("SAVE FAILED (API DOWN)");
    return null;
  }
}

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", function () {
  console.log("Pixel Adventure Initializing...");

  const currentPage = window.location.pathname;
  console.log("Current page:", currentPage);

  if (currentPage.includes("intro.html")) {
    setupIntroPage();
  } else if (currentPage.includes("terms.html")) {
    initTermsPage();
  } else if (currentPage.includes("login.html")) {
    initLoginPage();
  } else if (currentPage.includes("main.html")) {
    initMainPage();
  } else if (currentPage.includes("character.html")) {
    initCharacterPage();
  }

  checkSession();
  createPixelParticles();
  setupKeyboardShortcuts();

  document.body.style.opacity = "0";
  document.body.style.transition = "opacity 0.5s ease-in-out";
  setTimeout(() => (document.body.style.opacity = "1"), 100);
});

// ===== INTRO PAGE =====
function setupIntroPage() {
  const startBtn = document.getElementById("startBtn");
  if (startBtn) {
    startBtn.addEventListener("click", function () {
      showLoadingScreen();
      setTimeout(() => {
        window.location.href = "terms.html";
      }, 1500);
    });
  }
}

// ===== MAIN PAGE SETUP =====
function initMainPage() {
  updateWelcomeMessage();
  
  // CLEAR previous selections when returning to main page
  // This allows users to make NEW choices each session
  sessionStorage.removeItem("selectedDifficulty");
  selectedDifficulty = null;
  
  // Reset button states
  const allButtons = document.querySelectorAll('.pixel-btn-difficulty');
  allButtons.forEach(btn => btn.classList.remove('active'));
  
  // Disable start button until new difficulty selected
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.classList.remove('pulse-animation');
  }
  
  // Update status text
  const statusText = document.getElementById('difficultyStatus');
  if (statusText) {
    statusText.textContent = 'Please select a difficulty to continue';
    statusText.style.color = 'var(--earth-warm)';
  }

  if (!document.getElementById("loadingScreen")) {
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
    document.body.insertAdjacentHTML("beforeend", loadingHTML);
  }
}

// ===== DIFFICULTY SELECTION =====
function selectDifficulty(difficulty) {
  selectedDifficulty = difficulty;
  sessionStorage.setItem("selectedDifficulty", difficulty);
  
  console.log("Difficulty selected:", difficulty);
  
  // Update button states
  const allButtons = document.querySelectorAll('.pixel-btn-difficulty');
  allButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.difficulty === difficulty) {
      btn.classList.add('active');
    }
  });
  
  // Enable start button
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.classList.add('pulse-animation');
  }
  
  // Update status text
  const statusText = document.getElementById('difficultyStatus');
  if (statusText) {
    const difficultyEmojis = {
      easy: '🟢',
      medium: '🟡',
      hard: '🔴'
    };
    statusText.textContent = `${difficultyEmojis[difficulty]} Selected: ${difficulty.toUpperCase()}`;
    statusText.style.color = '#a8ff60';
  }
  
  showToast(`DIFFICULTY: ${difficulty.toUpperCase()}`);
}

// ===== CHARACTER PAGE =====
function initCharacterPage() {
  // Check if difficulty was selected
  const difficulty = sessionStorage.getItem('selectedDifficulty');
  if (!difficulty) {
    showToast('SELECT DIFFICULTY FIRST!');
    setTimeout(() => {
      window.location.href = 'main.html';
    }, 2000);
  }
}

// ===== CHARACTER SELECTION - TRACKS EVERY SELECTION =====
window.selectCharacter = async function (character) {
  const username = localStorage.getItem("username") || "UNKNOWN";
  const difficulty = sessionStorage.getItem("selectedDifficulty") || "NOT_SELECTED";
  const loginTime = localStorage.getItem("login_time") || new Date().toISOString();
  
  console.log("User completed flow:");
  console.log("  - Username:", username);
  console.log("  - Difficulty:", difficulty);
  console.log("  - Character:", character);
  console.log("  - Login Time:", loginTime);
  
  // Get password ONLY from current session (registered users)
  let password = "";
  const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  const userAccount = registeredUsers.find(u => u.username === username);
  
  if (userAccount) {
    password = userAccount.password; // Will be hashed by backend
  }
  
  // SEND COMPLETE DATA - TRACKS EVERY TIME USER COMPLETES FLOW
  // This means:
  // - First time user plays: 1 entry
  // - User logs out, logs back in, picks different difficulty/character: NEW entry
  // - CSV will show ALL choices made by user over time
  await sendCompleteUserData({
    event_type: "complete_flow",
    username: username,
    password: password, // Backend will hash this
    mode_level_choice: difficulty,
    character_choice: character,
    login_time: loginTime,
    logout_time: "",  // Will be filled on logout
    duration_seconds: 0,  // Will be calculated on logout

  });
  
  // Save locally for display purposes (optional)
  localStorage.setItem("last_difficulty", difficulty);
  localStorage.setItem("last_character", character);
  
  showToast(`${character.toUpperCase()} SELECTED!`);
  
  setTimeout(() => {
    showLoadingScreen();
    setTimeout(() => {
      window.location.href = "main.html";
    }, 1500);
  }, 1000);
};

// ===== TERMS PAGE =====
function initTermsPage() {
  const termsBox = document.querySelector(".scroll-box");
  const agreeTerms = document.getElementById("agreeTerms");
  const agreeData = document.getElementById("agreeData");

  if (termsBox) {
    termsBox.addEventListener("scroll", function () {
      const scrollPercent =
        (termsBox.scrollTop + termsBox.clientHeight) / termsBox.scrollHeight;

      if (scrollPercent > 0.9 && !agreeTerms.checked) {
        agreeTerms.checked = true;
        updateContinueButton();
        showToast("Terms scrolled to bottom!");
      }
    });

    agreeTerms?.addEventListener("change", updateContinueButton);
    agreeData?.addEventListener("change", updateContinueButton);
    updateContinueButton();
  }
}

function updateContinueButton() {
  const agreeTerms = document.getElementById("agreeTerms");
  const agreeData = document.getElementById("agreeData");
  const continueBtn = document.getElementById("continueBtn");

  if (continueBtn) {
    const allRequiredAccepted = agreeTerms?.checked && agreeData?.checked;
    continueBtn.disabled = !allRequiredAccepted;

    if (allRequiredAccepted) {
      continueBtn.innerHTML = '<span class="btn-text">CONTINUE</span>';
      continueBtn.classList.add("pixel-btn-primary");
      continueBtn.classList.remove("pixel-btn-secondary");
    } else {
      continueBtn.innerHTML = '<span class="btn-text">ACCEPT TERMS</span>';
      continueBtn.classList.remove("pixel-btn-primary");
      continueBtn.classList.add("pixel-btn-secondary");
    }
  }
}

function proceedToLogin() {
  localStorage.setItem("termsAccepted", "true");
  localStorage.setItem("termsAcceptedDate", new Date().toISOString());
  
  showLoadingScreen();
  setTimeout(() => {
    window.location.href = "login.html";
  }, 1500);
}

// ===== HELP MODALS =====
window.showHelp = function () {
  const modal = document.getElementById("helpModal");
  if (modal) modal.style.display = "block";
};

window.closeHelp = function () {
  const modal = document.getElementById("helpModal");
  if (modal) modal.style.display = "none";
};

window.showGuidebook = function () {
  window.closeHelp();
  const modal = document.getElementById("guidebookModal");
  if (modal) modal.style.display = "block";
};

window.closeGuidebook = function () {
  const modal = document.getElementById("guidebookModal");
  if (modal) modal.style.display = "none";
};

// ===== LOGIN PAGE =====
function initLoginPage() {
  console.log("Setting up login page...");

  setupPasswordToggles();

  if (!localStorage.getItem("termsAccepted")) {
    showToast("Please accept terms first!");
    setTimeout(() => {
      window.location.href = "intro.html";
    }, 2000);
    return;
  }

  setupLoginForm();
  setupRegisterForm();
  setupTabSwitching();
}

function setupTabSwitching() {
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");

  if (loginTab) loginTab.addEventListener("click", () => switchTab("login"));
  if (registerTab) registerTab.addEventListener("click", () => switchTab("register"));
}

function setupLoginForm() {
  const form = document.getElementById("loginFormData");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("loginUsername")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;

    if (!username || !password) {
      showToast("FILL ALL FIELDS");
      return;
    }

    const demoAccounts = [
      { username: "admin", password: "admin123" },
      { username: "player1", password: "player123" },
    ];

    const demoMatch = demoAccounts.find(
      (u) => u.username === username && u.password === password
    );

    const users = getRegisteredUsers();
    const savedMatch = users.find(
      (u) =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
    );

    const account = demoMatch || savedMatch;

    if (!account) {
      showToast("INVALID USERNAME OR PASSWORD");
      return;
    }

    
    // ADMIN LOGIN - GO TO DASHBOARD
    
    if (username.toLowerCase() === "admin" && password === "admin123") {
      localStorage.setItem("session_id", "admin_session_" + Date.now());
      localStorage.setItem("username", "admin");
      localStorage.setItem("role", "admin");
      localStorage.setItem("login_time", new Date().toISOString());
      
      showToast("ADMIN ACCESS GRANTED!");
      
      setTimeout(() => {
        
        window.location.href = "admin_dashboard.html"; 
        
      }, 1500);
      return; // STOP HERE for admin
    }

    
    // REGULAR USER LOGIN - GO TO GAME
   
    localStorage.setItem("session_id", "session_" + Date.now());
    localStorage.setItem("username", account.username);
    localStorage.setItem("is_guest", "false");
    localStorage.setItem("login_time", new Date().toISOString());
    
    showToast("LOGIN SUCCESS!");
    setTimeout(() => (window.location.href = "main.html"), 800);
  });
}

function setupRegisterForm() {
  const form = document.getElementById("registerFormData");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("regUsername")?.value.trim();
    const email = document.getElementById("regEmail")?.value.trim() || "";
    const password = document.getElementById("regPassword")?.value;
    const confirm = document.getElementById("regConfirmPassword")?.value;

    if (!username || !password) {
      showToast("USERNAME & PASSWORD REQUIRED");
      return;
    }

    if (password !== confirm) {
      showToast("PASSWORDS DO NOT MATCH");
      return;
    }

    const users = getRegisteredUsers();

    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      showToast("USERNAME ALREADY TAKEN");
      return;
    }

    users.push({
      id: Date.now(),
      username,
      email,
      password, // Will be hashed by backend when user completes flow
      created_at: new Date().toISOString(),
      level: 1,
      coins: 100,
      xp: 0,
    });

    saveRegisteredUsers(users);

    showToast("ACCOUNT CREATED! NOW LOGIN");
    switchTab("login");
    form.reset();
  });
}

function getRegisteredUsers() {
  return JSON.parse(localStorage.getItem("registeredUsers") || "[]");
}

function saveRegisteredUsers(users) {
  localStorage.setItem("registeredUsers", JSON.stringify(users));
}

// ===== SESSION MANAGEMENT =====
function checkSession() {
  if (
    window.location.pathname.includes("main.html") &&
    !localStorage.getItem("session_id") &&
    !localStorage.getItem("is_guest")
  ) {
    window.location.href = "login.html";
    return;
  }

  const sessionId = localStorage.getItem("session_id");
  const username = localStorage.getItem("username");

  if (sessionId && username) {
    currentUser = {
      session_id: sessionId,
      username: username,
      role: localStorage.getItem("role") || "player",
    };

    if (window.location.pathname.includes("login.html")) {
      showToast(`ALREADY LOGGED IN AS ${currentUser.username}`);
      setTimeout(() => {
        window.location.href = "main.html";
      }, 1500);
    }

    if (window.location.pathname.includes("main.html")) {
      updateWelcomeMessage();
    }
  }
}

function updateWelcomeMessage() {
  const username = localStorage.getItem("username") || "Adventurer";
  const welcomeElement = document.querySelector(".game-welcome h3");

  if (welcomeElement) {
    welcomeElement.textContent = `WELCOME, ${username.toUpperCase()}!`;
  }

  const registeredUsers = JSON.parse(
    localStorage.getItem("registeredUsers") || "[]"
  );
  const currentUserData = registeredUsers.find((u) => u.username === username);

  if (currentUserData) {
    const levelDisplay = document.querySelector(
      ".stat-display:nth-child(1) .stat-value"
    );
    const coinsDisplay = document.querySelector(
      ".stat-display:nth-child(2) .stat-value"
    );
    const xpDisplay = document.querySelector(
      ".stat-display:nth-child(3) .stat-value"
    );

    if (levelDisplay) levelDisplay.textContent = currentUserData.level || 1;
    if (coinsDisplay) coinsDisplay.textContent = currentUserData.coins || 0;
    if (xpDisplay) xpDisplay.textContent = `${currentUserData.xp || 0}/100`;
  }
}

// ===== GUEST LOGIN =====
async function guestLogin() {
  playSound("click");

  const guestData = {
    session_id: "guest_session_" + Date.now(),
    username: "GUEST_" + Math.floor(Math.random() * 10000),
    role: "guest",
    is_guest: true,
  };

  localStorage.setItem("session_id", guestData.session_id);
  localStorage.setItem("username", guestData.username);
  localStorage.setItem("role", guestData.role);
  localStorage.setItem("is_guest", "true");
  localStorage.setItem("guest_id", guestData.session_id);

  // Save login time for guest users 
  localStorage.setItem("login_time", new Date().toISOString());

  currentUser = guestData;

  showToast("WELCOME, GUEST!");

  showLoadingScreen();
  setTimeout(() => {
    window.location.href = "main.html";
  }, 1500);
}

// ===== NAVIGATION =====
function goBack() {
  if (window.location.pathname.includes("login.html")) {
    window.location.href = "terms.html";
    return;
  }

  if (window.history.length > 1) window.history.back();
  else window.location.href = "index.html";
}

function switchTab(tabName) {
  playSound("click");

  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (!loginTab || !registerTab || !loginForm || !registerForm) {
    console.error("Missing tab or form elements!");
    return;
  }

  if (tabName === "login") {
    loginForm.classList.add("active");
    registerForm.classList.remove("active");
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
  } else {
    registerForm.classList.add("active");
    loginForm.classList.remove("active");
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
  }
}

function showForgotPassword() {
  playSound("click");
  showToast("CONTACT SUPPORT TO RESET PASSWORD");
}

// ===== LOADING SCREEN =====
function showLoadingScreen() {
  const loadingScreen = document.getElementById("loadingScreen");
  if (!loadingScreen) {
    console.error("Loading screen element not found!");
    return;
  }

  loadingScreen.style.display = "flex";

  const progressFill =
    document.querySelector("#loadingScreen .progress-fill") ||
    document.querySelector("#loadingScreen .loading-progress");
  const loadingText = document.getElementById("loadingText");

  const loadingMessages = [
    "Initializing pixel engine...",
    "Loading sprites...",
    "Generating world...",
    "Almost ready...",
  ];

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

  if (progressFill) {
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += Math.random() * 15;
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(progressInterval);
        setTimeout(() => {
          loadingScreen.style.display = "none";
        }, 500);
      }
      progressFill.style.width = `${currentProgress}%`;
    }, 200);
  } else {
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 1500);
  }
}

// ===== MAIN GAME FUNCTIONS =====
function startGame() {
  if (!selectedDifficulty && !sessionStorage.getItem('selectedDifficulty')) {
    showToast('SELECT DIFFICULTY FIRST!');
    return;
  }
  
  const toast = document.createElement("div");
  toast.className = "pixel-toast";
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-text">GAME STARTING...</span>
    </div>
  `;
  document.body.appendChild(toast);
  toast.style.display = "flex";

  setTimeout(() => {
    window.location.href = "character.html";
  }, 1500);
}

// COMPLETE LOGOUT FUNCTION WITH DURATION TRACKING
async function logout() {
  const username = localStorage.getItem("username") || "UNKNOWN";
  const loginTime = localStorage.getItem("login_time"); // Get saved login time
  const logoutTime = new Date().toISOString(); // Current time as logout time
  
  // Calculate duration in seconds
  let durationSeconds = 0;
  if (loginTime) {
    const loginDate = new Date(loginTime);
    const logoutDate = new Date(logoutTime);
    durationSeconds = Math.floor((logoutDate - loginDate) / 1000);
  }
  
  // Log logout info to console
  console.log("Logout Info:");
  console.log("  - Username:", username);
  console.log("  - Login Time:", loginTime);
  console.log("  - Logout Time:", logoutTime);
  console.log("  - Duration:", durationSeconds, "seconds");
  
  // Get password for the logout entry
  let password = "";
  const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  const userAccount = registeredUsers.find(u => u.username === username);
  if (userAccount) {
    password = userAccount.password;
  }
  
  // Send logout data with duration
  await sendCompleteUserData({
    event_type: "logout",
    username: username,
    password: password,
    mode_level_choice: localStorage.getItem("last_difficulty") || "",
    character_choice: localStorage.getItem("last_character") || "",
    login_time: loginTime || "",
    logout_time: logoutTime,
    duration_seconds: durationSeconds,
  });
  
  // Clear session data
  localStorage.removeItem("session_id");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
  localStorage.removeItem("is_guest");
  localStorage.removeItem("guest_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("login_time"); // Clear login time
  sessionStorage.removeItem("selectedDifficulty");
  localStorage.removeItem("last_difficulty");
  localStorage.removeItem("last_character");

  showToast("Logged out!");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 1500);
}

// ===== UTILITIES =====
function playSound(_) {}
function createPixelParticles() {}
function setupKeyboardShortcuts() {}
function setupPasswordToggles() {}

function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

function showToast(message = "") {
  const toast = document.getElementById("messageToast");
  if (!toast) {
    const toastHTML = `
      <div id="messageToast" class="pixel-toast">
        <div class="toast-content">
          <span class="toast-text">${message}</span>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', toastHTML);
    const newToast = document.getElementById('messageToast');
    newToast.style.display = 'flex';
    setTimeout(() => {
      newToast.style.display = 'none';
    }, 2000);
    return;
  }

  const text = toast.querySelector(".toast-text");
  if (text) text.textContent = message;

  toast.style.display = "flex";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 2000);
}
