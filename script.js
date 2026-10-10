
"use strict";

const STORAGE_KEY = "bmiBuddyDataV1";
const ASSESSMENT_STORAGE_KEY = "bmiBuddyAssessmentsV1";
const ACCOUNT_STORAGE_KEY = "bmiBuddyAccountsV1";
const SESSION_STORAGE_KEY = "bmiBuddyDemoSessionV1";

let appData = {
  version: 1,
  profiles: [],
  selectedProfileId: null
};

let assessmentData = {};
let accountData = [];

const $ = (id) => document.getElementById(id);

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "profile-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function todayString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 1) {
  const number = numberValue(value);
  return number === null ? "—" : number.toFixed(digits);
}

function formatDate(dateString) {
  if (!dateString) return "Date not recorded";

  const date = new Date(dateString + "T12:00:00");
  if (Number.isNaN(date.getTime())) return "Date not recorded";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function calculateBMI(height, weight) {
  const h = numberValue(height);
  const w = numberValue(weight);

  if (h === null || w === null || h <= 0 || w <= 0) return null;
  return w / ((h / 100) ** 2);
}

function bmiDescription(age, bmi) {
  if (bmi === null) return "Add valid measurements";
  if (age < 20) return "Age-specific BMI assessment needed";
  if (bmi < 18.5) return "Below the adult reference range";
  if (bmi < 25) return "Within the adult reference range";
  if (bmi < 30) return "Above the adult reference range";
  return "Higher adult reference range";
}

function cmToFeetInches(cm) {
  const totalInches = Number(cm) / 2.54;
  return {
    feet: Math.floor(totalInches / 12),
    inches: Math.round(totalInches % 12)
  };
}

function readHeight(prefix) {
  const cmId = prefix === "profile" ? "profileHeight" : "measurementHeight";
  const feetId = prefix === "profile" ? "profileHeightFeet" : "measurementHeightFeet";
  const inchesId = prefix === "profile" ? "profileHeightInches" : "measurementHeightInches";

  const cmRaw = $(cmId).value.trim();
  const feetRaw = $(feetId).value.trim();
  const inchesRaw = $(inchesId).value.trim();

  if (cmRaw) return Number(cmRaw);
  if (!feetRaw && !inchesRaw) return NaN;

  const feet = feetRaw ? Number(feetRaw) : 0;
  const inches = inchesRaw ? Number(inchesRaw) : 0;

  if (!Number.isFinite(feet) || !Number.isFinite(inches) ||
      feet < 0 || inches < 0 || inches > 11) {
    return NaN;
  }

  return (feet * 12 + inches) * 2.54;
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch (error) {
    console.error("Could not save BMI Buddy data:", error);
    showToast("Could not save data. Check browser storage or download a backup.");
    return false;
  }
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved);

    if (!parsed || parsed.version !== 1 ||
        !Array.isArray(parsed.profiles) ||
        !parsed.profiles.every(isValidProfile)) {
      throw new Error("Saved data format is not valid.");
    }

    appData.profiles = parsed.profiles.map(cleanProfile);

    const selectedExists = appData.profiles.some(
      (profile) => profile.id === parsed.selectedProfileId
    );

    appData.selectedProfileId = selectedExists
      ? parsed.selectedProfileId
      : (appData.profiles[0]?.id || null);
  } catch (error) {
    console.error("Could not load BMI Buddy data:", error);
    showToast("Saved data could not be read. If you have a backup, use Restore Data.");
  }
}

function loadAssessments() {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) || "{}");
    assessmentData = saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch (_) {
    assessmentData = {};
  }
}

function saveAssessments() {
  try {
    localStorage.setItem(ASSESSMENT_STORAGE_KEY, JSON.stringify(assessmentData));
    return true;
  } catch (error) {
    console.error("Could not save assessment:", error);
    showToast("Could not save the assessment. Check browser storage.");
    return false;
  }
}

function isValidRecord(record) {
  if (!record || typeof record !== "object") return false;

  const height = numberValue(record.height);
  const weight = numberValue(record.weight);

  return typeof record.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    height !== null && height >= 50 && height <= 250 &&
    weight !== null && weight >= 2 && weight <= 500;
}

function isValidProfile(profile) {
  if (!profile || typeof profile !== "object") return false;

  const age = numberValue(profile.age);

  return typeof profile.id === "string" &&
    profile.id.length > 0 &&
    typeof profile.name === "string" &&
    profile.name.trim().length > 0 &&
    profile.name.length <= 60 &&
    age !== null && age >= 2 && age <= 120 &&
    ["female", "male", "unspecified"].includes(profile.sex) &&
    ["balanced", "activity", "sleep", "nutrition", "energy"].includes(profile.goal) &&
    Array.isArray(profile.records) &&
    profile.records.every(isValidRecord);
}

function cleanRecord(record) {
  return {
    date: record.date,
    height: Number(record.height),
    weight: Number(record.weight),
    note: String(record.note || "").slice(0, 300),
    createdAt: numberValue(record.createdAt) || Date.now()
  };
}

function cleanProfile(profile) {
  return {
    id: profile.id,
    name: profile.name.trim(),
    age: Number(profile.age),
    sex: profile.sex,
    goal: profile.goal,
    records: profile.records.map(cleanRecord)
  };
}

function getSelectedProfile() {
  return appData.profiles.find(
    (profile) => profile.id === appData.selectedProfileId
  ) || null;
}

function getLatestRecord(profile) {
  if (!profile || !Array.isArray(profile.records) || !profile.records.length) {
    return null;
  }

  return [...profile.records].sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date);
    return dateComparison || ((b.createdAt || 0) - (a.createdAt || 0));
  })[0];
}

function goalLabel(goal) {
  const labels = {
    balanced: "Balanced daily habits",
    activity: "Enjoyable movement",
    sleep: "Sleep routine",
    nutrition: "Meal routine",
    energy: "Everyday energy"
  };

  return labels[goal] || labels.balanced;
}

function openProfileDialog() {
  $("profileForm").reset();
  $("profileDialog").showModal();
  $("profileName").focus();
}

function closeProfileDialog() {
  $("profileDialog").close();
}

function createProfile(event) {
  event.preventDefault();

  const name = $("profileName").value.trim();
  const age = Number($("profileAge").value);
  const sex = $("profileSex").value;
  const height = readHeight("profile");
  const weight = Number($("profileWeight").value);
  const goal = $("profileGoal").value;

  if (!name || name.length > 60) {
    showToast("Please enter a name of up to 60 characters.");
    return;
  }

  if (!Number.isFinite(age) || age < 2 || age > 120) {
    showToast("Please enter an age between 2 and 120 years.");
    return;
  }

  if (!["female", "male", "unspecified"].includes(sex)) {
    showToast("Please select a profile option.");
    return;
  }

  if (!Number.isFinite(height) || height < 50 || height > 250) {
    showToast("Please enter a height between 50 and 250 cm.");
    return;
  }

  if (!Number.isFinite(weight) || weight < 2 || weight > 500) {
    showToast("Please enter a weight between 2 and 500 kg.");
    return;
  }

  const profile = {
    id: makeId(),
    name,
    age,
    sex,
    goal,
    records: [{
      date: todayString(),
      height,
      weight,
      note: "Initial entry",
      createdAt: Date.now()
    }]
  };

  appData.profiles.push(profile);
  appData.selectedProfileId = profile.id;

  if (!saveData()) return;

  $("profileDialog").close();
  renderApp();
  showToast("Profile created successfully.");
}

function renderApp() {
  renderProfileCards();
  renderProfileDetails();
}

function renderProfileCards() {
  const list = $("profileList");
  const empty = $("emptyState");
  list.innerHTML = "";

  if (!appData.profiles.length) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  appData.profiles.forEach((profile) => {
    const latest = getLatestRecord(profile);
    const bmi = latest ? calculateBMI(latest.height, latest.weight) : null;
    const active = profile.id === appData.selectedProfileId;

    const card = document.createElement("article");
    card.className = "profile-card" + (active ? " active" : "");

    card.innerHTML = `
      <div class="profile-card-top">
        <div class="avatar">${escapeHTML(profile.name.charAt(0).toUpperCase())}</div>
        <div>
          <h3>${escapeHTML(profile.name)}</h3>
          <p class="profile-meta">${profile.age} years old</p>
        </div>
      </div>
      <p class="muted small-copy">
        ${latest ? "Latest entry: " + escapeHTML(formatDate(latest.date)) : "No measurements yet"}
      </p>
      <div class="profile-bmi">
        <strong>${bmi === null ? "—" : formatNumber(bmi, 1)}</strong>
        <span>BMI calculation</span>
      </div>
      <button class="button ${active ? "button-primary" : "button-secondary"}"
        type="button" data-select-profile="${escapeHTML(profile.id)}">
        ${active ? "Currently selected" : "Open profile"}
      </button>
    `;

    list.appendChild(card);
  });
}

function renderProfileDetails() {
  const section = $("profileDetails");
  const profile = getSelectedProfile();

  if (!profile) {
    section.classList.add("hidden");
    renderRoadmap(null);
    return;
  }

  section.classList.remove("hidden");

  const latest = getLatestRecord(profile);
  const bmi = latest ? calculateBMI(latest.height, latest.weight) : null;

  $("selectedName").textContent = profile.name + "'s wellness dashboard";
  $("selectedSubtitle").textContent =
    `${profile.age} years old · ${goalLabel(profile.goal)}`;

  if (latest) {
    const parts = cmToFeetInches(latest.height);
    $("heightStat").textContent =
      `${formatNumber(latest.height, 1)} cm · ${parts.feet} ft ${parts.inches} in`;
  } else {
    $("heightStat").textContent = "—";
  }

  $("weightStat").textContent = latest ? formatNumber(latest.weight) : "—";
  $("bmiStat").textContent = bmi === null ? "—" : formatNumber(bmi, 1);
  $("bmiFoot").textContent = bmiDescription(profile.age, bmi);
  $("recordsStat").textContent = profile.records.length;

  $("measurementHeight").value = latest ? formatNumber(latest.height, 1) : "";
  const parts = latest ? cmToFeetInches(latest.height) : { feet: "", inches: "" };
  $("measurementHeightFeet").value = latest ? parts.feet : "";
  $("measurementHeightInches").value = latest ? parts.inches : "";
  $("measurementWeight").value = latest ? latest.weight : "";
  $("measurementDate").value = todayString();
  $("measurementNote").value = "";

  renderAssessmentForm();
  renderHistory(profile);
}

function renderAssessmentForm() {
  const profile = getSelectedProfile();
  const form = $("assessmentForm");
  if (!form) return;

  if (!profile) {
    form.classList.remove("hidden");
    $("editAssessmentBtn").classList.add("hidden");
    $("assessmentSavedNotice").classList.add("hidden");
    renderRoadmap(null);
    return;
  }

  const data = assessmentData[profile.id];
  form.reset();

  if (data) {
    Object.entries(data).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field && typeof value === "string") field.value = value;
    });

    form.classList.add("hidden");
    $("editAssessmentBtn").classList.remove("hidden");
    $("assessmentSavedNotice").textContent =
      "Personal assessment saved. Your answers are reused automatically; edit them only when your routine changes.";
    $("assessmentSavedNotice").classList.remove("hidden");
  } else {
    form.classList.remove("hidden");
    $("editAssessmentBtn").classList.add("hidden");
    $("assessmentSavedNotice").classList.add("hidden");
  }

  renderRoadmap(profile);
}

function generatePersonalPlan(event) {
  event.preventDefault();

  const profile = getSelectedProfile();
  if (!profile) {
    showToast("Please create or select a profile first.");
    return;
  }

  const form = $("assessmentForm");
  const previous = assessmentData[profile.id] || {};
  const data = {};

  new FormData(form).forEach((value, key) => {
    data[key] = String(value).trim();
  });

  data.planMonths = String(Math.max(1, Math.min(12, Number(data.planMonths) || 1)));

  // Preserve journey progress when the assessment is edited.
  data.planStartedAt = previous.planStartedAt || null;
  data.weekHabits = previous.weekHabits || {};
  data.reviews = previous.reviews || {};
  data.journeyNotes = previous.journeyNotes || [];

  assessmentData[profile.id] = data;
  if (!saveAssessments()) return;

  renderAssessmentForm();
  renderRoadmap(profile);
  showToast("Assessment saved and your personal plan is ready.");
  $("planSummary").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function beginPlan() {
  const profile = getSelectedProfile();
  if (!profile || !assessmentData[profile.id]) return;

  const data = assessmentData[profile.id];
  if (!data.planStartedAt) data.planStartedAt = todayString();

  if (!saveAssessments()) return;
  renderRoadmap(profile);
  showToast("Your journey has started. Your progress will stay saved in this browser.");
}

function setWeekHabit(week, habitKey, checked) {
  const profile = getSelectedProfile();
  if (!profile || !assessmentData[profile.id]) return;

  const data = assessmentData[profile.id];
  data.weekHabits = data.weekHabits || {};
  data.weekHabits[week] = data.weekHabits[week] || {};
  data.weekHabits[week][habitKey] = Boolean(checked);

  saveAssessments();
}

function saveWeeklyReview(week) {
  const profile = getSelectedProfile();
  if (!profile || !assessmentData[profile.id]) return;

  const data = assessmentData[profile.id];
  const form = $("weeklyReviewForm");
  if (!form) return;

  const values = {};
  new FormData(form).forEach((value, key) => {
    values[key] = String(value);
  });

  data.reviews = data.reviews || {};
  data.reviews[week] = { ...values, reviewedAt: todayString() };
  data.journeyNotes = data.journeyNotes || [];
  data.journeyNotes.push({
    date: todayString(),
    week,
    note: (values.reviewNote || "").slice(0, 500)
  });

  if (!saveAssessments()) return;

  renderRoadmap(profile);
  showToast(`Week ${week} review saved.`);
}

function estimateMealCalories(text) {
  const source = String(text || "").toLowerCase();
  if (!source.trim()) return null;

  const foods = [
    [/\b(roti|rotis|chapati|chapatis)\b/g, 100],
    [/\b(paratha|parathas)\b/g, 250],
    [/\b(puri|puris)\b/g, 100],
    [/\b(rice|chawal)\b/g, 210],
    [/\b(dal|daal)\b/g, 150],
    [/\b(sabzi|vegetable curry|curry)\b/g, 130],
    [/\b(poha)\b/g, 250],
    [/\b(upma)\b/g, 250],
    [/\b(idli|idlis)\b/g, 60],
    [/\b(dosa|dosas)\b/g, 200],
    [/\b(milk|doodh)\b/g, 125],
    [/\b(egg|eggs)\b/g, 75],
    [/\b(bread slice|bread)\b/g, 80],
    [/\b(banana|bananas)\b/g, 100],
    [/\b(apple|apples)\b/g, 95],
    [/\b(curd|yogurt)\b/g, 100],
    [/\b(paneer)\b/g, 200],
    [/\b(chole|chickpeas|rajma)\b/g, 220],
    [/\b(chicken)\b/g, 220],
    [/\b(samosa|samosas)\b/g, 250],
    [/\b(biscuit|biscuits|cookie|cookies)\b/g, 45],
    [/\b(chips|crisps)\b/g, 150],
    [/\b(juice)\b/g, 120],
    [/\b(tea|chai)\b/g, 70],
    [/\b(coffee)\b/g, 80],
    [/\b(oats)\b/g, 180],
    [/\b(salad)\b/g, 70]
  ];

  let total = 0;
  let found = false;

  for (const [pattern, calories] of foods) {
    const matches = [...source.matchAll(pattern)];

    for (const match of matches) {
      found = true;
      const before = source.slice(Math.max(0, match.index - 12), match.index);
      const quantityMatch = before.match(/(\d+)\s*(?:small|medium|large)?\s*$/);
      const quantity = quantityMatch
        ? Math.min(10, Math.max(1, Number(quantityMatch[1])))
        : 1;

      total += calories * quantity;
    }
  }

  if (!found) return null;

  return {
    low: Math.max(0, Math.round(total * 0.7 / 10) * 10),
    high: Math.round(total * 1.3 / 10) * 10
  };
}

function getMealEstimateSummary(data) {
  const meals = [
    ["Breakfast", data.breakfastFoods],
    ["Lunch", data.lunchFoods],
    ["Dinner", data.dinnerFoods],
    ["Snacks and drinks", data.snackFoods]
  ];

  const estimates = meals.map(([label, text]) => ({
    label,
    estimate: estimateMealCalories(text)
  }));

  const available = estimates.filter((item) => item.estimate);

  if (!available.length) {
    return "<p>Add common food names to your meal notes for a very rough estimate. Portion sizes and recipes can change results substantially.</p>";
  }

  const low = available.reduce((sum, item) => sum + item.estimate.low, 0);
  const high = available.reduce((sum, item) => sum + item.estimate.high, 0);

  const rows = estimates.map((item) =>
    `<li>${escapeHTML(item.label)}: ${item.estimate
      ? `about ${item.estimate.low}–${item.estimate.high} kcal`
      : "not estimated from the description"}</li>`
  ).join("");

  return `<p><strong>Very rough food-log estimate:</strong> ${low}–${high} kcal across the entries recognized.</p><ul>${rows}</ul><p class="field-hint">This keyword estimate is not a nutrition database. It can miss ingredients, oils, sauces and serving sizes. It is not a daily calorie target or medical advice.</p>`;
}

function getPlanAdvice(profile, data) {
  const advice = [];

  if (!data.waterGlasses || data.waterGlasses === "unsure" || data.waterGlasses === "0-2") {
    advice.push("Keep water within reach and drink regularly across the day. Needs vary with weather, activity and health.");
  }

  if (data.breakfastFoods || data.lunchFoods || data.dinnerFoods) {
    advice.push("Look for variety across meals: include grains, protein foods, fruit or vegetables when available.");
  } else {
    advice.push("Write down your usual meals with rough portions to make your food routine easier to review.");
  }

  if (data.activityType === "none" || data.activityDays === "0") {
    advice.push("Try comfortable movement such as walking, stretching, dancing or a sport you enjoy. Start gently.");
  } else {
    advice.push("Keep activity enjoyable and manageable, with rest and gradual changes rather than sudden intensity.");
  }

  if (data.sleepHours === "under6" || data.sleepHours === "6-7") {
    advice.push("Consider a consistent wind-down routine and sleep schedule. Teenagers generally need more sleep than adults.");
  }

  if (data.screenHours === "4-6" || data.screenHours === "6+") {
    advice.push("Try one practical screen break, such as putting your phone away during meals or before bedtime.");
  }

  if (data.wakeTime && data.sleepTime) {
    advice.push(`Your usual wake-up time is ${data.wakeTime} and sleep time is ${data.sleepTime}. Try to keep a fairly consistent routine when possible.`);
  }

  if (profile.age < 20) {
    advice.push("Because you are under 20, BMI and nutrition needs require age-appropriate interpretation. This app will not set a calorie limit or weight-change deadline.");
  } else {
    advice.push("BMI is a screening measure, not a diagnosis. Individual needs and medical context matter.");
  }

  return advice;
}

function getHabitPhases(data) {
  const sleepHabit = (data.sleepHours === "under6" || data.sleepHours === "6-7")
    ? "Set a realistic wind-down time and keep sleep/wake times fairly consistent."
    : "Keep a steady sleep and wake routine that suits your age and schedule.";

  const waterHabit = (!data.waterGlasses ||
    data.waterGlasses === "0-2" ||
    data.waterGlasses === "3-5" ||
    data.waterGlasses === "unsure")
    ? "Keep water accessible and take regular drink breaks."
    : "Keep your usual hydration routine and drink when thirsty.";

  const mealHabit = "Keep regular meals where possible and add variety from grains, protein foods, fruit or vegetables. Do not skip meals or ban foods.";

  const movementHabit = (data.activityType === "none" || data.activityDays === "0")
    ? "Try a comfortable movement break, such as a short walk, stretching, dancing or a sport."
    : "Continue your chosen activity at a manageable level, allowing rest and recovery.";

  const screenHabit = (data.screenHours === "4-6" || data.screenHours === "6+")
    ? "Add one practical screen break during meals or study sessions."
    : "Take comfortable movement and eye breaks during long screen or study sessions.";

  return [
    {
      title: "Settle your sleep routine",
      intro: "Start with one stable daily anchor before adding more tasks.",
      habits: [
        sleepHabit,
        "Choose a simple bedtime wind-down cue, such as preparing tomorrow's bag."
      ]
    },
    {
      title: "Build a steady meal rhythm",
      intro: "Keep your first habits and add practical food-routine support.",
      habits: [
        sleepHabit,
        mealHabit,
        "Plan a convenient meal option for busy days."
      ]
    },
    {
      title: "Make hydration easier",
      intro: "Keep sleep and meal habits, and add a realistic water routine.",
      habits: [sleepHabit, mealHabit, waterHabit]
    },
    {
      title: "Add enjoyable movement",
      intro: "Keep previous habits and introduce movement without sudden intensity.",
      habits: [sleepHabit, mealHabit, waterHabit, movementHabit]
    },
    {
      title: "Create useful screen breaks",
      intro: "Keep existing habits and make long sitting or screen time easier to manage.",
      habits: [sleepHabit, mealHabit, waterHabit, movementHabit, screenHabit]
    },
    {
      title: "Plan for busy days",
      intro: "Practise your habits on busy days with flexible alternatives.",
      habits: [
        sleepHabit,
        mealHabit,
        waterHabit,
        movementHabit,
        screenHabit,
        "Choose a simple backup option for a busy day."
      ]
    },
    {
      title: "Check energy and routine",
      intro: "Notice what supports your everyday energy, focus and comfort.",
      habits: [
        sleepHabit,
        mealHabit,
        waterHabit,
        movementHabit,
        screenHabit,
        "Notice energy, concentration, mood and comfort; progress is more than a scale number."
      ]
    },
    {
      title: "Review and make it sustainable",
      intro: "Keep helpful habits and adjust anything that does not fit your life.",
      habits: [
        sleepHabit,
        mealHabit,
        waterHabit,
        movementHabit,
        screenHabit,
        "Choose habits you want to continue and one small adjustment for next week."
      ]
    }
  ];
}

function renderRoadmap(profile) {
  const roadmap = $("roadmap");
  const summary = $("planSummary");
  const controls = $("planControls");
  const reviewPanel = $("weeklyReviewPanel");

  if (!roadmap || !summary || !controls || !reviewPanel) return;

  if (!profile) {
    roadmap.innerHTML = "";
    summary.innerHTML = "";
    controls.innerHTML = "";
    reviewPanel.classList.add("hidden");
    return;
  }

  const data = assessmentData[profile.id];

  if (!data) {
    summary.innerHTML = "<h4>Your personalized plan will appear here</h4><p>Complete the Personal Health Assessment to build your habit plan. Your progress history remains separate.</p>";
    controls.innerHTML = "";
    roadmap.innerHTML = "";
    reviewPanel.classList.add("hidden");
    return;
  }

  const latest = getLatestRecord(profile);
  const bmi = latest ? calculateBMI(latest.height, latest.weight) : null;

  const bmiText = bmi === null
    ? "Add a measurement whenever you want to see your BMI calculation."
    : profile.age < 20
      ? `Your calculated BMI is ${formatNumber(bmi, 1)}. Under 20, BMI needs age-specific interpretation rather than adult cut-offs.`
      : `Your calculated BMI is ${formatNumber(bmi, 1)}. ${bmiDescription(profile.age, bmi)}. BMI alone does not determine an individual's health or an ideal target.`;

  const advice = getPlanAdvice(profile, data);
  const months = Math.max(1, Math.min(12, Number(data.planMonths) || 1));
  const totalWeeks = months * 4;
  const phases = getHabitPhases(data);
  const reviews = data.reviews || {};

  const completedReviews = Object.keys(reviews).filter((key) => {
    const weekNumber = Number(key);
    return Number.isInteger(weekNumber) &&
      weekNumber >= 1 &&
      weekNumber <= totalWeeks &&
      reviews[key];
  }).length;

  const durationLabel = months === 1 ? "1-month" : `${months}-month`;

  summary.innerHTML = `
    <h4>${durationLabel} personal habit journey</h4>
    <p>${escapeHTML(bmiText)}</p>
    <p><strong>Progress:</strong> ${completedReviews} of ${totalWeeks} weekly reviews saved.</p>
    <h4>Food routine review</h4>
    ${getMealEstimateSummary(data)}
    <h4>Personal guidance</h4>
    <ul>${advice.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
  `;

  if (!data.planStartedAt) {
    controls.innerHTML = `
      <p>Your assessment is saved. Press Start Plan when you're ready. Habits will build gradually and earlier habits will continue in later weeks.</p>
      <button type="button" id="startPlanBtn" class="button button-primary">Start Plan</button>
    `;
    roadmap.innerHTML = "";
    reviewPanel.classList.add("hidden");
    return;
  }

  const startDate = new Date(data.planStartedAt + "T12:00:00");
  const today = new Date(todayString() + "T12:00:00");
  const elapsedDays = Math.max(0, Math.floor((today - startDate) / 86400000));
  const activeWeek = Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);

  controls.innerHTML = `
    <div class="journey-status">
      <strong>Journey started:</strong> ${escapeHTML(formatDate(data.planStartedAt))}
      <span> · Week ${activeWeek} of ${totalWeeks}</span>
    </div>
    <p class="field-hint">Tick tasks as you work on them. Your ticks and weekly reviews are saved separately from measurement history.</p>
  `;

  /*
   * FIXED MONTH FORMAT:
   * Each month gets its own heading and contains four weekly cards.
   * A two-month plan therefore displays Month 1 and Month 2 separately.
   */
  let monthSections = "";

  for (let month = 1; month <= months; month++) {
    let weekCards = "";

    const firstWeek = (month - 1) * 4 + 1;
    const lastWeek = Math.min(month * 4, totalWeeks);

    for (let week = firstWeek; week <= lastWeek; week++) {
      const weekIndex = week - 1;
      const phaseIndex = Math.min(7, Math.floor(weekIndex * 8 / totalWeeks));
      const phase = phases[phaseIndex];

      const savedHabits = (data.weekHabits || {})[week] || {};
      const review = reviews[week];

      const habitMarkup = phase.habits.map((habit, index) => {
        const key = `habit-${index}`;

        return `
          <label class="habit-check">
            <input type="checkbox"
              data-week-habit="${week}"
              data-habit-key="${key}"
              ${savedHabits[key] ? "checked" : ""}>
            <span>${escapeHTML(habit)}</span>
          </label>
        `;
      }).join("");

      const reviewMarkup = review
        ? `<p class="review-saved"><strong>Review saved:</strong> ${escapeHTML(formatDate(review.reviewedAt))}. Food: ${escapeHTML(review.food || "—")}; water: ${escapeHTML(review.water || "—")}; sleep: ${escapeHTML(review.sleep || "—")}; activity: ${escapeHTML(review.activity || "—")}.</p>`
        : `<button type="button" class="button button-secondary" data-open-review="${week}">Complete Week ${week} Review</button>`;

      weekCards += `
        <article class="roadmap-card ${review ? "roadmap-reviewed" : ""}">
          <span class="week">Week ${week}</span>
          <h4>${escapeHTML(phase.title)}</h4>
          <p>${escapeHTML(phase.intro)}</p>
          <div class="week-habits">
            <strong>Habits to keep practising</strong>
            ${habitMarkup}
          </div>
          ${reviewMarkup}
        </article>
      `;
    }

    monthSections += `
      <section class="roadmap-month">
        <h4 class="roadmap-month-title">Month ${month}</h4>
        <div class="roadmap-month-grid">${weekCards}</div>
      </section>
    `;
  }

  roadmap.innerHTML = monthSections;
  reviewPanel.classList.add("hidden");
  reviewPanel.innerHTML = "";
}

function openWeeklyReview(week) {
  const profile = getSelectedProfile();
  if (!profile || !assessmentData[profile.id]) return;

  const data = assessmentData[profile.id];
  const existing = (data.reviews || {})[week] || {};
  const reviewPanel = $("weeklyReviewPanel");

  reviewPanel.innerHTML = `
    <h3>Week ${week} review</h3>
    <p>Be honest and kind to yourself. “Partly” or “not yet” helps you adjust the plan; it is not a failure.</p>
    <form id="weeklyReviewForm" class="form-stack">
      <label>How did your food/meal routine go?
        <select name="food" required>
          <option value="">Choose one</option>
          <option value="yes" ${existing.food === "yes" ? "selected" : ""}>Mostly followed</option>
          <option value="partly" ${existing.food === "partly" ? "selected" : ""}>Partly followed</option>
          <option value="no" ${existing.food === "no" ? "selected" : ""}>Not yet</option>
          <option value="na" ${existing.food === "na" ? "selected" : ""}>Not a task this week</option>
        </select>
      </label>
      <label>How did your water routine go?
        <select name="water" required>
          <option value="">Choose one</option>
          <option value="yes" ${existing.water === "yes" ? "selected" : ""}>Mostly followed</option>
          <option value="partly" ${existing.water === "partly" ? "selected" : ""}>Partly followed</option>
          <option value="no" ${existing.water === "no" ? "selected" : ""}>Not yet</option>
          <option value="na" ${existing.water === "na" ? "selected" : ""}>Not a task this week</option>
        </select>
      </label>
      <label>How did your sleep routine go?
        <select name="sleep" required>
          <option value="">Choose one</option>
          <option value="yes" ${existing.sleep === "yes" ? "selected" : ""}>Mostly followed</option>
          <option value="partly" ${existing.sleep === "partly" ? "selected" : ""}>Partly followed</option>
          <option value="no" ${existing.sleep === "no" ? "selected" : ""}>Not yet</option>
          <option value="na" ${existing.sleep === "na" ? "selected" : ""}>Not a task this week</option>
        </select>
      </label>
      <label>How did movement/activity go?
        <select name="activity" required>
          <option value="">Choose one</option>
          <option value="yes" ${existing.activity === "yes" ? "selected" : ""}>Mostly followed</option>
          <option value="partly" ${existing.activity === "partly" ? "selected" : ""}>Partly followed</option>
          <option value="no" ${existing.activity === "no" ? "selected" : ""}>Not yet</option>
          <option value="na" ${existing.activity === "na" ? "selected" : ""}>Not a task this week</option>
        </select>
      </label>
      <label>Other tasks and how the week felt
        <textarea name="reviewNote" rows="3" maxlength="500" placeholder="What went well? What would make next week easier?">${escapeHTML(existing.reviewNote || "")}</textarea>
      </label>
      <div class="button-row">
        <button type="submit" class="button button-primary">Save weekly review</button>
        <button type="button" id="cancelReviewBtn" class="button button-secondary">Cancel</button>
      </div>
    </form>
  `;

  reviewPanel.classList.remove("hidden");
  reviewPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  $("weeklyReviewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveWeeklyReview(week);
  });

  $("cancelReviewBtn").addEventListener("click", () => {
    reviewPanel.classList.add("hidden");
  });
}

function renderHistory(profile) {
  const history = $("historyList");

  if (!profile.records.length) {
    history.innerHTML = `<div class="no-records">No progress entries yet. Add a measurement above to begin.</div>`;
    return;
  }

  const sorted = [...profile.records].sort((a, b) => {
    const comparison = b.date.localeCompare(a.date);
    return comparison || ((b.createdAt || 0) - (a.createdAt || 0));
  });

  history.innerHTML = sorted.map((record) => {
    const bmi = calculateBMI(record.height, record.weight);
    const parts = cmToFeetInches(record.height);

    return `
      <div class="history-entry">
        <div>
          <strong>${escapeHTML(formatDate(record.date))}</strong>
          <p>Height: ${formatNumber(record.height, 1)} cm (${parts.feet} ft ${parts.inches} in) · Weight: ${formatNumber(record.weight)} kg</p>
          ${record.note ? `<p>${escapeHTML(record.note)}</p>` : ""}
        </div>
        <div class="history-values">
          <span>BMI: <strong>${bmi === null ? "—" : formatNumber(bmi, 1)}</strong></span>
          <button type="button" data-delete-record="${escapeHTML(String(record.createdAt))}">Delete entry</button>
        </div>
      </div>
    `;
  }).join("");
}

function addMeasurement(event) {
  event.preventDefault();

  const profile = getSelectedProfile();
  if (!profile) {
    showToast("Please create or select a profile first.");
    return;
  }

  const height = readHeight("measurement");
  const weight = Number($("measurementWeight").value);
  const date = $("measurementDate").value;
  const note = $("measurementNote").value.trim();

  if (!Number.isFinite(height) || height < 50 || height > 250) {
    showToast("Please enter a height between 50 and 250 cm.");
    return;
  }

  if (!Number.isFinite(weight) || weight < 2 || weight > 500) {
    showToast("Please enter a weight between 2 and 500 kg.");
    return;
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast("Please select a valid date.");
    return;
  }

  profile.records.push({
    date,
    height,
    weight,
    note: note.slice(0, 300),
    createdAt: Date.now()
  });

  if (!saveData()) return;

  renderApp();
  showToast("Progress entry saved.");
}

function deleteProfile() {
  const profile = getSelectedProfile();
  if (!profile) return;

  if (!window.confirm(`Delete ${profile.name}'s profile and all its progress records? This cannot be undone unless you have a backup.`)) {
    return;
  }

  appData.profiles = appData.profiles.filter((item) => item.id !== profile.id);
  appData.selectedProfileId = appData.profiles[0]?.id || null;

  delete assessmentData[profile.id];
  saveData();
  saveAssessments();
  renderApp();
  showToast("Profile deleted.");
}

function deleteRecord(createdAt) {
  const profile = getSelectedProfile();
  if (!profile) return;

  const record = profile.records.find(
    (item) => String(item.createdAt) === String(createdAt)
  );

  if (!record) {
    showToast("That entry could not be found.");
    return;
  }

  if (!window.confirm("Delete this progress entry?")) return;

  profile.records = profile.records.filter((item) => item !== record);

  if (!saveData()) return;

  renderApp();
  showToast("Progress entry deleted.");
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBackup() {
  const backup = {
    app: "BMI Buddy",
    version: 1,
    exportedAt: new Date().toISOString(),
    selectedProfileId: appData.selectedProfileId,
    profiles: appData.profiles
  };

  downloadFile(
    `BMI-Buddy-Backup-${todayString()}.json`,
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  showToast("Backup download started. Keep the file somewhere safe.");
}

function restoreBackupFile(file) {
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    showToast("This backup file is too large to restore.");
    $("restoreInput").value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));

      if (!parsed || parsed.app !== "BMI Buddy" ||
          parsed.version !== 1 ||
          !Array.isArray(parsed.profiles) ||
          !parsed.profiles.every(isValidProfile)) {
        throw new Error("This does not appear to be a valid BMI Buddy backup.");
      }

      const ids = parsed.profiles.map((profile) => profile.id);
      if (new Set(ids).size !== ids.length) {
        throw new Error("The backup contains duplicate profile IDs.");
      }

      if (!window.confirm("Restoring this backup will replace all profiles currently saved in this browser. Continue?")) {
        return;
      }

      const restoredProfiles = parsed.profiles.map(cleanProfile);

      appData = {
        version: 1,
        profiles: restoredProfiles,
        selectedProfileId: restoredProfiles.some(
          (profile) => profile.id === parsed.selectedProfileId
        )
          ? parsed.selectedProfileId
          : (restoredProfiles[0]?.id || null)
      };

      if (!saveData()) return;

      renderApp();
      showToast("Backup restored successfully.");
    } catch (error) {
      console.error("Restore failed:", error);
      showToast(error.message || "Could not restore this backup file.");
    } finally {
      $("restoreInput").value = "";
    }
  };

  reader.onerror = () => {
    showToast("Could not read the selected file.");
    $("restoreInput").value = "";
  };

  reader.readAsText(file);
}

function csvCell(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function downloadReport() {
  const profile = getSelectedProfile();

  if (!profile) {
    showToast("Please select a profile first.");
    return;
  }

  const rows = [
    ["BMI Buddy Progress Report"],
    ["Name", profile.name],
    ["Age", profile.age],
    ["Wellness goal", goalLabel(profile.goal)],
    ["Generated on", todayString()],
    [],
    ["Date", "Height (cm)", "Weight (kg)", "BMI calculation", "Note"]
  ];

  [...profile.records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((record) => {
      rows.push([
        record.date,
        record.height,
        record.weight,
        formatNumber(calculateBMI(record.height, record.weight), 1),
        record.note
      ]);
    });

  rows.push([]);
  rows.push(["Note", "BMI is a screening measure, not a diagnosis. Under 20, clinical interpretation needs age-specific assessment."]);

  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const safeName = profile.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 40) || "Profile";

  downloadFile(
    `BMI-Buddy-Report-${safeName}-${todayString()}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );

  showToast("Your progress report is ready to download.");
}

function bindAppEvents() {
  $("addProfileBtn").addEventListener("click", openProfileDialog);
  $("emptyAddBtn").addEventListener("click", openProfileDialog);
  $("closeDialogBtn").addEventListener("click", closeProfileDialog);
  $("cancelDialogBtn").addEventListener("click", closeProfileDialog);

  $("profileForm").addEventListener("submit", createProfile);
  $("measurementForm").addEventListener("submit", addMeasurement);
  $("assessmentForm").addEventListener("submit", generatePersonalPlan);

  $("editAssessmentBtn").addEventListener("click", () => {
    $("assessmentForm").classList.remove("hidden");
    $("editAssessmentBtn").classList.add("hidden");
    $("assessmentSavedNotice").classList.add("hidden");
    $("assessmentForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $("planControls").addEventListener("click", (event) => {
    if (event.target.closest("#startPlanBtn")) beginPlan();
  });

  $("roadmap").addEventListener("change", (event) => {
    const input = event.target.closest("[data-week-habit]");
    if (!input) return;

    setWeekHabit(
      Number(input.dataset.weekHabit),
      input.dataset.habitKey,
      input.checked
    );
  });

  $("roadmap").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-review]");
    if (button) openWeeklyReview(Number(button.dataset.openReview));
  });

  $("deleteProfileBtn").addEventListener("click", deleteProfile);
  $("downloadReportBtn").addEventListener("click", downloadReport);
  $("backupBtn").addEventListener("click", downloadBackup);

  $("restoreBtn").addEventListener("click", () => $("restoreInput").click());

  $("restoreInput").addEventListener("change", (event) => {
    restoreBackupFile(event.target.files?.[0]);
  });

  $("profileList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-profile]");
    if (!button) return;

    appData.selectedProfileId = button.dataset.selectProfile;
    saveData();
    renderApp();

    $("profileDetails").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  $("historyList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-record]");
    if (button) deleteRecord(button.dataset.deleteRecord);
  });
}

/* Demo account screens: these are local-browser accounts, not secure authentication. */
function normalizeAccountName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function normalizeColour(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function readAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "[]");
    accountData = Array.isArray(saved) ? saved : [];
  } catch (_) {
    accountData = [];
  }
}

function writeAccounts() {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accountData));
}

async function hashPassword(password) {
  const value = String(password);

  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "demo-" + (hash >>> 0).toString(16);
}

function findAccount(name) {
  return accountData.find(
    (account) => normalizeAccountName(account.name) === normalizeAccountName(name)
  );
}

function setAuthMessage(message, success = false) {
  const element = $("authMessage");
  element.textContent = message;
  element.classList.remove("hidden", "success");
  if (success) element.classList.add("success");
}

function clearAuthMessage() {
  const element = $("authMessage");
  element.textContent = "";
  element.classList.add("hidden");
  element.classList.remove("success");
}

function showAuthPanel(panel) {
  clearAuthMessage();

  $("signupForm").classList.toggle("hidden", panel !== "signup");
  $("loginForm").classList.toggle("hidden", panel !== "login");
  $("forgotForm").classList.toggle("hidden", panel !== "forgot");

  $("authHeading").textContent =
    panel === "signup"
      ? "Create your account"
      : panel === "login"
        ? "Welcome back"
        : "Reset your password";
}

function showLoggedOut() {
  $("appShell").hidden = true;
  $("authSection").classList.remove("hidden");
  $("authSection").hidden = false;

  showAuthPanel(accountData.length ? "login" : "signup");

  if (accountData.length) setAuthMessage("Log in to open BMI Buddy.");
}

function showLoggedIn(account) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, account.name);
  $("authSection").hidden = true;
  $("appShell").hidden = false;

  renderApp();
  showToast("Welcome, " + account.name + "!");
}

function bindAuthEvents() {
  $("showLoginBtn").addEventListener("click", () => showAuthPanel("login"));
  $("showSignupBtn").addEventListener("click", () => showAuthPanel("signup"));
  $("showForgotBtn").addEventListener("click", () => showAuthPanel("forgot"));
  $("backToLoginBtn").addEventListener("click", () => showAuthPanel("login"));

  $("signupForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = $("signupName").value.trim();
    const password = $("signupPassword").value;
    const confirmPassword = $("signupConfirmPassword").value;
    const favouriteColour = normalizeColour($("signupFavouriteColour").value);

    if (!name || !favouriteColour) {
      setAuthMessage("Please fill in every field.");
      return;
    }

    if (password.length < 6) {
      setAuthMessage("Choose a password with at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setAuthMessage("Passwords do not match. Please try again.");
      return;
    }

    if (findAccount(name)) {
      setAuthMessage("An account with this name already exists. Please log in instead.");
      return;
    }

    try {
      const account = {
        name,
        passwordHash: await hashPassword(password),
        favouriteColour,
        createdAt: new Date().toISOString()
      };

      accountData.push(account);
      writeAccounts();
      $("signupForm").reset();
      showLoggedIn(account);
    } catch (error) {
      console.error(error);
      setAuthMessage("Could not save the account in this browser. Check browser storage settings.");
    }
  });

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const account = findAccount($("loginName").value);
    const password = $("loginPassword").value;

    if (!account) {
      setAuthMessage("Account not found. Check the name or create a new account.");
      return;
    }

    try {
      if (await hashPassword(password) !== account.passwordHash) {
        setAuthMessage("Incorrect password. Please try again or use Forgot password.");
        return;
      }

      $("loginForm").reset();
      showLoggedIn(account);
    } catch (error) {
      console.error(error);
      setAuthMessage("Could not verify the password in this browser. Please try again.");
    }
  });

  $("forgotForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const account = findAccount($("forgotName").value);
    const colour = normalizeColour($("forgotColour").value);
    const newPassword = $("forgotNewPassword").value;
    const confirmPassword = $("forgotConfirmPassword").value;

    if (!account || normalizeColour(account.favouriteColour) !== colour) {
      setAuthMessage("The name or favourite colour does not match this account.");
      return;
    }

    if (newPassword.length < 6) {
      setAuthMessage("Choose a new password with at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setAuthMessage("New passwords do not match.");
      return;
    }

    try {
      account.passwordHash = await hashPassword(newPassword);
      writeAccounts();
      $("forgotForm").reset();
      showAuthPanel("login");
      setAuthMessage("Password reset successfully. You can now log in.", true);
    } catch (error) {
      console.error(error);
      setAuthMessage("Could not update the password in this browser. Please try again.");
    }
  });

  $("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    showLoggedOut();
  });
}

function initializeApp() {
  $("measurementDate").value = todayString();

  loadData();
  loadAssessments();
  bindAppEvents();

  readAccounts();
  bindAuthEvents();

  // Ask the user to log in after each page reload.
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  showLoggedOut();
}

initializeApp();
