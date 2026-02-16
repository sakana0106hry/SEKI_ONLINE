        let myId = localStorage.getItem("seki_uid_v2");
        if (!myId) {
            myId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
            localStorage.setItem("seki_uid_v2", myId);
        }
        
        let prevHandCounts = {}; // 手札枚数の記録用（SE再生に使用）
        const audioCache = {};
        // ★追加: ホスト設定の前回値を覚えておく変数
        let lastHostHandMode = 6;

        let currentRoom = null;
        let myName = "";
        let selectedIdx = -1;
        let gameState = null;
        let drawnCardTemp = null;
        let wasMyTurn = false;
        let hasFinished = false;
        let joined = false;
        let lastReadLogTime = 0; // チャット既読用
        let prevActivatedList = {}; // 前回の発動状況を記録する
        let prevRevealedRoles = {}; // カミングアウト状況を記録する
    
        let prevSoundId = 0;
        let lastGraveNumCount = -1; // 前回の数字墓地の枚数
        let lastGraveSymCount = -1; // 前回の記号墓地の枚数
        let millionaireSelectedHandIdxs = [];
        let millionaireMaxSelectable = 1;
        let necromancerTargetType = null;
        let necromancerTargetIdx = -1;
        // ★追加: ハッカー解除制御用の変数
        let lastCleanupTurnIdx = -1;
        let lastChatTimeProcessed = 0; // ★追加: チャット吹き出し用
        let roleDraftPendingSelection = null;
        let roleDraftAdvanceBusy = false;
        let roleDraftPhaseAudioToken = "";
        const ASSET_LOADING_MIN_MS = 2500;
        let assetLoadingShownAt = 0;
        let assetLoadingUiTimer = null;
        let assetLoadingLastProgress = {
            loaded: 0,
            total: 0,
            percent: 0,
            failedCount: 0,
            currentLabel: "準備中..."
        };
        let actionInFlight = false;
        let actionInFlightName = "";
        let roomRenderRafId = null;
        let queuedRoomSnapshot = null;
        const renderCache = {
            handSig: "",
            rolePanelSig: "",
            opponentsSig: "",
            boardSig: "",
            messageSig: "",
            nameBarSig: ""
        };
        const roleDraftMonitorCache = {
            signature: "",
            html: ""
        };
        const logRenderCache = {
            signature: "",
            recentChats: []
        };
        const counterHudCache = {
            signature: "",
            numHtml: "",
            symHtml: "",
            roleHtml: ""
        };
        const lastBubbleTimestampByPid = {};
        

        const els = {
            login: document.getElementById("login-screen"),
            game: document.getElementById("game-screen"),
            assetLoadingScreen: document.getElementById("asset-loading-screen"),
            assetLoadingBar: document.getElementById("asset-loading-bar"),
            assetLoadingText: document.getElementById("asset-loading-text"),
            assetLoadingCurrent: document.getElementById("asset-loading-current"),
            assetLoadingFailed: document.getElementById("asset-loading-failed"),
            assetLoadingActions: document.getElementById("asset-loading-actions"),
            assetLoadingRetryBtn: document.getElementById("asset-loading-retry-btn"),
            assetLoadingContinueBtn: document.getElementById("asset-loading-continue-btn"),
            bootTransitionScreen: document.getElementById("boot-transition-screen"),
            bootTransitionTitle: document.getElementById("boot-transition-title"),
            roomName: document.getElementById("roomName"),
            roomSuggestion: document.getElementById("room-suggestion-panel"),
            playerName: document.getElementById("playerName"),
            hand: document.getElementById("my-hand"),
            indicator: document.getElementById("indicator"),
            graveNum: document.getElementById("graveNum"),
            graveSym: document.getElementById("graveSym"),
            others: document.getElementById("other-players"),
            msg: document.getElementById("msg"),
            hostCtrl: document.getElementById("host-controls"),
            log: document.getElementById("game-log-bar"),
            modal: document.getElementById("modal-overlay"),
            mBox: document.getElementById("modal-box"),
            mTitle: document.getElementById("modal-title"),
            mContent: document.getElementById("modal-content"),
            deckNum: document.getElementById("deckNumCount"),
            deckSym: document.getElementById("deckSymCount"),
            roleDraftMonitor: document.getElementById("role-draft-monitor"),
            mFooter: document.getElementById("modal-footer"),
            btnJoin: document.getElementById("btn-join"),
            btnChat: document.getElementById("btn-chat-icon")
        };

        let loadingActionResolver = null;

        function syncAppViewportHeight() {
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const safeHeight = Math.max(1, Math.round(viewportHeight || 0));
            document.documentElement.style.setProperty("--app-height", `${safeHeight}px`);
        }

        function resetViewportScrollTop() {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }

        function stabilizeViewportForGameEntry() {
            const activeEl = document.activeElement;
            if (activeEl && typeof activeEl.blur === "function") {
                activeEl.blur();
            }
            syncAppViewportHeight();
            resetViewportScrollTop();
        }

        syncAppViewportHeight();
        window.addEventListener("resize", syncAppViewportHeight);
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                syncAppViewportHeight();
                resetViewportScrollTop();
            }, 120);
        });
        if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
            window.visualViewport.addEventListener("resize", syncAppViewportHeight);
        }

        function resetMyHandLayout(container = els.hand) {
            if (!container) return;
            const cards = container.querySelectorAll(".card");
            cards.forEach(card => {
                card.style.marginLeft = "";
                card.style.zIndex = "";
                card.style.position = "";
            });
        }

        function updateMyHandOverlap(container) {
            if (!container) return;
            const cards = Array.from(container.querySelectorAll(".card"));
            const cardCount = cards.length;
            if (cardCount === 0) return;

            const firstCard = cards[0];
            const cardWidth = Math.max(1, firstCard.offsetWidth || 0);
            const firstStyle = window.getComputedStyle(firstCard);
            const marginLeft = parseFloat(firstStyle.marginLeft) || 0;
            const marginRight = parseFloat(firstStyle.marginRight) || 0;
            let baseGap = marginLeft + marginRight;

            if (cardCount > 1) {
                const secondCard = cards[1];
                const measuredGap = secondCard.offsetLeft - firstCard.offsetLeft - cardWidth;
                if (Number.isFinite(measuredGap) && measuredGap >= 0) {
                    baseGap = measuredGap;
                }
            }

            const containerWidth = Math.max(0, container.clientWidth);
            let overlap = 0;

            if (cardCount > 1 && containerWidth > 0) {
                const neededOverlap = Math.ceil(((cardCount * cardWidth) + ((cardCount - 1) * baseGap) - containerWidth) / (cardCount - 1));
                const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

                const normalMinVisibleWidth = 18;
                const extremeMinVisibleWidth = 1;

                const maxOverlapNormal = Math.max(0, cardWidth - normalMinVisibleWidth);
                overlap = clamp(neededOverlap, 0, maxOverlapNormal);

                if (neededOverlap > maxOverlapNormal) {
                    const maxOverlapExtreme = Math.max(0, cardWidth - extremeMinVisibleWidth);
                    overlap = clamp(neededOverlap, 0, maxOverlapExtreme);
                }
            }

            cards.forEach((card, idx) => {
                card.style.position = "relative";
                if (idx > 0 && overlap > 0) {
                    card.style.marginLeft = `${marginLeft - overlap}px`;
                }

                const normalZIndex = idx + 1;
                const selectedZIndex = cardCount + 200 + idx;
                card.style.zIndex = String(card.classList.contains("selected") ? selectedZIndex : normalZIndex);
            });
        }

        function applyMyHandLayout() {
            if (!els.hand) return;
            resetMyHandLayout(els.hand);
            updateMyHandOverlap(els.hand);
        }

        function refreshMyHandCardZIndex(container = els.hand) {
            if (!container) return;
            const cards = Array.from(container.querySelectorAll(".card"));
            const cardCount = cards.length;
            cards.forEach((card, idx) => {
                const normalZIndex = idx + 1;
                const selectedZIndex = cardCount + 200 + idx;
                card.style.zIndex = String(card.classList.contains("selected") ? selectedZIndex : normalZIndex);
            });
        }

        function updateMyHandSelectionVisual(container = els.hand) {
            if (!container) return;
            const handCards = Array.from(container.querySelectorAll("[data-hand-index]"));
            handCards.forEach(card => {
                const cardIdx = Number(card.dataset.handIndex);
                const isSelected = Number.isFinite(cardIdx) && cardIdx === selectedIdx;
                card.classList.toggle("selected", isSelected);
            });
            refreshMyHandCardZIndex(container);
        }

        function refreshRoleDraftMonitorLayout() {
            const monitor = els.roleDraftMonitor || document.getElementById("role-draft-monitor");
            if (!monitor || monitor.classList.contains("hidden")) return;
            if (!monitor.dataset.roleDraftPhase) return;
            applyRoleDraftLayoutDensity(monitor);
        }

        window.addEventListener("resize", () => {
            applyMyHandLayout();
            refreshRoleDraftMonitorLayout();
        });
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                applyMyHandLayout();
                refreshRoleDraftMonitorLayout();
            }, 140);
        });
        if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
            window.visualViewport.addEventListener("resize", () => {
                applyMyHandLayout();
                refreshRoleDraftMonitorLayout();
            });
        }

        function escapeHtml(text) {
            return String(text || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function buildRenderSignature(payload) {
            try {
                return JSON.stringify(payload);
            } catch (e) {
                return `${Date.now()}`;
            }
        }

        function shortAssetLabel(label) {
            if (!label) return "-";
            const plain = String(label);
            const slashIdx = Math.max(plain.lastIndexOf("/"), plain.lastIndexOf("\\"));
            const base = slashIdx >= 0 ? plain.substring(slashIdx + 1) : plain;
            if (base.length <= 64) return base;
            return base.substring(0, 61) + "...";
        }

        function getAssetLoadingTimePercent() {
            if (!assetLoadingShownAt) return 100;
            const elapsed = Date.now() - assetLoadingShownAt;
            return Math.max(0, Math.min(100, Math.round((elapsed / ASSET_LOADING_MIN_MS) * 100)));
        }

        function renderAssetLoadingUI(progress) {
            const loaded = Number(progress && progress.loaded) || 0;
            const total = Number(progress && progress.total) || 0;
            const percent = Number(progress && progress.percent) || 0;
            const failedCount = Number(progress && progress.failedCount) || 0;
            const currentLabel = shortAssetLabel(progress && progress.currentLabel ? progress.currentLabel : "準備中...");
            const visualPercent = Math.min(percent, getAssetLoadingTimePercent());

            if (els.assetLoadingText) {
                const failedSuffix = failedCount > 0 ? ` / 失敗 ${failedCount}` : "";
                els.assetLoadingText.innerText = `${loaded} / ${total} (${visualPercent}%)${failedSuffix}`;
            }
            if (els.assetLoadingBar) {
                els.assetLoadingBar.style.width = `${Math.max(0, Math.min(visualPercent, 100))}%`;
            }
            if (els.assetLoadingCurrent) {
                els.assetLoadingCurrent.innerText = `現在: ${currentLabel}`;
            }
        }

        function updateAssetLoadingUI(progress) {
            assetLoadingLastProgress = {
                loaded: Number(progress && progress.loaded) || 0,
                total: Number(progress && progress.total) || 0,
                percent: Number(progress && progress.percent) || 0,
                failedCount: Number(progress && progress.failedCount) || 0,
                currentLabel: progress && progress.currentLabel ? progress.currentLabel : "準備中..."
            };
            renderAssetLoadingUI(assetLoadingLastProgress);
        }

        function showAssetLoadingScreen() {
            if (!els.assetLoadingScreen) return;
            els.assetLoadingScreen.classList.remove("hidden");
            assetLoadingShownAt = Date.now();
            assetLoadingLastProgress = {
                loaded: 0,
                total: 0,
                percent: 0,
                failedCount: 0,
                currentLabel: "準備中..."
            };
            updateAssetLoadingUI({ loaded: 0, total: 0, percent: 0, currentLabel: "準備中...", failedCount: 0 });

            if (assetLoadingUiTimer) clearInterval(assetLoadingUiTimer);
            assetLoadingUiTimer = setInterval(() => {
                renderAssetLoadingUI(assetLoadingLastProgress);
            }, 80);

            if (els.assetLoadingFailed) {
                els.assetLoadingFailed.classList.add("hidden");
                els.assetLoadingFailed.innerHTML = "";
            }
            if (els.assetLoadingActions) {
                els.assetLoadingActions.classList.add("hidden");
            }
            if (els.assetLoadingRetryBtn) els.assetLoadingRetryBtn.disabled = false;
            if (els.assetLoadingContinueBtn) els.assetLoadingContinueBtn.disabled = false;
        }

        async function hideAssetLoadingScreen() {
            if (!els.assetLoadingScreen || els.assetLoadingScreen.classList.contains("hidden")) return;

            const elapsed = Date.now() - assetLoadingShownAt;
            const waitMs = Math.max(0, ASSET_LOADING_MIN_MS - elapsed);
            if (waitMs > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
            renderAssetLoadingUI(assetLoadingLastProgress);

            els.assetLoadingScreen.classList.add("hidden");
            if (assetLoadingUiTimer) {
                clearInterval(assetLoadingUiTimer);
                assetLoadingUiTimer = null;
            }
            if (loadingActionResolver) {
                loadingActionResolver("continue");
                loadingActionResolver = null;
            }
        }

        async function showBootTransitionScreen() {
            if (!els.bootTransitionScreen) return;

            const screen = els.bootTransitionScreen;
            const title = els.bootTransitionTitle;
            let startWipeTimer = null;
            let forceFinishTimer = null;
            let finished = false;
            let resolved = false;

            const finish = () => {
                if (finished) return;
                finished = true;

                if (startWipeTimer) clearTimeout(startWipeTimer);
                if (forceFinishTimer) clearTimeout(forceFinishTimer);

                screen.classList.add("hidden");
                screen.classList.remove("is-wiping");
                if (title) title.classList.remove("is-active");
                screen.removeEventListener("animationend", onAnimEnd);
            };

            const finalize = (resolve) => {
                if (resolved) return;
                resolved = true;
                finish();
                resolve();
            };

            const onAnimEnd = (ev) => {
                if (ev.target !== screen) return;
                if (ev.animationName === "sekiBootNoiseOut" || ev.animationName === "sekiBootFadeOut") {
                    if (pendingResolve) finalize(pendingResolve);
                }
            };

            let pendingResolve = null;
            const waitOneFrame = () => new Promise(resolve => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    resolve();
                };
                const fallback = setTimeout(finish, 34);
                if (typeof requestAnimationFrame === "function") {
                    requestAnimationFrame(() => {
                        clearTimeout(fallback);
                        finish();
                    });
                }
            });

            screen.classList.remove("hidden");
            screen.classList.remove("is-wiping");
            if (title) title.classList.add("is-active");
            playSoundEffect('BOOTING');
            void screen.offsetWidth;

            screen.addEventListener("animationend", onAnimEnd);
            await waitOneFrame();
            await waitOneFrame();

            await new Promise(resolve => {
                pendingResolve = resolve;
                startWipeTimer = setTimeout(() => {
                    screen.classList.add("is-wiping");
                }, 980);

                forceFinishTimer = setTimeout(() => {
                    finalize(resolve);
                }, 2300);
            });
        }

        function renderAssetLoadingFailed(failedList) {
            if (!els.assetLoadingFailed || !els.assetLoadingActions) return;

            if (!Array.isArray(failedList) || failedList.length === 0) {
                els.assetLoadingFailed.classList.add("hidden");
                els.assetLoadingFailed.innerHTML = "";
                els.assetLoadingActions.classList.add("hidden");
                return;
            }

            const firstFive = failedList.slice(0, 5);
            const restCount = Math.max(0, failedList.length - firstFive.length);
            const listHtml = firstFive
                .map(item => `<li>${escapeHtml(shortAssetLabel(item && item.label ? item.label : item.url))}</li>`)
                .join("");
            const moreText = restCount > 0 ? `<div>...ほか ${restCount} 件</div>` : "";

            els.assetLoadingFailed.innerHTML = `
                <div>読み込み失敗: ${failedList.length} 件</div>
                <ul>${listHtml}</ul>
                ${moreText}
            `;
            els.assetLoadingFailed.classList.remove("hidden");
            els.assetLoadingActions.classList.remove("hidden");
        }

        function waitAssetLoadingAction() {
            if (!els.assetLoadingRetryBtn || !els.assetLoadingContinueBtn) return Promise.resolve("continue");

            if (loadingActionResolver) {
                loadingActionResolver("continue");
                loadingActionResolver = null;
            }

            return new Promise(resolve => {
                loadingActionResolver = resolve;

                els.assetLoadingRetryBtn.onclick = () => {
                    if (!loadingActionResolver) return;
                    const fn = loadingActionResolver;
                    loadingActionResolver = null;
                    fn("retry");
                };

                els.assetLoadingContinueBtn.onclick = () => {
                    if (!loadingActionResolver) return;
                    const fn = loadingActionResolver;
                    loadingActionResolver = null;
                    fn("continue");
                };
            });
        }

        const ROOM_CAPACITY = 5;
        let roomSuggestionTimer = null;
        let roomSuggestionCache = [];

        function setRoomSuggestionVisible(visible) {
            if (!els.roomSuggestion) return;
            if (visible) els.roomSuggestion.classList.remove("hidden");
            else els.roomSuggestion.classList.add("hidden");
        }

        function stopRoomSuggestionPolling() {
            if (roomSuggestionTimer !== null) {
                clearInterval(roomSuggestionTimer);
                roomSuggestionTimer = null;
            }
        }

        function renderRoomSuggestions(list) {
            if (!els.roomSuggestion || !els.roomName) return;

            const filterText = els.roomName.value.trim().toLowerCase();
            const filtered = list.filter(item =>
                !filterText || item.name.toLowerCase().includes(filterText)
            );

            els.roomSuggestion.innerHTML = "";

            const title = document.createElement("div");
            title.className = "room-suggestion-title";
            title.innerText = "Current Rooms";
            els.roomSuggestion.appendChild(title);

            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.className = "room-suggestion-empty";
                empty.innerText = "No matching rooms";
                els.roomSuggestion.appendChild(empty);
                return;
            }

            filtered.slice(0, 20).forEach((item) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "room-suggestion-item";
                btn.innerText = `${item.name} (${item.count}/${ROOM_CAPACITY})`;
                btn.addEventListener("mousedown", (ev) => {
                    ev.preventDefault();
                    els.roomName.value = item.name;
                    setRoomSuggestionVisible(false);
                    stopRoomSuggestionPolling();
                    if (els.playerName) els.playerName.focus();
                });
                els.roomSuggestion.appendChild(btn);
            });
        }

        async function refreshRoomSuggestions() {
            if (!db || !els.roomSuggestion || !els.roomName || currentRoom) return;
            try {
                const snapshot = await db.ref("rooms").get();
                const rooms = snapshot.val() || {};

                roomSuggestionCache = Object.entries(rooms)
                    .map(([name, data]) => {
                        const players = (data && data.players) ? data.players : {};
                        return { name, count: Object.keys(players).length };
                    })
                    .filter(item => !!item.name)
                    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, "ja"));

                renderRoomSuggestions(roomSuggestionCache);
            } catch (e) {
                els.roomSuggestion.innerHTML = `
                    <div class="room-suggestion-title">Current Rooms</div>
                    <div class="room-suggestion-empty">Failed to load room list</div>
                `;
            }
        }

        function startRoomSuggestionPolling() {
            if (roomSuggestionTimer !== null || currentRoom) return;
            refreshRoomSuggestions();
            roomSuggestionTimer = setInterval(refreshRoomSuggestions, 5000);
        }

        function setupRoomSuggestionEvents() {
            if (!els.roomName || !els.roomSuggestion) return;

            els.roomName.addEventListener("focus", () => {
                setRoomSuggestionVisible(true);
                if (roomSuggestionCache.length > 0) renderRoomSuggestions(roomSuggestionCache);
                startRoomSuggestionPolling();
            });

            els.roomName.addEventListener("click", () => {
                setRoomSuggestionVisible(true);
                if (roomSuggestionCache.length > 0) renderRoomSuggestions(roomSuggestionCache);
                startRoomSuggestionPolling();
            });

            els.roomName.addEventListener("input", () => {
                setRoomSuggestionVisible(true);
                if (roomSuggestionCache.length > 0) renderRoomSuggestions(roomSuggestionCache);
                else refreshRoomSuggestions();
            });

            els.roomName.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") {
                    setRoomSuggestionVisible(false);
                    stopRoomSuggestionPolling();
                }
            });

            document.addEventListener("mousedown", (ev) => {
                if (!els.roomSuggestion || els.roomSuggestion.classList.contains("hidden")) return;
                if (ev.target === els.roomName || els.roomSuggestion.contains(ev.target)) return;
                setRoomSuggestionVisible(false);
                stopRoomSuggestionPolling();
            });
        }

        setupRoomSuggestionEvents();

        function showRoleDraftRoleDetail(roleKey) {
            const info = ROLE_INFO[roleKey];
            if (!info) return;
            const groupKey = getRoleGroup(roleKey);
            const groupLabel = getRoleGroupLabel(groupKey);
            const html = `
                <div class="font-readable">
                    <p><strong>${groupLabel}</strong> / ${getRoleDisplayCode(roleKey)}</p>
                    <p><strong>${info.jp}</strong></p>
                    <p>${info.summary}</p>
                    <hr>
                    <div>${info.desc}</div>
                </div>
            `;
            openModal(`役職詳細: ${info.jp}`, html, { tone: "guide", size: "wide" });
        }

        function showRoleDraftUnusedDetail(roleKey) {
            showRoleDraftRoleDetail(roleKey);
        }

        function openRoleDraftDetail(ev, roleKey) {
            if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
            showRoleDraftRoleDetail(roleKey);
        }

        function fitRoleDraftRoleText(rootEl) {
            const scope = rootEl || document;
            const allTargets = Array.from(scope.querySelectorAll(".fit-role-text"));
            if (!allTargets.length) return;

            const groupedTargets = new Map();
            allTargets.forEach((el) => {
                const row = el.closest(".role-draft-choice-row") || scope;
                if (!groupedTargets.has(row)) groupedTargets.set(row, []);
                groupedTargets.get(row).push(el);
            });

            groupedTargets.forEach((targets) => {
                const visibleTargets = targets.filter((el) => el && el.clientWidth > 0);
                if (!visibleTargets.length) return;

                visibleTargets.forEach((el) => {
                    el.style.fontSize = "";
                });

                let sharedSize = Math.min(...visibleTargets.map((el) => parseFloat(window.getComputedStyle(el).fontSize) || 14));
                const minSize = 12;
                const needsShrink = () => visibleTargets.some((el) => (el.scrollWidth - el.clientWidth) > 0.5);
                let guard = 0;

                while (needsShrink() && sharedSize > minSize && guard < 24) {
                    sharedSize -= 0.5;
                    const px = `${sharedSize}px`;
                    visibleTargets.forEach((el) => {
                        el.style.fontSize = px;
                    });
                    guard += 1;
                }

                if (sharedSize <= minSize) {
                    visibleTargets.forEach((el) => {
                        el.style.fontSize = `${minSize}px`;
                    });
                }
            });
        }

        function applyRoleDraftLayoutDensity(monitorEl) {
            const monitor = monitorEl || els.roleDraftMonitor || document.getElementById("role-draft-monitor");
            if (!monitor) return;

            monitor.classList.remove("role-draft-density-compact", "role-draft-density-xcompact");
            const phase = monitor.dataset.roleDraftPhase || "";
            if (phase !== "selecting" && phase !== "resolving") {
                fitRoleDraftRoleText(monitor);
                return;
            }

            const stage = monitor.querySelector(".role-draft-stage");
            if (!stage) {
                fitRoleDraftRoleText(monitor);
                return;
            }

            const hasOverflow = () => {
                const stageOverflow = (stage.scrollHeight - stage.clientHeight) > 1;
                const monitorOverflow = (monitor.scrollHeight - monitor.clientHeight) > 1;
                return stageOverflow || monitorOverflow;
            };

            const monitorHeight = monitor.clientHeight || 0;
            if (monitorHeight > 0 && monitorHeight <= 520) monitor.classList.add("role-draft-density-compact");
            if (monitorHeight > 0 && monitorHeight <= 430) monitor.classList.add("role-draft-density-xcompact");

            fitRoleDraftRoleText(monitor);

            if (hasOverflow() && !monitor.classList.contains("role-draft-density-compact")) {
                monitor.classList.add("role-draft-density-compact");
                fitRoleDraftRoleText(monitor);
            }
            if (hasOverflow() && !monitor.classList.contains("role-draft-density-xcompact")) {
                monitor.classList.add("role-draft-density-xcompact");
                fitRoleDraftRoleText(monitor);
            }
        }

        function selectRoleDraftCandidate(roleKey) {
            if (!gameState || gameState.status !== "role_selecting" || !gameState.roleDraft) return;
            const rd = gameState.roleDraft;
            if (rd.phase !== "selecting") return;
            const currentPid = getRoleDraftActivePlayerId(gameState);
            if (currentPid !== myId) return;

            const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
            const validRoles = ROLE_DRAFT_GROUP_ORDER.map(groupKey => myChoices[groupKey]).filter(Boolean);
            if (!validRoles.includes(roleKey)) return;

            roleDraftPendingSelection = roleKey;
            renderRoleDraftMonitor(gameState);
        }

        let roleDraftConfirmBusy = false;
        async function confirmRoleDraftSelection() {
            if (roleDraftConfirmBusy) return;
            if (!gameState || gameState.status !== "role_selecting" || !gameState.roleDraft) return;
            if (!currentRoom) return;

            const selectedRoleKey = roleDraftPendingSelection;
            if (!selectedRoleKey) {
                showInfoModal("役職選択", "役職を1つ選択してください。");
                return;
            }

            roleDraftConfirmBusy = true;
            try {
                const roomRef = db.ref(`rooms/${currentRoom}`);
                const result = await roomRef.transaction((state) => {
                    if (!state || state.status !== "role_selecting" || !state.roleDraft) return state;

                    const rd = state.roleDraft;
                    if ((rd.phase || "") !== "selecting") return state;

                    const order = Array.isArray(rd.order) ? rd.order : [];
                    const currentIdx = Math.max(0, Number(rd.currentIdx) || 0);
                    const activePid = order[currentIdx] || null;
                    if (activePid !== myId) return state;

                    const alreadySelected = rd.selectedRoles && rd.selectedRoles[myId];
                    if (alreadySelected) return state;

                    const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
                    const validRoles = ROLE_DRAFT_GROUP_ORDER.map(groupKey => myChoices[groupKey]).filter(Boolean);
                    if (!validRoles.includes(selectedRoleKey)) return state;

                    const selectedGroup = getRoleGroup(selectedRoleKey);
                    if (!selectedGroup) return state;

                    rd.selectedRoles = { ...(rd.selectedRoles || {}), [myId]: selectedRoleKey };
                    rd.selectedGroups = { ...(rd.selectedGroups || {}), [myId]: selectedGroup };

                    const unselectedRoles = validRoles.filter(roleKey => roleKey !== selectedRoleKey);
                    rd.unusedByPlayer = { ...(rd.unusedByPlayer || {}), [myId]: unselectedRoles };
                    rd.resolve = {
                        playerId: myId,
                        selectedRole: selectedRoleKey,
                        selectedGroup: selectedGroup,
                        unselectedRoles: unselectedRoles
                    };

                    rd.currentIdx = currentIdx + 1;
                    const now = Date.now();
                    rd.phase = "resolving";
                    rd.phaseStartedAt = now;
                    rd.phaseEndsAt = now + ROLE_DRAFT_PHASE_MS.resolving;

                    if (rd.currentIdx >= order.length) {
                        rd.publicUnusedRoles = collectPublicUnusedRoles(rd.unusedByPlayer || {});
                        state.publicRoleInfo = {
                            unselectedRoles: [...rd.publicUnusedRoles],
                            selectedGroups: { ...(rd.selectedGroups || {}) }
                        };
                    }

                    const pName = (state.players && state.players[myId] && state.players[myId].name) ? state.players[myId].name : "Player";
                    appendLogEntryToState(state, `${pName} が役職を確定しました（${getRoleGroupLabel(selectedGroup)}）`, "public");

                    state.roleDraft = rd;
                    state.lastSound = { type: "CONFIRM", id: now + Math.floor(Math.random() * 1000) };
                    return state;
                });

                if (!result.committed) {
                    showInfoModal("役職選択", "確定処理に失敗しました。最新状態で再試行してください。");
                    return;
                }

                roleDraftPendingSelection = null;
            } catch (e) {
                showInfoModal("エラー", "役職確定エラー: " + e.message);
            } finally {
                roleDraftConfirmBusy = false;
            }
        }

        function handleRoleDraftPhaseSound(data = gameState) {
            if (!data || data.status !== "role_selecting" || !data.roleDraft) {
                roleDraftPhaseAudioToken = "";
                return;
            }

            const rd = data.roleDraft;
            const token = `${rd.phase || ""}:${rd.phaseStartedAt || 0}`;
            if (token === roleDraftPhaseAudioToken) return;
            roleDraftPhaseAudioToken = token;

            if (rd.phase === "booting") {
                playSoundEffect("BOOTING");
            } else if (rd.phase === "system_online") {
                playSoundEffect("SYSTEM_ONLINE");
            }
        }

        function renderRoleDraftMonitor(data = gameState) {
            const monitor = els.roleDraftMonitor || document.getElementById("role-draft-monitor");
            if (!monitor) return;

            if (!data || data.status !== "role_selecting" || !data.roleDraft) {
                monitor.classList.add("hidden");
                monitor.classList.remove("phase-noise-out");
                monitor.classList.remove("role-draft-density-compact", "role-draft-density-xcompact");
                delete monitor.dataset.roleDraftPhase;
                if (monitor.innerHTML) monitor.innerHTML = "";
                roleDraftMonitorCache.signature = "";
                roleDraftMonitorCache.html = "";
                roleDraftPendingSelection = null;
                handleRoleDraftPhaseSound(null);
                return;
            }

            const rd = data.roleDraft;
            const players = data.players || {};
            const phase = rd.phase || "booting";
            const currentPid = getRoleDraftActivePlayerId(data);
            const currentName = (currentPid && players[currentPid]) ? players[currentPid].name : "Player";
            const resolveInfo = rd.resolve || null;
            const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
            const mySelectedRole = (rd.selectedRoles && rd.selectedRoles[myId]) ? rd.selectedRoles[myId] : null;
            const isMySelecting = phase === "selecting" && currentPid === myId && !mySelectedRole;
            const isMyResolvingSelf = phase === "resolving" && !!resolveInfo && resolveInfo.playerId === myId && !!mySelectedRole;
            const canRenderOwnRoleCards = isMySelecting || isMyResolvingSelf;

            if (!isMySelecting) roleDraftPendingSelection = null;
            const selectedRoleForUi = isMySelecting ? roleDraftPendingSelection : null;

            let headline = "";
            let bodyHtml = "";
            let footerHtml = "";

            if (phase === "booting") {
                headline = "ROLE DRAFT MONITOR / BOOTING";
                bodyHtml = `
                    <div class="role-draft-logo-wrap">
                        <img src="./images/new_logo.png" class="role-draft-logo" alt="S.E.K.I.">
                    </div>
                `;
                footerHtml = `<div class="role-draft-footer"><span class="role-draft-selected-label">役職選択システムを初期化中...</span></div>`;
            } else if (phase === "selecting" || phase === "resolving") {
                if (phase === "selecting") headline = `${currentName} が役職を選択中`;
                else {
                    const resolvedName = (resolveInfo && resolveInfo.playerId && players[resolveInfo.playerId]) ? players[resolveInfo.playerId].name : currentName;
                    headline = `${resolvedName} の役職を確定中...`;
                }

                let cardsHtml = "";
                ROLE_DRAFT_GROUP_ORDER.forEach(groupKey => {
                    const groupMeta = ROLE_GROUP_META[groupKey] || {};
                    const groupClass = groupMeta.cssClass || "";
                    const roleKey = myChoices[groupKey];
                    const info = ROLE_INFO[roleKey] || null;
                    let cardClass = `role-draft-card ${groupClass}`.trim();

                    if (phase === "resolving" && resolveInfo) {
                        if (canRenderOwnRoleCards) {
                            if (roleKey && resolveInfo.selectedRole !== roleKey) cardClass += " fade-out";
                        } else if (resolveInfo.selectedGroup !== groupKey) {
                            cardClass += " fade-out";
                        }
                    }

                    if (canRenderOwnRoleCards && roleKey) {
                        const selectedRoleForCard = isMySelecting ? selectedRoleForUi : mySelectedRole;
                        if (selectedRoleForCard === roleKey) cardClass += " selected";
                        if (isMySelecting) cardClass += " selectable";
                        else cardClass += " disabled";
                        const safeRoleKey = String(roleKey).replace(/'/g, "\\'");
                        const roleImage = (typeof ROLE_IMAGES !== "undefined" && ROLE_IMAGES[roleKey]) ? ROLE_IMAGES[roleKey] : "";
                        const roleImageHtml = roleImage
                            ? `<div class="role-draft-card-media"><img src="${roleImage}" alt="${safeRoleKey}"></div>`
                            : "";
                        const onclickAttr = isMySelecting ? ` onclick="selectRoleDraftCandidate('${safeRoleKey}')"` : "";
                        cardsHtml += `
                            <div class="${cardClass}"${onclickAttr}>
                                ${roleImageHtml}
                                <div class="role-draft-card-inner">
                                    <div class="role-draft-group">${groupMeta.label || groupKey}</div>
                                    <div class="role-draft-role fit-role-text">${getRoleDisplayCode(roleKey)}</div>
                                    <div class="role-draft-role-jp">${info ? info.jp : "-"}</div>
                                </div>
                            </div>
                        `;
                    } else {
                        cardClass += " disabled";
                        cardsHtml += `
                            <div class="${cardClass}">
                                <div class="role-draft-card-inner">
                                    <div class="role-draft-group">${groupMeta.label || groupKey}</div>
                                    <div class="role-draft-placeholder">CLASSIFIED</div>
                                </div>
                            </div>
                        `;
                    }
                });

                bodyHtml = `<div class="role-draft-choice-row">${cardsHtml}</div>`;
                if (isMySelecting) {
                    const selectedLabel = selectedRoleForUi ? `${getRoleDisplayName(selectedRoleForUi)} (${getRoleDisplayCode(selectedRoleForUi)})` : "未選択";
                    footerHtml = `
                        <div class="role-draft-footer">
                            <span class="role-draft-selected-label">選択中: ${selectedLabel}</span>
                            <button type="button" class="role-draft-confirm-btn" onclick="confirmRoleDraftSelection()" ${selectedRoleForUi ? "" : "disabled"}>CONFIRM</button>
                        </div>
                    `;
                } else if (mySelectedRole) {
                    footerHtml = `
                        <div class="role-draft-footer">
                            <span class="role-draft-selected-label">確定済み: ${getRoleDisplayName(mySelectedRole)} (${getRoleDisplayCode(mySelectedRole)})</span>
                        </div>
                    `;
                } else {
                    footerHtml = `
                        <div class="role-draft-footer">
                            <span class="role-draft-selected-label">待機中: ${currentName} の選択を待っています</span>
                        </div>
                    `;
                }
            } else if (phase === "reveal_unused") {
                headline = "UNSELECTED ROLES / PUBLIC";
                const list = sortRoleKeysForDisplay(rd.publicUnusedRoles || []);
                const grouped = ROLE_DRAFT_GROUP_ORDER.reduce((acc, groupKey) => {
                    acc[groupKey] = [];
                    return acc;
                }, {});

                list.forEach(roleKey => {
                    const groupKey = getRoleGroup(roleKey);
                    if (!groupKey || !grouped[groupKey]) return;
                    grouped[groupKey].push(roleKey);
                });

                const sections = ROLE_DRAFT_GROUP_ORDER.map(groupKey => {
                    const roleKeys = grouped[groupKey] || [];
                    if (roleKeys.length === 0) return "";

                    const groupMeta = ROLE_GROUP_META[groupKey] || {};
                    const groupClass = groupMeta.cssClass || "";
                    const groupLabel = groupMeta.label || groupKey;
                    const groupTag = String(groupLabel).charAt(0).toUpperCase();
                    const rows = roleKeys.map(roleKey => {
                        const roleInfo = ROLE_INFO[roleKey];
                        const label = roleInfo ? roleInfo.jp : roleKey;
                        const safeRoleKey = String(roleKey).replace(/'/g, "\\'");
                        return `
                            <button type="button" class="role-draft-unused-item ${groupClass}" onclick="showRoleDraftUnusedDetail('${safeRoleKey}')">
                                <span class="role-draft-unused-item-main">${label}</span>
                                <span class="role-draft-unused-item-sub">${getRoleDisplayCode(roleKey)}</span>
                                <span class="role-draft-unused-item-meta">${groupLabel}</span>
                            </button>
                        `;
                    }).join("");

                    return `
                        <section class="role-draft-unused-group ${groupClass}">
                            <div class="role-draft-unused-group-title">
                                <span class="role-draft-unused-group-tag">${groupTag}</span>
                                <span>${groupLabel}</span>
                            </div>
                            <div class="role-draft-unused-group-rows">${rows}</div>
                        </section>
                    `;
                }).join("");

                bodyHtml = `
                    <div class="role-draft-text-block role-draft-text-block-unused">
                        <div class="role-draft-subtext">プレイヤーが選ばなかったこれらの役職は登場しません</div>
                        <div class="role-draft-unused-list">${sections || '<div class="role-draft-subtext">公開対象なし</div>'}</div>
                    </div>
                `;
                footerHtml = `<div class="role-draft-footer"><span class="role-draft-selected-label">公開データを同期中...</span></div>`;
            } else if (phase === "system_online") {
                headline = "AUTHENTICATION COMPLETE";
                bodyHtml = `
                    <div class="role-draft-text-block">
                        <div class="role-draft-maintext role-draft-maintext-system-online">ALL ROLES AUTHENTICATED.</div>
                        <div class="role-draft-maintext role-draft-maintext-system-online">SYSTEM ONLINE...</div>
                    </div>
                `;
            } else {
                headline = "TRANSITIONING";
                bodyHtml = `
                    <div class="role-draft-text-block">
                        <div class="role-draft-maintext">LOADING...</div>
                        <div class="role-draft-transition-meter" aria-hidden="true">
                            <div class="role-draft-transition-meter-fill"></div>
                        </div>
                        <div class="role-draft-subtext">バトルフィールドへ移行します</div>
                    </div>
                `;
            }

            const nextHtml = `
                <div class="role-draft-stage">
                    <p class="role-draft-headline">${headline}</p>
                    ${bodyHtml}
                    ${footerHtml}
                </div>
            `;
            const monitorSignature = buildRenderSignature({
                phase,
                phaseStartedAt: rd.phaseStartedAt || 0,
                phaseEndsAt: rd.phaseEndsAt || 0,
                currentPid: currentPid || null,
                currentName,
                resolveInfo,
                myChoices,
                mySelectedRole,
                selectedRoleForUi,
                publicUnusedRoles: rd.publicUnusedRoles || [],
                selectedGroups: rd.selectedGroups || {}
            });
            const shouldPatchMonitor = (roleDraftMonitorCache.signature !== monitorSignature) || (roleDraftMonitorCache.html !== nextHtml);

            monitor.classList.remove("hidden");
            monitor.classList.toggle("phase-noise-out", phase === "noise_out");
            monitor.dataset.roleDraftPhase = phase;
            if (shouldPatchMonitor) {
                monitor.innerHTML = nextHtml;
                roleDraftMonitorCache.signature = monitorSignature;
                roleDraftMonitorCache.html = nextHtml;
                applyRoleDraftLayoutDensity(monitor);
            }
            handleRoleDraftPhaseSound(data);
        }

        async function advanceRoleDraftPhaseIfNeeded(data = gameState) {
            if (roleDraftAdvanceBusy) return;
            if (!data || data.status !== "role_selecting" || !data.roleDraft || !currentRoom) return;
            if (getRoleDraftHostId(data) !== myId) return;

            const rd = data.roleDraft;
            const phaseEndsAt = Number(rd.phaseEndsAt) || 0;
            if (phaseEndsAt <= 0 || Date.now() < phaseEndsAt) return;

            roleDraftAdvanceBusy = true;
            try {
                await db.ref(`rooms/${currentRoom}`).transaction((state) => {
                    if (!state || state.status !== "role_selecting" || !state.roleDraft) return state;

                    const currentRd = state.roleDraft;
                    const now = Date.now();
                    const phase = currentRd.phase || "booting";
                    const endAt = Number(currentRd.phaseEndsAt) || 0;
                    if (endAt > 0 && now < endAt) return state;

                    let clearRoleDraft = false;

                    if (phase === "booting") {
                        currentRd.phase = "selecting";
                        currentRd.phaseStartedAt = now;
                        currentRd.phaseEndsAt = 0;
                        currentRd.resolve = null;
                    } else if (phase === "resolving") {
                        const order = Array.isArray(currentRd.order) ? currentRd.order : [];
                        const done = (Number(currentRd.currentIdx) || 0) >= order.length;
                        if (done) {
                            currentRd.phase = "reveal_unused";
                            currentRd.phaseStartedAt = now;
                            currentRd.phaseEndsAt = now + ROLE_DRAFT_PHASE_MS.reveal_unused;
                            currentRd.resolve = null;
                            if (!Array.isArray(currentRd.publicUnusedRoles) || currentRd.publicUnusedRoles.length === 0) {
                                currentRd.publicUnusedRoles = collectPublicUnusedRoles(currentRd.unusedByPlayer || {});
                            }
                            state.publicRoleInfo = {
                                unselectedRoles: [...(currentRd.publicUnusedRoles || [])],
                                selectedGroups: { ...(currentRd.selectedGroups || {}) }
                            };
                            appendLogEntryToState(state, "未選択役職を公開しました", "public");
                        } else {
                            currentRd.phase = "selecting";
                            currentRd.phaseStartedAt = now;
                            currentRd.phaseEndsAt = 0;
                            currentRd.resolve = null;
                        }
                    } else if (phase === "reveal_unused") {
                        currentRd.phase = "system_online";
                        currentRd.phaseStartedAt = now;
                        currentRd.phaseEndsAt = now + ROLE_DRAFT_PHASE_MS.system_online;
                    } else if (phase === "system_online") {
                        currentRd.phase = "noise_out";
                        currentRd.phaseStartedAt = now;
                        currentRd.phaseEndsAt = now + ROLE_DRAFT_PHASE_MS.noise_out;
                    } else if (phase === "noise_out") {
                        const finalRoles = { ...(currentRd.selectedRoles || {}) };
                        const selectedGroups = { ...(currentRd.selectedGroups || {}) };
                        const publicUnusedRoles = Array.isArray(currentRd.publicUnusedRoles)
                            ? [...currentRd.publicUnusedRoles]
                            : collectPublicUnusedRoles(currentRd.unusedByPlayer || {});
                        const revealed = { ...(state.revealedRoles || {}) };

                        Object.entries(finalRoles).forEach(([pid, roleKey]) => {
                            if (roleKey === "EMPEROR") revealed[pid] = true;
                        });

                        state.roles = finalRoles;
                        state.revealedRoles = revealed;
                        state.publicRoleInfo = {
                            unselectedRoles: publicUnusedRoles,
                            selectedGroups: selectedGroups
                        };
                        state.status = "playing";
                        state.turnIdx = 0;
                        state.lastSound = { type: "GAME_START", id: now + Math.floor(Math.random() * 1000) };
                        appendLogEntryToState(state, "ALL ROLES AUTHENTICATED. SYSTEM ONLINE...", "public");

                        Object.keys(finalRoles).forEach(pid => {
                            if (finalRoles[pid] !== "EMPEROR") return;
                            const pName = (state.players && state.players[pid]) ? state.players[pid].name : "Player";
                            appendLogEntryToState(state, `${pName} は [皇帝] であることをカミングアウトしました！`, "public");
                        });

                        clearRoleDraft = true;
                    }

                    state.roleDraft = clearRoleDraft ? null : currentRd;
                    return state;
                });
            } catch (e) {
                console.warn("role draft phase advance error", e);
            } finally {
                roleDraftAdvanceBusy = false;
            }
        }

        setInterval(() => {
            if (!gameState || gameState.status !== "role_selecting") return;
            advanceRoleDraftPhaseIfNeeded(gameState);
        }, 250);

