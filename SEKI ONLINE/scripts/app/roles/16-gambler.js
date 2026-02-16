/* --- GAMBLER (賭博師) の実装 --- */
// 効果: 山札の数字を予想し、結果に応じて手札破棄・除外・獲得を行う。

// 1. 予想を選択する画面
function activateGambler() {
    let deck = gameState.deckNum || [];
    if (deck.length === 0) return showInfoModal("エラー", "数字山札がありません");

    let html = `
        <p>数字山札の一番上を予想してください。<br>
        <span style="font-size:12px; color:#9cb3c9;">※実行すると全員に通知されます</span>
        </p>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
            <button onclick="execGamblerGuess('A')" style="padding:15px; background:#0f314d; color:#d9f4ff; font-weight:bold; border:1px solid #4ba3d6; border-radius:8px;">
                A: 小さい (1, 2, 3, 4)<br>
                <span style="font-size:12px;">的中: 手札1枚捨て / 外れ: ターン終了</span>
            </button>
            <button onclick="execGamblerGuess('B')" style="padding:15px; background:#5a3312; color:#ffe2b7; font-weight:bold; border:1px solid #ffb86b; border-radius:8px;">
                B: 大きい (6, 7, 8, 9)<br>
                <span style="font-size:12px;">的中: 手札1枚捨て / 外れ: ターン終了</span>
            </button>
            <button onclick="execGamblerGuess('C')" style="padding:15px; background:#35184d; color:#efdcff; font-weight:bold; border:1px solid #c084ff; border-radius:8px;">
                C: 命知らず (0, 5)<br>
                <span style="font-size:12px;">的中: 手札2枚捨て / 外れ: カードを獲得しターン終了</span>
            </button>
        </div>
    `;
    openModal("賭博師: 運命の選択", html);
}

// --- 賭博師：送信処理（サイバー演出対応版） ---
async function execGamblerGuess(type) {
    closeModal();
    const cutInDelayMs = (typeof CUT_IN_DURATION_MS === "number") ? CUT_IN_DURATION_MS : 4500;
    const gamblerVisualDurationMs = 6000;
    const gamblerTotalWaitMs = cutInDelayMs + gamblerVisualDurationMs;
    let openDiscardAfterDelay = false;
    let discardCount = 0;
    let localFailReason = "";

    const txResult = await runTurnTransaction("execGamblerGuess", (state, ctx) => {
        openDiscardAfterDelay = false;
        discardCount = 0;
        localFailReason = "";

        let deck = [...(state.deckNum || [])];
        if (deck.length === 0) {
            localFailReason = "deck-empty";
            return false;
        }

        let excl = [...(state.exclusion || [])];
        let card = deck.pop();
        if (!card) {
            localFailReason = "deck-empty";
            return false;
        }

        const val = card.val;
        let win = false;
        let guessText = "";
        if (type === 'A') {
            if ([1, 2, 3, 4].includes(val)) win = true;
            guessText = "小さい [1-4]";
        } else if (type === 'B') {
            if ([6, 7, 8, 9].includes(val)) win = true;
            guessText = "大きい [6-9]";
        } else if (type === 'C') {
            if ([0, 5].includes(val)) win = true;
            guessText = "命知らず [0, 5]";
        } else {
            localFailReason = "invalid-type";
            return false;
        }

        state.effect = {
            guessTitle: guessText,
            cardVal: val,
            sub: win ? "WIN!!" : "LOSE...",
            color: win ? "#ff4d73" : "#9cb3c9",
            isWin: win,
            guessType: type,
            showDelayMs: cutInDelayMs,
            durationMs: gamblerVisualDurationMs,
            effectId: ctx.now,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        ctx.appendLog(`${myName}が[賭博師]を発動！: ${guessText} -> 結果は...?`, 'public');

        let actList = {...(state.activatedList || {})};
        actList[myId] = true;
        state.activatedList = actList;
        state.deckNum = deck;

        if (win || type !== 'C') {
            excl.push(card);
            state.exclusion = excl;
        } else {
            let hand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
            hand.push(card);
            state.hands = state.hands || {};
            state.hands[myId] = sortCards(hand);
        }

        if (!win) {
            state.passCount = 0;
            state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
            if (type === 'C') {
                ctx.appendLog(`結果: [${val}] でした。開いたカードを手札に加えました。`, 'public');
            } else {
                ctx.appendLog(`結果: [${val}] でした。開いたカードは除外されました。`, 'public');
            }
        } else {
            openDiscardAfterDelay = true;
            discardCount = (type === 'C') ? 2 : 1;
        }
        return true;
    });

    if (!txResult.committed) {
        if (localFailReason === "deck-empty") {
            showInfoModal("エラー", "数字山札が空になりました。");
            return;
        }
        showTurnActionError(txResult.reason);
        return;
    }

    if (openDiscardAfterDelay) {
        setTimeout(() => {
            gamblerSelectDiscard(discardCount);
        }, gamblerTotalWaitMs);
    }
}

// 3. (勝利時) 捨てるカードを選ぶ画面
function gamblerSelectDiscard(count) {
    let hand = sortCards(deepCopy(gameState.hands[myId] || []));
    
    // 捨てる枚数が手札より多い場合のケア
    if (hand.length < count) count = hand.length;

    let html = `
        <p style="font-size:14px; font-weight:bold; color:#7dffc0;">
            おめでとうございます！<br>
            手札から <span style="font-size:18px;">${count}枚</span> 選んで捨ててください。
        </p>
        
        <div id="gambler-hand-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:5px;"></div>

        <div style="margin-top:15px; text-align:center;">
             <p id="gambler-msg" style="font-size:12px;">あと ${count} 枚選んでください</p>
            <button onclick="execGamblerDiscard(${count})" id="btn-gambler-exec" disabled 
                style="background:#4f5966; color:#d9ebff; padding:10px 30px; border-radius:20px; border:1px solid rgba(143,176,214,0.45);">${getModalActionLabel("confirm")}</button>
        </div>
    `;

    openModal("賭博師: 勝利の報酬", html);
    document.getElementById("modal-footer").innerHTML = ""; 

    // カードリスト生成 (狩人と同じUIを使用)
    let handHtml = "";
    hand.forEach((c, i) => {
        let imgUrl = CARD_IMAGES[c.val];
        let style = "width:40px; height:60px; font-size:12px; cursor:pointer; transition:transform 0.1s; border:1px solid #999;";
        if (imgUrl) style += `background-image:url('${imgUrl}'); color:transparent; border:none;`;

        handHtml += `<div class="card ${c.type} gambler-item" data-idx="${i}" 
                    style="${style}" 
                    onclick="toggleGamblerSelect(this, ${count})">
                    ${c.val}
                </div>`;
    });
    document.getElementById("gambler-hand-list").innerHTML = handHtml;
}

// 選択切り替え処理
function toggleGamblerSelect(el, maxCount) {
    if (el.classList.contains('selected-gambler')) {
        el.classList.remove('selected-gambler');
        el.style.border = (el.style.backgroundImage) ? "none" : (el.innerText=="0" ? "2px solid #ab47bc" : "1px solid #999");
        el.style.transform = "scale(1)";
    } else {
        // 選択可能枚数チェック
        let currentSel = document.querySelectorAll('.selected-gambler').length;
        if (currentSel >= maxCount) return; // これ以上選べない

        el.classList.add('selected-gambler');
        el.style.border = "3px solid #2e7d32"; // 緑枠
        el.style.transform = "scale(1.1)";
    }

    // ボタン制御
    let selCount = document.querySelectorAll('.selected-gambler').length;
    let btn = document.getElementById('btn-gambler-exec');
    let msg = document.getElementById('gambler-msg');

    if (selCount === maxCount) {
        btn.disabled = false;
        btn.style.background = "#2c684f";
        btn.style.color = "#eff6ff";
        msg.innerText = "OK!";
        msg.style.color = "#7dffc0";
    } else {
        btn.disabled = true;
        btn.style.background = "#4f5966";
        msg.innerText = `あと ${maxCount - selCount} 枚選んでください`;
        msg.style.color = "#9cb3c9";
    }
}

// 4. (勝利時) 捨てる実行処理
async function execGamblerDiscard(count) {
    closeModal();
    const handEls = document.querySelectorAll('.selected-gambler');
    const indices = Array.from(handEls)
        .map(el => parseInt(el.dataset.idx, 10))
        .sort((a, b) => b - a);
    const discardCount = Number(count);

    const txResult = await runTurnTransaction("execGamblerDiscard", (state, ctx) => {
        if (!Number.isInteger(discardCount) || discardCount < 0) return false;
        if (indices.length !== discardCount) return false;
        if ((new Set(indices)).size !== indices.length) return false;

        let hand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
        if (discardCount > hand.length) return false;

        let graveNum = [...(state.graveNum || [])];
        let graveSym = [...(state.graveSym || [])];
        let discardedNames = [];

        for (const idx of indices) {
            if (!Number.isInteger(idx) || idx < 0 || idx >= hand.length) return false;
            let c = hand.splice(idx, 1)[0];
            if (!c) return false;

            discardedNames.push(c.val);
            if (c.type === 'num') graveNum.push({ ...c, owner: myId });
            else graveSym.push(c);
        }

        hand = sortCards(hand);
        let myHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
        let nextTotal = hand.length + myHackedCount;

        let soundList = ['DISCARD'];
        if (nextTotal === 1) soundList.push('UNO');
        else if (nextTotal === 2) soundList.push('DOS');

        state.hands = state.hands || {};
        state.hands[myId] = hand;
        state.graveNum = graveNum;
        state.graveSym = graveSym;
        state.passCount = 0;
        state.lastSound = { type: soundList, id: ctx.now };

        ctx.appendLog(`${myName}が[賭博師]の報酬で [${discardedNames.join(', ')}] を捨てました！`, 'public');

        let tempRankings = {...(state.rankings || {})};
        if (hand.length === 0 && myHackedCount === 0) {
            let currentRank = Object.keys(state.rankings || {}).length + 1;
            state.rankings = { ...(state.rankings || {}), [myId]: currentRank };
            ctx.appendLog(`${myName}が ${currentRank}位 であがりました！`, 'public');
            state.lastWinnerId = myId;
            state.lastWinnerTime = ctx.now;

            let totalPlayers = state.playerOrder.length;
            appendRankSound(soundList, currentRank, totalPlayers);
            if (currentRank >= totalPlayers - 1) {
                state.status = "finished";
                let loserId = state.playerOrder.find(pid => !(state.rankings && state.rankings[pid]) && pid !== myId);
                if (loserId) {
                    state.rankings = { ...(state.rankings || {}), [loserId]: totalPlayers };
                    appendRankSound(soundList, totalPlayers, totalPlayers);

                    let lHand = (state.hands && state.hands[loserId]) ? state.hands[loserId] : [];
                    let lHacked = (state.hackedHands && state.hackedHands[loserId]) ? state.hackedHands[loserId] : [];
                    let allL = [...lHand, ...lHacked];
                    let lText = allL.map(c => c.val).join(", ") || "なし";
                    let lName = (state.players && state.players[loserId]) ? state.players[loserId].name : "Player";
                    ctx.appendLog(`全順位確定！！最下位 ${lName} の残り手札: [${lText}]`, 'public');
                } else {
                    ctx.appendLog(`全順位が確定しました！！`, 'public');
                }
            }
            tempRankings[myId] = 99;
        }

        state.turnIdx = ctx.getNextTurnIdx(tempRankings);
        return true;
    });

    if (!txResult.committed) {
        showTurnActionError(txResult.reason);
        return;
    }

    if (
        txResult.snapshot &&
        txResult.snapshot.status === "finished" &&
        txResult.snapshot.rankings &&
        txResult.snapshot.playerOrder
    ) {
        updateFinalScores(txResult.snapshot.rankings, txResult.snapshot.playerOrder);
    }
}


/* --- 賭博師サイバー演出 --- */
const GAMBLER_VISUAL_DEFAULT_DURATION_MS = 6000;
let gamblerEffectStartTimer = null;
let gamblerEffectEndTimer = null;
let gamblerEffectStageTimers = [];
let lastProcessedEffectId = null;
let gamblerVisualToken = 0;
let gamblerCanvasRef = null;
let gamblerCanvasCtx = null;
let gamblerCanvasRaf = null;
let gamblerCanvasRunning = false;
let gamblerCanvasResizeBound = false;
let gamblerCanvasParticles = [];
let gamblerCanvasPalette = ["#00d8ff", "#69e8ff", "#ff355e"];

function clearGamblerEffectStageTimers() {
    while (gamblerEffectStageTimers.length > 0) {
        clearTimeout(gamblerEffectStageTimers.pop());
    }
}

function pushGamblerStageTimer(handler, delayMs) {
    const timerId = setTimeout(handler, delayMs);
    gamblerEffectStageTimers.push(timerId);
    return timerId;
}

function buildGamblerHex(length = 8) {
    const chars = "0123456789ABCDEF";
    let out = "";
    for (let i = 0; i < length; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

function formatGamblerTimestamp(timestamp) {
    const num = Number(timestamp);
    if (!Number.isFinite(num) || num <= 0) return "--";
    const d = new Date(num);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function resolveGamblerThemeByGuess(guessType) {
    if (guessType === "B") {
        return {
            cls: "guess-b",
            mode: "EFFICIENCY",
            palette: ["#34f78d", "#9bffc5", "#00b760"]
        };
    }
    if (guessType === "C") {
        return {
            cls: "guess-c",
            mode: "KILLER",
            palette: ["#ff355e", "#ff8da3", "#b80a35"]
        };
    }
    return {
        cls: "guess-a",
        mode: "STRATEGY",
        palette: ["#00d8ff", "#69e8ff", "#048ea6"]
    };
}

function ensureGamblerCanvasContext() {
    if (!gamblerCanvasRef) {
        gamblerCanvasRef = document.getElementById("gambler-cyber-canvas");
    }
    if (!gamblerCanvasRef || typeof gamblerCanvasRef.getContext !== "function") return false;
    if (!gamblerCanvasCtx) {
        gamblerCanvasCtx = gamblerCanvasRef.getContext("2d");
    }
    if (!gamblerCanvasCtx) return false;
    if (!gamblerCanvasResizeBound) {
        window.addEventListener("resize", () => {
            if (gamblerCanvasRunning) resizeGamblerCanvas();
        }, { passive: true });
        gamblerCanvasResizeBound = true;
    }
    return true;
}

function resizeGamblerCanvas() {
    if (!gamblerCanvasRef) return;
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    if (gamblerCanvasRef.width !== w) gamblerCanvasRef.width = w;
    if (gamblerCanvasRef.height !== h) gamblerCanvasRef.height = h;
}

function createGamblerParticle(randomY = false) {
    if (!gamblerCanvasRef) return null;
    const width = gamblerCanvasRef.width || window.innerWidth || 1;
    const height = gamblerCanvasRef.height || window.innerHeight || 1;
    return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : -20 - Math.random() * height * 0.25,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.1 + Math.random() * 1.8,
        len: 8 + Math.random() * 26,
        width: 0.6 + Math.random() * 1.6,
        color: gamblerCanvasPalette[Math.floor(Math.random() * gamblerCanvasPalette.length)] || "#00d8ff"
    };
}

function startGamblerCyberCanvas(palette) {
    if (!ensureGamblerCanvasContext()) return;
    resizeGamblerCanvas();
    gamblerCanvasPalette = Array.isArray(palette) && palette.length > 0
        ? palette.slice(0, 4)
        : ["#00d8ff", "#69e8ff", "#ff355e"];

    const particleCount = Math.min(120, Math.max(42, Math.floor(window.innerWidth / 18)));
    gamblerCanvasParticles = [];
    for (let i = 0; i < particleCount; i += 1) {
        const p = createGamblerParticle(true);
        if (p) gamblerCanvasParticles.push(p);
    }

    gamblerCanvasRunning = true;
    const render = () => {
        if (!gamblerCanvasRunning || !gamblerCanvasCtx || !gamblerCanvasRef) return;
        const ctx = gamblerCanvasCtx;
        const w = gamblerCanvasRef.width;
        const h = gamblerCanvasRef.height;
        const t = Date.now() * 0.0014;

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(1, 8, 18, 0.12)");
        grad.addColorStop(1, "rgba(1, 10, 22, 0.28)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = "lighter";
        gamblerCanvasParticles.forEach((p, i) => {
            p.x += p.vx + Math.sin((t + i) * 0.5) * 0.04;
            p.y += p.vy;
            if (p.y - p.len > h + 40 || p.x < -100 || p.x > w + 100) {
                const next = createGamblerParticle(false);
                if (next) gamblerCanvasParticles[i] = next;
                return;
            }
            ctx.globalAlpha = 0.14 + Math.abs(Math.sin(t + i * 0.2)) * 0.28;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 12, p.y - p.len);
            ctx.stroke();
        });
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;

        gamblerCanvasRaf = requestAnimationFrame(render);
    };
    render();
}

function stopGamblerCyberCanvas() {
    gamblerCanvasRunning = false;
    if (gamblerCanvasRaf) {
        cancelAnimationFrame(gamblerCanvasRaf);
        gamblerCanvasRaf = null;
    }
    if (gamblerCanvasCtx && gamblerCanvasRef) {
        gamblerCanvasCtx.clearRect(0, 0, gamblerCanvasRef.width, gamblerCanvasRef.height);
    }
}

function setGamblerMetaText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function updateGamblerMeta(data, mode) {
    const guessText = data && data.guessTitle ? data.guessTitle : "--";
    const cardText = (data && data.cardVal !== undefined && data.cardVal !== null) ? String(data.cardVal) : "--";
    setGamblerMetaText("gambler-meta-mode", `MODE // ${mode}`);
    setGamblerMetaText("gambler-meta-proto", `PROTO // GAMBLER-${mode.slice(0, 3)}`);
    setGamblerMetaText("gambler-meta-seed", `SEED // 0x${buildGamblerHex(8)}`);
    setGamblerMetaText("gambler-meta-state", "STATE // PREPARE");
    setGamblerMetaText("gambler-meta-guess", `GUESS // ${guessText}`);
    setGamblerMetaText("gambler-meta-card", `CARD // ${cardText}`);
    setGamblerMetaText("gambler-meta-ts", `SYNC // ${formatGamblerTimestamp(data ? data.timestamp : null)}`);

    const topStream = document.getElementById("gambler-meta-stream-top");
    if (topStream) {
        topStream.innerText = `:: ${mode} LINK :: GUESS:${guessText} :: HASH:${buildGamblerHex(6)} ::`;
    }
    const bottomStream = document.getElementById("gambler-meta-stream-bottom");
    if (bottomStream) {
        bottomStream.innerText = `:: CARD:${cardText} :: RESULT PIPELINE :: TOKEN:${buildGamblerHex(4)} ::`;
    }
}

function resetGamblerVisualDom() {
    const overlay = document.getElementById("visual-overlay");
    const guessDiv = document.getElementById("gambler-cyber-guess");
    const cardDiv = document.getElementById("gambler-cyber-card");
    const maskDiv = document.getElementById("gambler-cyber-mask");
    const valueDiv = document.getElementById("gambler-cyber-value");
    const resultDiv = document.getElementById("gambler-cyber-result");

    if (guessDiv) guessDiv.innerText = "GUESS MODE";
    if (valueDiv) valueDiv.innerText = "?";
    if (cardDiv) cardDiv.classList.remove("is-scanning", "is-revealed");
    if (maskDiv) maskDiv.style.transform = "translateY(0%)";
    if (resultDiv) {
        resultDiv.classList.remove("is-show");
        resultDiv.innerText = "RESULT";
        resultDiv.style.color = "#eff6ff";
        resultDiv.style.borderColor = "rgba(var(--gambler-theme-rgb), 0.7)";
    }
    setGamblerMetaText("gambler-meta-state", "STATE // IDLE");

    if (overlay) {
        overlay.classList.remove("guess-a", "guess-b", "guess-c");
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
    }
}

function cancelGamblerVisualPlayback() {
    gamblerVisualToken += 1;
    clearTimeout(gamblerEffectEndTimer);
    gamblerEffectEndTimer = null;
    clearGamblerEffectStageTimers();
    stopGamblerCyberCanvas();
    resetGamblerVisualDom();
}

function resolveGamblerResultSound(data) {
    if (data && data.isWin) {
        return data.guessType === "C" ? "WIN_BIG" : "WIN_NORMAL";
    }
    return "LOSE";
}

function showVisualEffect(data) {
    cancelGamblerVisualPlayback();

    const overlay = document.getElementById("visual-overlay");
    const guessDiv = document.getElementById("gambler-cyber-guess");
    const cardDiv = document.getElementById("gambler-cyber-card");
    const maskDiv = document.getElementById("gambler-cyber-mask");
    const valueDiv = document.getElementById("gambler-cyber-value");
    const resultDiv = document.getElementById("gambler-cyber-result");
    if (!overlay || !guessDiv || !cardDiv || !maskDiv || !valueDiv || !resultDiv) return;

    const theme = resolveGamblerThemeByGuess(data ? data.guessType : null);
    const durationRaw = Number(data ? data.durationMs : null);
    const durationMs = Number.isFinite(durationRaw) ? Math.max(1000, durationRaw) : GAMBLER_VISUAL_DEFAULT_DURATION_MS;
    const guessTitle = data && data.guessTitle ? data.guessTitle : "--";
    const cardVal = (data && data.cardVal !== undefined && data.cardVal !== null) ? String(data.cardVal) : "?";
    const token = ++gamblerVisualToken;

    overlay.classList.remove("guess-a", "guess-b", "guess-c");
    overlay.classList.add(theme.cls);
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");

    guessDiv.innerText = `PREDICTION // ${guessTitle}`;
    valueDiv.innerText = cardVal;
    cardDiv.classList.add("is-scanning");
    cardDiv.classList.remove("is-revealed");
    maskDiv.style.transform = "translateY(0%)";

    resultDiv.classList.remove("is-show");
    resultDiv.innerText = "ANALYZING...";
    resultDiv.style.color = "#dbe9f7";
    resultDiv.style.borderColor = "rgba(var(--gambler-theme-rgb), 0.72)";

    updateGamblerMeta(data, theme.mode);
    startGamblerCyberCanvas(theme.palette);

    pushGamblerStageTimer(() => {
        if (token !== gamblerVisualToken) return;
        setGamblerMetaText("gambler-meta-state", "STATE // SCANNING");
        playSoundEffect("DRUM");
    }, 200);

    pushGamblerStageTimer(() => {
        if (token !== gamblerVisualToken) return;
        cardDiv.classList.remove("is-scanning");
        cardDiv.classList.add("is-revealed");
        maskDiv.style.transform = "translateY(102%)";
        setGamblerMetaText("gambler-meta-state", `STATE // CARD:${cardVal}`);
    }, 3400);

    pushGamblerStageTimer(() => {
        if (token !== gamblerVisualToken) return;
        resultDiv.classList.add("is-show");
        resultDiv.innerText = (data && data.sub) ? data.sub : (data && data.isWin ? "WIN!!" : "LOSE...");
        if (data && data.isWin) {
            if (data.guessType === "C") {
                resultDiv.style.color = "#ffe19a";
                resultDiv.style.borderColor = "rgba(255, 191, 74, 0.88)";
            } else {
                resultDiv.style.color = "#97ffd1";
                resultDiv.style.borderColor = "rgba(78, 255, 182, 0.88)";
            }
            setGamblerMetaText("gambler-meta-state", "STATE // JACKPOT");
        } else {
            resultDiv.style.color = "#c3d4e5";
            resultDiv.style.borderColor = "rgba(156, 179, 201, 0.82)";
            setGamblerMetaText("gambler-meta-state", "STATE // MISSED");
        }
        playSoundEffect(resolveGamblerResultSound(data));
    }, 4200);

    gamblerEffectEndTimer = setTimeout(() => {
        if (token !== gamblerVisualToken) return;
        clearGamblerEffectStageTimers();
        stopGamblerCyberCanvas();
        resetGamblerVisualDom();
        gamblerEffectEndTimer = null;
    }, durationMs);
}

