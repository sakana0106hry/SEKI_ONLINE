        // --- モーダル関数 ---
        function normalizeModalOptions(options = {}) {
            const normalized = { size: "default", tone: "default" };
            if (!options || typeof options !== "object") return normalized;
            if (["default", "wide", "narrow"].includes(options.size)) normalized.size = options.size;
            if (["default", "guide", "alert"].includes(options.tone)) normalized.tone = options.tone;
            return normalized;
        }

        function applyModalPresentation(options) {
            if (!els.modal || !els.mBox) return;
            els.modal.classList.remove("modal-tone-default", "modal-tone-guide", "modal-tone-alert");
            els.mBox.classList.remove(
                "modal-size-default", "modal-size-wide", "modal-size-narrow",
                "modal-tone-default", "modal-tone-guide", "modal-tone-alert"
            );
            els.modal.classList.add(`modal-tone-${options.tone}`);
            els.mBox.classList.add(`modal-size-${options.size}`);
            els.mBox.classList.add(`modal-tone-${options.tone}`);
        }

        const MODAL_ACTION_LABELS = Object.freeze({
            close: "CLOSE",
            back: "BACK",
            confirm: "CONFIRM",
            cancel: "CANCEL",
            ok: "OK",
            yes: "YES",
            no: "NO"
        });

        function getModalActionLabel(key) {
            if (typeof key !== "string" || !key) return "BUTTON";
            return MODAL_ACTION_LABELS[key] || key.toUpperCase();
        }

        function renderModalButton(label, onClick, variant = "ghost", extraClass = "", disabled = false) {
            const classList = ["modal-btn"];
            if (variant === "primary") classList.push("primary");
            else if (variant === "danger") classList.push("danger");
            else classList.push("ghost");
            if (extraClass) classList.push(extraClass);
            const disabledAttr = disabled ? "disabled" : "";
            return `<button onclick="${onClick}" class="${classList.join(" ")}" ${disabledAttr}>${label}</button>`;
        }

        function renderCardView(card, options = {}) {
            if (!card) return `<div class="card">?</div>`;
            let cssClass = options.cssClass || `card ${card.type}`;
            if (card.isOpen && !cssClass.includes("revealed")) cssClass += " revealed";
            const imgUrl = CARD_IMAGES[card.val];
            const imgStyle = imgUrl ? `background-image:url('${imgUrl}'); color:transparent; border:2px solid rgba(255,255,255,0.92);` : "";
            const extraStyle = options.style || "";
            const onClick = options.onClick ? ` onclick="${options.onClick}"` : "";
            const attrs = options.attrs ? ` ${options.attrs}` : "";
            const val = (card.val === 0 || card.val) ? card.val : "?";
            const hasImgClass = imgUrl ? " has-img" : "";
            return `<div class="${cssClass}${hasImgClass}" style="${imgStyle}${extraStyle}"${onClick}${attrs}>${val}</div>`;
        }

        function renderNoticeBlock(html, tone = "info") {
            const toneClass = tone === "warn" ? "warn" : "";
            return `<span class="seki-note ${toneClass}">${html}</span>`;
        }

        function renderSectionBlock(html, tone = "default") {
            const toneClass = (tone === "warn" || tone === "info") ? ` ${tone}` : "";
            return `<div class="seki-section${toneClass}">${html}</div>`;
        }

        function openModal(title, html, options = {}) {
            const modalOptions = normalizeModalOptions(options);
            els.mTitle.innerText = title;
            els.mContent.innerHTML = html;
            els.mFooter.innerHTML = renderModalButton(getModalActionLabel("close"), "closeModal()", "ghost");
            applyModalPresentation(modalOptions);
            els.modal.classList.remove("hidden");
        }
        function showInfoModal(title, msg, options = {}) {
            const modalOptions = normalizeModalOptions(options);
            els.mTitle.innerText = title;
            els.mContent.innerHTML = `<p>${msg}</p>`;
            els.mFooter.innerHTML = renderModalButton(getModalActionLabel("ok"), "closeModal()", "primary");
            applyModalPresentation(modalOptions);
            els.modal.classList.remove("hidden");
        }
        function showConfirmModal(title, msg, yesCallbackStr, options = {}) {
            const modalOptions = normalizeModalOptions(options);
            els.mTitle.innerText = title;
            els.mContent.innerHTML = `<p>${msg}</p>`;
            els.mFooter.innerHTML = `
                ${renderModalButton(getModalActionLabel("yes"), `${yesCallbackStr}; closeModal()`, "primary")}
                ${renderModalButton(getModalActionLabel("no"), "closeModal()", "ghost")}
            `;
            applyModalPresentation(modalOptions);
            els.modal.classList.remove("hidden");
        }
        function closeModal() {
            if (!els.modal || !els.mBox) return;
            els.modal.classList.add("hidden");
            applyModalPresentation({ size: "default", tone: "default" });
        }

        function setActionUiDisabled(disabled) {
            const targets = [];
            const btnPlay = document.getElementById("btn-play");
            const btnPass = document.getElementById("btn-pass");
            if (btnPlay) targets.push(btnPlay);
            if (btnPass) targets.push(btnPass);
            document.querySelectorAll("#modal-content button, #modal-footer button").forEach(btn => {
                if (btn && !targets.includes(btn)) targets.push(btn);
            });

            targets.forEach(btn => {
                if (!btn) return;
                if (disabled) {
                    if (!btn.dataset.sekiPrevDisabled) {
                        btn.dataset.sekiPrevDisabled = btn.disabled ? "1" : "0";
                    }
                    btn.disabled = true;
                    btn.classList.add("is-disabled");
                } else {
                    const prev = btn.dataset.sekiPrevDisabled;
                    if (prev === "0") btn.disabled = false;
                    delete btn.dataset.sekiPrevDisabled;
                    btn.classList.remove("is-disabled");
                }
            });
        }

        async function runGuardedAction(actionName, fn) {
            if (actionInFlight) return false;
            actionInFlight = true;
            actionInFlightName = actionName || "";
            setActionUiDisabled(true);
            try {
                await fn();
                return true;
            } finally {
                actionInFlight = false;
                actionInFlightName = "";
                setActionUiDisabled(false);
            }
        }

        function showTurnActionError(reason) {
            if (reason === "not-my-turn") {
                showInfoModal("エラー", "あなたの番ではありません。");
                return;
            }
            if (reason === "not-playing") {
                showInfoModal("待機中", "まだゲームは開始していません。");
                return;
            }
            if (reason === "guard-failed") {
                showInfoModal("エラー", "処理条件を満たしていません。最新状態で再試行してください。");
                return;
            }
            showInfoModal("エラー", "処理に失敗しました。最新状態で再試行してください。");
        }

        async function runTurnTransaction(actionName, mutateFn) {
            if (!currentRoom) return { committed: false, reason: "no-room", snapshot: null };

            const roomRef = db.ref(`rooms/${currentRoom}`);
            let rejectReason = null;
            const result = await roomRef.transaction((state) => {
                if (!state || state.status !== "playing") {
                    rejectReason = "not-playing";
                    return;
                }
                if (!Array.isArray(state.playerOrder) || typeof state.turnIdx !== "number") {
                    rejectReason = "invalid-state";
                    return;
                }
                const activePid = state.playerOrder[state.turnIdx];
                if (activePid !== myId) {
                    rejectReason = "not-my-turn";
                    return;
                }

                const ctx = {
                    actionName,
                    now: Date.now(),
                    myId,
                    myName,
                    appendLog: (text, type = "public", targetId = null) => {
                        appendLogEntryToState(state, text, type, targetId);
                    },
                    getNextTurnIdx: (rankings = state.rankings || {}) => {
                        return getNextActivePlayerIndex(state.turnIdx, state.playerOrder, rankings);
                    }
                };

                const shouldCommit = mutateFn(state, ctx);
                if (shouldCommit === false) {
                    rejectReason = "guard-failed";
                    return;
                }
                return state;
            });

            return {
                committed: !!result.committed,
                reason: rejectReason,
                snapshot: result.snapshot ? result.snapshot.val() : null
            };
        }

        function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }
        function sortCards(hand) {
            if(!hand) return [];
            hand.sort((a,b) => {
                if(a.type !== b.type) return a.type === 'num' ? -1 : 1;
                if(a.type === 'num') return a.val - b.val;
                const sOrder = ["REVERSE", "TRADE", "DIG UP", "DISCARD"];
                return sOrder.indexOf(a.val) - sOrder.indexOf(b.val);
            });
            return hand;
        }

        // --- ログシステム & 色生成 ---
        function getPoliticianShieldMap(data = gameState) {
            if (!data || !data.politicianShield) return {};
            return data.politicianShield;
        }

        function isPoliticianShieldActive(pid, data = gameState) {
            return !!(pid && getPoliticianShieldMap(data)[pid]);
        }

        function canTargetByHandInterference(targetId) {
            if (!isPoliticianShieldActive(targetId)) return true;
            return false;
        }

        async function clearPoliticianShieldIfNeeded(playerId, updates, reasonText = "") {
            const shieldMap = {...(getPoliticianShieldMap() || {})};
            if (!shieldMap[playerId]) return false;

            delete shieldMap[playerId];
            updates[`rooms/${currentRoom}/politicianShield`] = shieldMap;

            const pName = (gameState && gameState.players && gameState.players[playerId]) ? gameState.players[playerId].name : "Player";
            const suffix = reasonText ? ` (${reasonText})` : "";
            await pushLog(`${pName} の[政治家]保護が解除されました${suffix}`, 'public');
            return true;
        }

        function clearPoliticianShieldInState(state, playerId, ctx, reasonText = "") {
            const shieldMap = {...((state && state.politicianShield) || {})};
            if (!shieldMap[playerId]) return false;

            delete shieldMap[playerId];
            state.politicianShield = shieldMap;

            const pName = (state && state.players && state.players[playerId]) ? state.players[playerId].name : "Player";
            const suffix = reasonText ? ` (${reasonText})` : "";
            if (ctx && typeof ctx.appendLog === "function") {
                ctx.appendLog(`${pName} の[政治家]保護が解除されました${suffix}`, "public");
            }
            return true;
        }

        const CHAT_NAME_COLOR_CANDIDATES = [
            { h: 8, s: 86, l: 62 },
            { h: 32, s: 88, l: 60 },
            { h: 54, s: 88, l: 58 },
            { h: 84, s: 82, l: 58 },
            { h: 124, s: 78, l: 58 },
            { h: 158, s: 76, l: 56 },
            { h: 188, s: 82, l: 60 },
            { h: 212, s: 84, l: 62 },
            { h: 236, s: 84, l: 66 },
            { h: 264, s: 82, l: 66 },
            { h: 292, s: 80, l: 64 },
            { h: 320, s: 82, l: 62 },
            { h: 348, s: 84, l: 64 }
        ];
        const chatNameColorIndexMap = {};

        function hashStringToPositiveInt(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
                hash |= 0;
            }
            return Math.abs(hash);
        }

        function hueDistanceDeg(a, b) {
            const raw = Math.abs(a - b) % 360;
            return raw > 180 ? (360 - raw) : raw;
        }

        function formatChatColor(candidate) {
            return `hsl(${candidate.h}, ${candidate.s}%, ${candidate.l}%)`;
        }

        function pickChatColorIndex(name) {
            const total = CHAT_NAME_COLOR_CANDIDATES.length;
            if (total <= 0) return 0;
            const seedIndex = hashStringToPositiveInt(name) % total;
            const seedHue = CHAT_NAME_COLOR_CANDIDATES[seedIndex].h;

            const usedIndices = new Set(
                Object.values(chatNameColorIndexMap).filter(idx =>
                    Number.isInteger(idx) && idx >= 0 && idx < total
                )
            );

            if (usedIndices.size === 0) return seedIndex;

            let bestIndex = -1;
            let bestScore = -Infinity;

            for (let i = 0; i < total; i++) {
                if (usedIndices.has(i)) continue;
                const candidate = CHAT_NAME_COLOR_CANDIDATES[i];
                let minDist = 360;

                usedIndices.forEach(usedIdx => {
                    const usedHue = CHAT_NAME_COLOR_CANDIDATES[usedIdx].h;
                    minDist = Math.min(minDist, hueDistanceDeg(candidate.h, usedHue));
                });

                const seedDist = hueDistanceDeg(candidate.h, seedHue);
                const score = (minDist * 1000) - seedDist;

                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = i;
                }
            }

            if (bestIndex >= 0) return bestIndex;
            return seedIndex;
        }

        function stringToColor(str) {
            const name = String(str || "").trim();
            if (!name) return "hsl(0, 0%, 75%)";

            const assignedIdx = chatNameColorIndexMap[name];
            if (Number.isInteger(assignedIdx) && CHAT_NAME_COLOR_CANDIDATES[assignedIdx]) {
                return formatChatColor(CHAT_NAME_COLOR_CANDIDATES[assignedIdx]);
            }

            const pickedIdx = pickChatColorIndex(name);
            chatNameColorIndexMap[name] = pickedIdx;
            return formatChatColor(CHAT_NAME_COLOR_CANDIDATES[pickedIdx]);
        }

        async function pushLog(text, type='public', targetId=null) {
            if(!currentRoom) return;
            const now = Date.now();
            const logEntry = { text: text, type: type, targetId: targetId, timestamp: now };
            await db.ref(`rooms/${currentRoom}/logs`).transaction((currentLogs) => {
                const logs = Array.isArray(currentLogs) ? [...currentLogs] : [];
                logs.push(logEntry);
                if (logs.length > 50) logs.splice(0, logs.length - 50);
                return logs;
            });
        }

        function buildVisibleLogEntriesHtml(logs) {
            if (!Array.isArray(logs) || logs.length === 0) {
                return `<div class="desktop-empty-log">表示できるログがありません。</div>`;
            }

            let html = "";
            [...logs].reverse().forEach(l => {
                if (!l) return;
                if (l.type === 'private' && l.targetId !== myId) return;

                const time = new Date(l.timestamp).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
                let styleClass = '';
                let content = l.text;

                if (l.type === 'private') {
                    styleClass = 'log-private';
                } else if (l.type === 'chat') {
                    styleClass = 'log-chat';
                    const match = content.match(/^\[(.*?)\] (.*)$/);
                    if (match) {
                        const name = match[1];
                        const msg = match[2];
                        const color = stringToColor(name);
                        content = `<span style="color:${color}; font-weight:bold;">[${name}]</span> ${msg}`;
                    }
                }

                html += `<div class="log-entry ${styleClass}"><span class="log-time">${time}</span><span class="log-text">${content}</span></div>`;
            });

            if (!html) {
                return `<div class="desktop-empty-log">表示できるログがありません。</div>`;
            }
            return html;
        }

        function renderDesktopChatLogPanel(logs, signature = "") {
            const panel = document.getElementById("desktop-chatlog-panel");
            const list = document.getElementById("desktop-log-list");
            if (!panel || !list) {
                console.warn("[desktop-chatlog] 必要な要素が見つからないため描画を停止します。");
                return;
            }
            if (!gameState || !myId) {
                panel.classList.add("hidden");
                list.dataset.sekiSig = "";
                return;
            }

            panel.classList.remove("hidden");

            const nextSig = signature || buildRenderSignature({
                length: Array.isArray(logs) ? logs.length : 0,
                lastTimestamp: Array.isArray(logs) && logs.length > 0 ? Number(logs[logs.length - 1].timestamp) || 0 : 0
            });
            if (list.dataset.sekiSig === nextSig) return;

            list.innerHTML = buildVisibleLogEntriesHtml(logs || []);
            list.dataset.sekiSig = nextSig;
        }

        function renderLogs(logs, options = {}) {
            const forceBubbleRefresh = !!(options && options.forceBubbleRefresh);

            if (!logs || logs.length === 0) {
                if (logRenderCache.signature !== "empty") {
                    els.log.innerText = "ログなし";
                }
                logRenderCache.signature = "empty";
                logRenderCache.recentChats = [];
                renderDesktopChatLogPanel([], "empty");
                return;
            }

            const lastLog = logs[logs.length - 1];
            const signature = buildRenderSignature({
                length: logs.length,
                lastType: lastLog.type || "",
                lastTargetId: lastLog.targetId || "",
                lastTimestamp: Number(lastLog.timestamp) || 0,
                lastText: lastLog.text || ""
            });

            if (signature === logRenderCache.signature) {
                if (forceBubbleRefresh) {
                    (logRenderCache.recentChats || []).forEach(l => {
                        showChatBubble(l.targetId, l.text, l.timestamp);
                    });
                }
                renderDesktopChatLogPanel(logs, signature);
                return;
            }

            // 最新ログ表示
            let display = "";
            for (let i = logs.length - 1; i >= 0; i--) {
                let l = logs[i];
                if (l.type === 'public' || l.targetId === myId || l.type === 'chat') {
                    let time = new Date(l.timestamp).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
                    display = `${time} ${l.text}`;
                    break;
                }
            }
            els.log.innerText = display + " (タップで履歴＆チャット)";

            const now = Date.now();
            const recentChats = [];
            logs.forEach(l => {
                if (l.type !== 'chat') return;
                if (!l.targetId) return;
                if (now - l.timestamp >= 4000) return;
                recentChats.push(l);
                showChatBubble(l.targetId, l.text, l.timestamp);
            });

            logRenderCache.signature = signature;
            logRenderCache.recentChats = recentChats;

            // 最新のタイムスタンプを記録
            if (lastLog) {
                lastChatTimeProcessed = Math.max(lastChatTimeProcessed, lastLog.timestamp);
            }

            // ★チャット通知
            if (lastLog.type === 'chat' && lastLog.targetId !== myId) {
                const match = lastLog.text.match(/^\[(.*?)\]/);
                const senderName = match ? match[1] : "";

                if (senderName !== myName && lastLog.timestamp > lastReadLogTime) {
                    // els.btnChat.classList.add("notify-active");
                    if (Date.now() - lastLog.timestamp < 2000) { // 2秒以内の新着なら鳴らす
                         playSoundEffect('chat');
                    }
                }
            }

            renderDesktopChatLogPanel(logs, signature);
        }

        // ▼▼▼ 新規関数: 吹き出し表示 ▼▼▼
        function showChatBubble(pid, text, timestamp) {
            const bubble = document.getElementById(`bubble-${pid}`);
            if (!bubble) return;
            const tsNum = Number(timestamp) || 0;
            const tsText = String(tsNum);
            if (lastBubbleTimestampByPid[pid] === tsNum && bubble.dataset.sekiBubbleTs === tsText) return;

            // 名前部分 "[Name] " を除去してメッセージだけにする
            const match = text.match(/^\[.*?\] (.*)$/);
            const msg = match ? match[1] : text;

            bubble.innerText = msg;

            // ★追加: 経過時間を計算して、アニメーションを「途中から」開始させる
            // これにより、画面が書き換わっても見た目上のアニメーションは継続しているように見えます
            const elapsed = Math.max(0, Date.now() - tsNum);

            // アニメーションリセット（連続投稿対応）
            bubble.classList.remove("active");
            void bubble.offsetWidth; // リフロー強制

            // ★重要: 経過時間分だけアニメーションを「巻き戻して」セットする
            // (例: 1秒経過していたら、最初から1秒進んだ状態から表示される)
            bubble.style.animationDelay = `-${elapsed}ms`;

            bubble.classList.add("active");
            bubble.dataset.sekiBubbleTs = tsText;
            lastBubbleTimestampByPid[pid] = tsNum;
        }

        function showLogHistory() {
            if(!gameState) return;
            let logs = gameState.logs || [];
            
            // ★既読処理
            lastReadLogTime = Date.now();
            // els.btnChat.classList.remove("notify-active");
            //els.log.classList.remove("notify-bar");

            let html = `
                <div id="chat-input-container">
                    <input type="text" id="chat-input" placeholder="// ENTER MESSAGE..." onkeydown="if(event.key==='Enter' && !event.isComposing){sendChat();}">
                    <button id="chat-send-btn" onclick="sendChat()">SEND</button>
                </div>
                <div id="log-list-container">
                    ${buildVisibleLogEntriesHtml(logs)}
                </div>
            `;
            openModal("チャット & ログ", html);
        }

        async function sendChatWithInput(inputId) {
            const input = document.getElementById(inputId);
            if (!input) {
                console.warn(`[chat] 入力欄(${inputId})が見つからないため送信を停止します。`);
                return false;
            }
            const msg = input.value.trim();
            if(!msg) return false;

            await pushLog(`[${myName}] ${msg}`, 'chat', myId);

            input.value = "";
            lastReadLogTime = Date.now();
            return true;
        }

        async function sendChat() {
            const sent = await sendChatWithInput('chat-input');
            if (!sent) return;
            showLogHistory(); 
        }

        async function sendDesktopChat() {
            const sent = await sendChatWithInput('desktop-chat-input');
            if (!sent) return;
            renderDesktopChatLogPanel((gameState && gameState.logs) ? gameState.logs : [], "");
        }
        
        // プレイヤーを入室順（joinedAtが早い順）に並べる関数
        function getSortedPlayerIds(players) {
            return Object.keys(players).sort((a, b) => {
                const tA = players[a].joinedAt || 0;
                const tB = players[b].joinedAt || 0;
                // 時間が同じならID順、あれば時間順
                if (tA === tB) return a.localeCompare(b);
                return tA - tB;
            });
        }

        async function leaveRoom() {
            if (!currentRoom || !myId) {
                location.reload();
                return;
            }

            if (window.confirm("部屋を抜けてタイトルに戻りますか？")) {
                try {
                    // 1. Firebaseから自分のプレイヤーデータを削除
                    await db.ref(`rooms/${currentRoom}/players/${myId}`).remove();
                    
                    // 2. ページをリロードして初期状態に戻る
                    location.reload();
                } catch (e) {
                    console.error("退室エラー:", e);
                    location.reload(); // エラーが起きても強制的にタイトルへ
                }
            }
        }

        function cancelQueuedRoomRender() {
            if (roomRenderRafId !== null) {
                cancelAnimationFrame(roomRenderRafId);
                roomRenderRafId = null;
            }
            queuedRoomSnapshot = null;
        }

        function scheduleRoomRender(snapshotData) {
            queuedRoomSnapshot = snapshotData;
            if (roomRenderRafId !== null) return;
            roomRenderRafId = requestAnimationFrame(() => {
                roomRenderRafId = null;
                const nextData = queuedRoomSnapshot;
                queuedRoomSnapshot = null;
                if (!nextData) return;
                gameState = nextData;
                render(nextData);
            });
        }

