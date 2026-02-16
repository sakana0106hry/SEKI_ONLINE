// --- カットイン演出（新仕様） ---
const CUT_IN_GROUP_TO_ATTR = {
    STRATEGY: "s",
    EFFICIENCY: "e",
    KILLER: "k"
};
const CUT_IN_DURATION_MS = 4500;
const CUT_IN_ATTR_SOUND_KEYS = {
    s: "CUTIN_STRATEGY",
    e: "CUTIN_EFFICIENCY",
    k: "CUTIN_KILLER"
};
const CUT_IN_ROLE_SOUND_GAP_MS = 0;
const CUT_IN_RANDOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?";
let cutInImpactTimer = null;
let cutInPulseOffTimer = null;
let cutInDecodeTimerEng = null;
let cutInDecodeTimerJp = null;
let cutInEndTimer = null;
let cutInRoleSoundTimer = null;
let cutInDecodeToken = 0;
let cutInCanvasRef = null;
let cutInCanvasCtx = null;
let cutInCanvasRaf = null;
let cutInCanvasRunning = false;
let cutInCanvasResizeBound = false;
let cutInCanvasParticles = [];
let cutInCanvasPalette = ["#00d8ff", "#34f78d", "#ff355e"];

function clearCutInTimers() {
    clearTimeout(cutInImpactTimer);
    clearTimeout(cutInPulseOffTimer);
    clearTimeout(cutInDecodeTimerEng);
    clearTimeout(cutInDecodeTimerJp);
    clearTimeout(cutInEndTimer);
    clearTimeout(cutInRoleSoundTimer);
}

function resolveCutInAttr(roleKey) {
    let groupKey = null;
    if (typeof getRoleGroup === "function") {
        groupKey = getRoleGroup(roleKey);
    } else if (typeof ROLE_TO_GROUP !== "undefined" && ROLE_TO_GROUP) {
        groupKey = ROLE_TO_GROUP[roleKey];
    }
    return CUT_IN_GROUP_TO_ATTR[groupKey] || "s";
}

function resolveRoleSkillSoundKey(roleKey) {
    const skillKey = `SKILL_${roleKey}`;
    if (typeof SOUND_FILES !== "undefined" && SOUND_FILES[skillKey]) return skillKey;
    return "SKILL";
}

async function playCutInSoundSequence(attrCode, roleKey, token) {
    const roleSoundKey = resolveRoleSkillSoundKey(roleKey);
    const attrSoundKey = CUT_IN_ATTR_SOUND_KEYS[attrCode];
    if (!attrSoundKey || typeof SOUND_FILES === "undefined" || !SOUND_FILES[attrSoundKey]) {
        playSoundEffect(roleSoundKey);
        return;
    }

    let attrDurationMs = 0;
    try {
        let attrBuffer = audioBuffers[attrSoundKey];
        if (!attrBuffer) {
            attrBuffer = await loadSound(attrSoundKey);
        }
        if (!attrBuffer) {
            playSoundEffect(roleSoundKey);
            return;
        }
        attrDurationMs = Math.max(0, Math.round((attrBuffer.duration || 0) * 1000));
        if (token !== cutInDecodeToken) return;
        await playSoundEffect(attrSoundKey);
    } catch (e) {
        console.warn(`属性音再生失敗: ${attrSoundKey}`, e);
        playSoundEffect(roleSoundKey);
        return;
    }

    cutInRoleSoundTimer = setTimeout(() => {
        if (token !== cutInDecodeToken) return;
        playSoundEffect(roleSoundKey);
    }, attrDurationMs + CUT_IN_ROLE_SOUND_GAP_MS);
}

function getCutInPalette(attrCode) {
    if (attrCode === "e") return ["#34f78d", "#9bffc5", "#00b760"];
    if (attrCode === "k") return ["#ff355e", "#ff7b95", "#a80028"];
    return ["#00d8ff", "#69e8ff", "#048ea6"];
}

function ensureCutInCanvasContext() {
    if (!cutInCanvasRef) {
        cutInCanvasRef = document.getElementById("cut-in-canvas");
    }
    if (!cutInCanvasRef || typeof cutInCanvasRef.getContext !== "function") {
        return false;
    }
    if (!cutInCanvasCtx) {
        cutInCanvasCtx = cutInCanvasRef.getContext("2d");
    }
    if (!cutInCanvasCtx) {
        return false;
    }
    if (!cutInCanvasResizeBound) {
        window.addEventListener("resize", () => {
            if (cutInCanvasRunning) resizeCutInCanvas();
        }, { passive: true });
        cutInCanvasResizeBound = true;
    }
    return true;
}

function resizeCutInCanvas() {
    if (!cutInCanvasRef) return;
    const nextW = Math.max(1, Math.floor(window.innerWidth));
    const nextH = Math.max(1, Math.floor(window.innerHeight));
    if (cutInCanvasRef.width !== nextW) cutInCanvasRef.width = nextW;
    if (cutInCanvasRef.height !== nextH) cutInCanvasRef.height = nextH;
}

function createCutInParticle(randomY = false) {
    if (!cutInCanvasRef) return null;
    const width = cutInCanvasRef.width || 1;
    const height = cutInCanvasRef.height || 1;
    return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : (height + Math.random() * height),
        speed: Math.random() * 1.8 + 0.8,
        size: Math.random() * 2.6 + 0.8,
        alpha: Math.random() * 0.28 + 0.18,
        color: cutInCanvasPalette[Math.floor(Math.random() * cutInCanvasPalette.length)]
    };
}

function resetCutInParticle(particle) {
    if (!cutInCanvasRef || !particle) return;
    const width = cutInCanvasRef.width || 1;
    const height = cutInCanvasRef.height || 1;
    particle.x = Math.random() * width;
    particle.y = height + Math.random() * height;
    particle.speed = Math.random() * 1.8 + 0.8;
    particle.size = Math.random() * 2.6 + 0.8;
    particle.alpha = Math.random() * 0.28 + 0.18;
    particle.color = cutInCanvasPalette[Math.floor(Math.random() * cutInCanvasPalette.length)];
}

function initCutInParticles(count = 50) {
    cutInCanvasParticles = [];
    for (let i = 0; i < count; i++) {
        const particle = createCutInParticle(true);
        if (particle) cutInCanvasParticles.push(particle);
    }
}

function renderCutInCanvasFrame() {
    if (!cutInCanvasRunning || !cutInCanvasCtx || !cutInCanvasRef) return;

    cutInCanvasCtx.fillStyle = "#020a14";
    cutInCanvasCtx.globalAlpha = 1;
    cutInCanvasCtx.fillRect(0, 0, cutInCanvasRef.width, cutInCanvasRef.height);

    cutInCanvasParticles.forEach(particle => {
        particle.y -= particle.speed;
        if (particle.y < -50) {
            resetCutInParticle(particle);
        }
        cutInCanvasCtx.fillStyle = particle.color;
        cutInCanvasCtx.globalAlpha = particle.alpha;
        cutInCanvasCtx.fillRect(particle.x, particle.y, particle.size, 25);
    });
    cutInCanvasCtx.globalAlpha = 1;

    cutInCanvasRaf = requestAnimationFrame(renderCutInCanvasFrame);
}

function stopCutInCanvas() {
    cutInCanvasRunning = false;
    if (cutInCanvasRaf) {
        cancelAnimationFrame(cutInCanvasRaf);
        cutInCanvasRaf = null;
    }
    if (cutInCanvasCtx && cutInCanvasRef) {
        cutInCanvasCtx.clearRect(0, 0, cutInCanvasRef.width, cutInCanvasRef.height);
    }
}

function startCutInCanvas(attrCode) {
    if (!ensureCutInCanvasContext()) return;
    stopCutInCanvas();
    cutInCanvasPalette = getCutInPalette(attrCode);
    resizeCutInCanvas();
    initCutInParticles(50);
    cutInCanvasRunning = true;
    renderCutInCanvasFrame();
}

function buildCutInRandomString(length) {
    const safeLength = Math.max(0, Number(length) || 0);
    if (safeLength === 0) return "";
    let output = "";
    for (let i = 0; i < safeLength; i++) {
        output += CUT_IN_RANDOM_CHARS[Math.floor(Math.random() * CUT_IN_RANDOM_CHARS.length)];
    }
    return output;
}

function animateCutInDecodeText(element, finalText, duration, token) {
    if (!element) return;
    const target = String(finalText || "");
    if (!target) {
        element.innerText = "";
        return;
    }
    const total = target.length;
    let startTime = null;

    function frame(timestamp) {
        if (token !== cutInDecodeToken) return;
        if (startTime === null) startTime = timestamp;
        const progress = Math.min(1, (timestamp - startTime) / Math.max(1, duration));
        const decodedCount = Math.floor(progress * total);
        let mixed = target.slice(0, decodedCount);
        for (let i = decodedCount; i < total; i++) {
            mixed += CUT_IN_RANDOM_CHARS[Math.floor(Math.random() * CUT_IN_RANDOM_CHARS.length)];
        }
        element.innerText = mixed;
        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}

function resetCutInOverlayClasses(overlay) {
    overlay.classList.remove("active", "impact-pulse", "attr-s", "attr-e", "attr-k");
}

function playCutInAnimation(roleKey, roleNameJp, playerName) {
    const overlay = document.getElementById("cut-in-overlay");
    const roleNameEl = document.getElementById("cut-in-role-name");
    const playerNameEl = document.getElementById("cut-in-player-name");
    const skillEngEl = document.getElementById("cut-in-skill-eng");
    const skillJpEl = document.getElementById("cut-in-skill-jp");
    const roleImgWrap = document.getElementById("cut-in-role-image-wrap");
    const roleImgEl = document.getElementById("cut-in-role-img");
    if (!overlay || !roleNameEl || !playerNameEl || !skillEngEl || !skillJpEl || !roleImgWrap || !roleImgEl) return;

    clearCutInTimers();
    cutInDecodeToken += 1;
    const token = cutInDecodeToken;

    stopCutInCanvas();
    resetCutInOverlayClasses(overlay);

    const info = (typeof ROLE_INFO !== "undefined" && ROLE_INFO[roleKey]) ? ROLE_INFO[roleKey] : null;
    const roleName = (info && info.jp) ? info.jp : (roleNameJp || roleKey || "ROLE");
    const skillEng = (info && info["s-eng"]) ? info["s-eng"] : (roleKey || "SKILL");
    const skillJp = (info && info["s-jp"]) ? info["s-jp"] : (roleName || "スキル発動");
    const attrCode = resolveCutInAttr(roleKey);
    const imgUrl = (typeof ROLE_IMAGES !== "undefined" && ROLE_IMAGES[roleKey]) ? ROLE_IMAGES[roleKey] : "";
    roleImgEl.onerror = () => {
        roleImgWrap.classList.add("is-hidden");
        roleImgEl.removeAttribute("src");
    };

    roleNameEl.innerText = roleName;
    playerNameEl.innerText = playerName || "UNKNOWN";
    skillEngEl.innerText = "";
    skillJpEl.innerText = "";

    if (imgUrl) {
        roleImgWrap.classList.remove("is-hidden");
        roleImgEl.src = imgUrl;
        roleImgEl.alt = `${roleName} visual`;
    } else {
        roleImgWrap.classList.add("is-hidden");
        roleImgEl.removeAttribute("src");
        roleImgEl.alt = "Role visual";
    }

    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.remove("hidden");
    overlay.classList.add(`attr-${attrCode}`);
    void overlay.offsetWidth;
    overlay.classList.add("active");

    startCutInCanvas(attrCode);
    playCutInSoundSequence(attrCode, roleKey, token);

    let impactDelay = 500;
    if (attrCode === "e") impactDelay = 400;
    if (attrCode === "k") impactDelay = 300;

    cutInImpactTimer = setTimeout(() => {
        if (token !== cutInDecodeToken) return;
        overlay.classList.add("impact-pulse");
        skillEngEl.innerText = buildCutInRandomString(skillEng.length);
        skillJpEl.innerText = buildCutInRandomString(skillJp.length);
    }, impactDelay);

    cutInPulseOffTimer = setTimeout(() => {
        if (token !== cutInDecodeToken) return;
        overlay.classList.remove("impact-pulse");
    }, impactDelay + 400);

    cutInDecodeTimerEng = setTimeout(() => {
        animateCutInDecodeText(skillEngEl, skillEng, 600, token);
    }, impactDelay + 100);

    cutInDecodeTimerJp = setTimeout(() => {
        animateCutInDecodeText(skillJpEl, skillJp, 800, token);
    }, impactDelay + 100);

    cutInEndTimer = setTimeout(() => {
        if (token !== cutInDecodeToken) return;
        resetCutInOverlayClasses(overlay);
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
        stopCutInCanvas();
    }, CUT_IN_DURATION_MS);
}

