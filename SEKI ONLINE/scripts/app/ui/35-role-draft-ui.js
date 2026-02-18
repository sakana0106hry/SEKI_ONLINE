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
            if (phase !== "selecting" && phase !== "resolving" && phase !== "duel_optimize") {
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
            const draftGroupOrder = (rd.noRoleMode === true)
                ? []
                : (Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER);

            const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
            const validRoles = draftGroupOrder.map(groupKey => myChoices[groupKey]).filter(Boolean);
            if (!validRoles.includes(roleKey)) return;

            roleDraftPendingSelection = roleKey;
            renderRoleDraftMonitor(gameState);
        }

        const DUEL_OPTIMIZE_SYMBOLS = ["REVERSE", "TRADE", "DIG UP"];

        function buildDuelOptimizePreviewHand(baseHand = [], selectedSymbols = []) {
            const symbolCards = (Array.isArray(selectedSymbols) ? selectedSymbols : [])
                .filter(val => DUEL_OPTIMIZE_SYMBOLS.includes(val))
                .map(val => ({ type: "sym", val }));
            return sortCards([...(baseHand || []), ...symbolCards]);
        }

        function sanitizeDuelOptimizeLocalSelection(data = gameState) {
            const rd = (data && data.roleDraft) ? data.roleDraft : null;
            if (!rd || rd.phase !== "duel_optimize") {
                duelOptimizeSelectedSymbols = [];
                duelOptimizeExcludeIndices = [];
                duelOptimizeConfirmBusy = false;
                return;
            }

            const duelOptimize = rd.duelOptimize || {};
            const submissions = duelOptimize.submissions || {};
            const mySubmission = submissions[myId] || null;
            if (mySubmission) {
                duelOptimizeSelectedSymbols = Array.isArray(mySubmission.symbols)
                    ? [...mySubmission.symbols]
                    : [];
                duelOptimizeExcludeIndices = [];
                duelOptimizeConfirmBusy = false;
                return;
            }

            const normalizedSymbols = [];
            const symbolCounts = { REVERSE: 0, TRADE: 0, "DIG UP": 0 };
            (Array.isArray(duelOptimizeSelectedSymbols) ? duelOptimizeSelectedSymbols : []).forEach(sym => {
                if (!DUEL_OPTIMIZE_SYMBOLS.includes(sym)) return;
                if (normalizedSymbols.length >= 3) return;
                if (symbolCounts[sym] >= 2) return;
                symbolCounts[sym] += 1;
                normalizedSymbols.push(sym);
            });
            duelOptimizeSelectedSymbols = normalizedSymbols;

            const baseHand = sortCards(deepCopy((data.hands && data.hands[myId]) || []));
            const previewHand = buildDuelOptimizePreviewHand(baseHand, duelOptimizeSelectedSymbols);
            const uniqueIdx = [];
            const seen = new Set();
            (Array.isArray(duelOptimizeExcludeIndices) ? duelOptimizeExcludeIndices : []).forEach(rawIdx => {
                const idx = Number(rawIdx);
                if (!Number.isInteger(idx)) return;
                if (idx < 0 || idx >= previewHand.length) return;
                if (seen.has(idx)) return;
                seen.add(idx);
                uniqueIdx.push(idx);
            });
            duelOptimizeExcludeIndices = uniqueIdx.slice(0, 4);
        }

        function toggleDuelOptimizeSymbol(symbolVal) {
            if (!gameState || gameState.status !== "role_selecting" || !gameState.roleDraft) return;
            const rd = gameState.roleDraft;
            if (rd.phase !== "duel_optimize") return;
            if (!DUEL_OPTIMIZE_SYMBOLS.includes(symbolVal)) return;
            const duelOptimize = rd.duelOptimize || {};
            const submissions = duelOptimize.submissions || {};
            if (submissions[myId]) return;

            sanitizeDuelOptimizeLocalSelection(gameState);
            const currentCount = duelOptimizeSelectedSymbols.filter(val => val === symbolVal).length;
            const canAdd = duelOptimizeSelectedSymbols.length < 3 && currentCount < 2;
            if (canAdd) {
                duelOptimizeSelectedSymbols.push(symbolVal);
            } else if (currentCount > 0) {
                const removeIdx = duelOptimizeSelectedSymbols.lastIndexOf(symbolVal);
                if (removeIdx >= 0) duelOptimizeSelectedSymbols.splice(removeIdx, 1);
            }
            sanitizeDuelOptimizeLocalSelection(gameState);
            renderRoleDraftMonitor(gameState);
        }

        function toggleDuelOptimizeExclude(index) {
            if (!gameState || gameState.status !== "role_selecting" || !gameState.roleDraft) return;
            const rd = gameState.roleDraft;
            if (rd.phase !== "duel_optimize") return;
            const duelOptimize = rd.duelOptimize || {};
            const submissions = duelOptimize.submissions || {};
            if (submissions[myId]) return;

            sanitizeDuelOptimizeLocalSelection(gameState);
            const idx = Number(index);
            const baseHand = sortCards(deepCopy((gameState.hands && gameState.hands[myId]) || []));
            const previewHand = buildDuelOptimizePreviewHand(baseHand, duelOptimizeSelectedSymbols);
            if (!Number.isInteger(idx) || idx < 0 || idx >= previewHand.length) return;

            const currentPos = duelOptimizeExcludeIndices.indexOf(idx);
            if (currentPos >= 0) {
                duelOptimizeExcludeIndices.splice(currentPos, 1);
            } else if (duelOptimizeExcludeIndices.length < 4) {
                duelOptimizeExcludeIndices.push(idx);
            }
            sanitizeDuelOptimizeLocalSelection(gameState);
            renderRoleDraftMonitor(gameState);
        }

        async function confirmDuelOptimizeSelection() {
            if (duelOptimizeConfirmBusy) return;
            if (!gameState || gameState.status !== "role_selecting" || !gameState.roleDraft) return;
            if (!currentRoom) return;

            const rd = gameState.roleDraft;
            if (rd.phase !== "duel_optimize") return;
            const duelOptimize = rd.duelOptimize || {};
            const submissions = duelOptimize.submissions || {};
            if (submissions[myId]) {
                showInfoModal("OPTIMIZE", "すでに確定済みです。");
                return;
            }

            sanitizeDuelOptimizeLocalSelection(gameState);
            const selectedSymbols = [...duelOptimizeSelectedSymbols];
            const excludeIndices = [...duelOptimizeExcludeIndices];
            const baseHand = sortCards(deepCopy((gameState.hands && gameState.hands[myId]) || []));
            const previewHand = buildDuelOptimizePreviewHand(baseHand, selectedSymbols);

            if (selectedSymbols.length !== 3) {
                showInfoModal("OPTIMIZE", "記号カードを3枚選択してください。");
                return;
            }
            if (previewHand.length !== 13) {
                showInfoModal("OPTIMIZE", "手札13枚の構成が不正です。最新状態で再試行してください。");
                return;
            }
            if (excludeIndices.length !== 4) {
                showInfoModal("OPTIMIZE", "除外するカードを4枚選択してください。");
                return;
            }
            const excludeSet = new Set(excludeIndices);
            if (excludeSet.size !== 4) {
                showInfoModal("OPTIMIZE", "除外カードの選択が重複しています。");
                return;
            }

            duelOptimizeConfirmBusy = true;
            try {
                const roomRef = db.ref(`rooms/${currentRoom}`);
                const result = await roomRef.transaction((state) => {
                    if (!state || state.status !== "role_selecting" || !state.roleDraft) return state;

                    const txRd = state.roleDraft;
                    if ((txRd.phase || "") !== "duel_optimize") return state;
                    if (!txRd.duelMode) return state;
                    const order = Array.isArray(txRd.order) ? txRd.order : [];
                    if (order.length !== 2 || !order.includes(myId)) return false;

                    const txDuelOptimize = txRd.duelOptimize || {};
                    if (txDuelOptimize.enabled !== true) return false;
                    const txSubmissions = { ...(txDuelOptimize.submissions || {}) };
                    if (txSubmissions[myId]) return state;

                    const symbolCounts = { REVERSE: 0, TRADE: 0, "DIG UP": 0 };
                    const txSelectedSymbols = [];
                    selectedSymbols.forEach(sym => {
                        if (!DUEL_OPTIMIZE_SYMBOLS.includes(sym)) return;
                        if (symbolCounts[sym] >= 2) return;
                        if (txSelectedSymbols.length >= 3) return;
                        symbolCounts[sym] += 1;
                        txSelectedSymbols.push(sym);
                    });
                    if (txSelectedSymbols.length !== 3) return false;

                    let txDeckSym = [...(state.deckSym || [])];
                    for (let i = 0; i < txSelectedSymbols.length; i++) {
                        const sym = txSelectedSymbols[i];
                        const idx = txDeckSym.findIndex(c => c && c.type === "sym" && c.val === sym);
                        if (idx < 0) return false;
                        txDeckSym.splice(idx, 1);
                    }

                    const txExcludeIndices = [...excludeIndices].map(v => Number(v));
                    if ((new Set(txExcludeIndices)).size !== 4) return false;
                    if (txExcludeIndices.some(idx => !Number.isInteger(idx))) return false;
                    const txBaseHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                    if (txBaseHand.length !== 10) return false;
                    if (txBaseHand.some(c => !c || c.type !== "num")) return false;
                    const txPreviewHand = buildDuelOptimizePreviewHand(txBaseHand, txSelectedSymbols);
                    if (txPreviewHand.length !== 13) return false;
                    if (txExcludeIndices.some(idx => idx < 0 || idx >= txPreviewHand.length)) return false;

                    txSubmissions[myId] = {
                        symbols: txSelectedSymbols,
                        excludeIndices: txExcludeIndices,
                        submittedAt: Date.now()
                    };
                    txRd.duelOptimize = {
                        ...txDuelOptimize,
                        enabled: true,
                        submissions: txSubmissions
                    };
                    state.deckSym = txDeckSym;

                    const allSubmitted = order.every(pid => !!txSubmissions[pid]);
                    if (allSubmitted) {
                        let exclusion = [...(state.exclusion || [])];

                        for (let i = 0; i < order.length; i++) {
                            const pid = order[i];
                            const submission = txSubmissions[pid];
                            if (!submission) return false;

                            const pidBaseHand = sortCards(deepCopy((state.hands && state.hands[pid]) || []));
                            if (pidBaseHand.length !== 10) return false;
                            if (pidBaseHand.some(c => !c || c.type !== "num")) return false;

                            const pidSymbols = Array.isArray(submission.symbols) ? submission.symbols : [];
                            if (pidSymbols.length !== 3) return false;
                            const pidSymbolCount = { REVERSE: 0, TRADE: 0, "DIG UP": 0 };
                            for (let j = 0; j < pidSymbols.length; j++) {
                                const sym = pidSymbols[j];
                                if (!DUEL_OPTIMIZE_SYMBOLS.includes(sym)) return false;
                                pidSymbolCount[sym] += 1;
                                if (pidSymbolCount[sym] > 2) return false;
                            }

                            const pidPreview = buildDuelOptimizePreviewHand(pidBaseHand, pidSymbols);
                            if (pidPreview.length !== 13) return false;

                            const pidExcludeIndices = Array.isArray(submission.excludeIndices)
                                ? submission.excludeIndices.map(v => Number(v))
                                : [];
                            if (pidExcludeIndices.length !== 4) return false;
                            if ((new Set(pidExcludeIndices)).size !== 4) return false;

                            const sortedRemoveIdx = [...pidExcludeIndices].sort((a, b) => b - a);
                            let pidFinalHand = [...pidPreview];
                            const excludedCards = [];
                            for (let j = 0; j < sortedRemoveIdx.length; j++) {
                                const idx = sortedRemoveIdx[j];
                                if (!Number.isInteger(idx) || idx < 0 || idx >= pidFinalHand.length) return false;
                                const removed = pidFinalHand.splice(idx, 1)[0];
                                if (!removed) return false;
                                excludedCards.push(removed);
                            }
                            if (pidFinalHand.length !== 9) return false;

                            state.hands = state.hands || {};
                            state.hands[pid] = sortCards(pidFinalHand);
                            exclusion = exclusion.concat(excludedCards);

                            const pName = (state.players && state.players[pid] && state.players[pid].name)
                                ? state.players[pid].name
                                : "Player";
                            const excludedText = excludedCards.map(c => c.val).join(", ");
                            appendLogEntryToState(state, `${pName} のOPTIMIZE除外: [${excludedText}]`, "public");
                        }

                        state.exclusion = exclusion;
                        txRd.phase = "system_online";
                        txRd.phaseStartedAt = Date.now();
                        txRd.phaseEndsAt = Date.now() + ROLE_DRAFT_PHASE_MS.system_online;
                        txRd.resolve = null;
                        txRd.currentIdx = order.length;
                        appendLogEntryToState(state, "OPTIMIZE SEQUENCEを完了しました", "public");
                    }

                    state.roleDraft = txRd;
                    state.lastSound = { type: "CONFIRM", id: Date.now() + Math.floor(Math.random() * 1000) };
                    return state;
                });

                if (!result.committed) {
                    showInfoModal("OPTIMIZE", "確定処理に失敗しました。最新状態で再試行してください。");
                    return;
                }

                duelOptimizeSelectedSymbols = [];
                duelOptimizeExcludeIndices = [];
            } catch (e) {
                showInfoModal("エラー", "OPTIMIZE確定エラー: " + e.message);
            } finally {
                duelOptimizeConfirmBusy = false;
            }
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
                    const draftGroupOrder = (rd.noRoleMode === true)
                        ? []
                        : (Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER);

                    const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
                    const validRoles = draftGroupOrder.map(groupKey => myChoices[groupKey]).filter(Boolean);
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
                        const noRoleMode = rd.noRoleMode === true;
                        const enabledGroups = noRoleMode
                            ? []
                            : (Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER);
                        state.publicRoleInfo = {
                            unselectedRoles: [...rd.publicUnusedRoles],
                            selectedGroups: { ...(rd.selectedGroups || {}) },
                            enabledGroups: [...enabledGroups],
                            noRoleMode: noRoleMode
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
                duelOptimizeSelectedSymbols = [];
                duelOptimizeExcludeIndices = [];
                duelOptimizeConfirmBusy = false;
                handleRoleDraftPhaseSound(null);
                return;
            }

            const rd = data.roleDraft;
            const draftGroupOrder = (rd.noRoleMode === true)
                ? []
                : (Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER);
            const players = data.players || {};
            const phase = rd.phase || "booting";
            const currentPid = getRoleDraftActivePlayerId(data);
            const currentName = (currentPid && players[currentPid]) ? players[currentPid].name : "Player";
            const resolveInfo = rd.resolve || null;
            sanitizeDuelOptimizeLocalSelection(data);
            const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
            const mySelectedRole = (rd.selectedRoles && rd.selectedRoles[myId]) ? rd.selectedRoles[myId] : null;
            const isMySelecting = phase === "selecting" && currentPid === myId && !mySelectedRole;
            const isMyResolvingSelf = phase === "resolving" && !!resolveInfo && resolveInfo.playerId === myId && !!mySelectedRole;
            const canRenderOwnRoleCards = isMySelecting || isMyResolvingSelf;
            const duelOptimize = rd.duelOptimize || {};
            const duelSubmissions = duelOptimize.submissions || {};
            const myDuelSubmission = duelSubmissions[myId] || null;

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
                draftGroupOrder.forEach(groupKey => {
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
                const grouped = draftGroupOrder.reduce((acc, groupKey) => {
                    acc[groupKey] = [];
                    return acc;
                }, {});

                list.forEach(roleKey => {
                    const groupKey = getRoleGroup(roleKey);
                    if (!groupKey || !grouped[groupKey]) return;
                    grouped[groupKey].push(roleKey);
                });

                const sections = draftGroupOrder.map(groupKey => {
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
            } else if (phase === "duel_optimize") {
                headline = "OPTIMIZE SEQUENCE";
                const order = Array.isArray(rd.order) ? rd.order : [];
                const selectedSymbols = myDuelSubmission
                    ? (Array.isArray(myDuelSubmission.symbols) ? [...myDuelSubmission.symbols] : [])
                    : [...duelOptimizeSelectedSymbols];
                const selectedExclude = [...duelOptimizeExcludeIndices];
                const selectedExcludeSet = new Set(selectedExclude);
                const symbolCountMap = { REVERSE: 0, TRADE: 0, "DIG UP": 0 };
                selectedSymbols.forEach(sym => {
                    if (symbolCountMap[sym] !== undefined) symbolCountMap[sym] += 1;
                });
                const baseHand = sortCards(deepCopy((data.hands && data.hands[myId]) || []));
                const previewHand = buildDuelOptimizePreviewHand(baseHand, selectedSymbols);
                const statusRows = order.map(pid => {
                    const pName = (players[pid] && players[pid].name) ? players[pid].name : "Player";
                    const done = !!duelSubmissions[pid];
                    const selfMark = (pid === myId) ? " (YOU)" : "";
                    return `
                        <div class="role-draft-opt-status-item ${done ? "done" : ""}">
                            <span>${pName}${selfMark}</span>
                            <span>${done ? "CONFIRMED" : "WAITING"}</span>
                        </div>
                    `;
                }).join("");
                const symbolButtons = DUEL_OPTIMIZE_SYMBOLS.map(sym => {
                    const count = symbolCountMap[sym] || 0;
                    const selectedClass = count > 0 ? " opt-selected" : "";
                    const disabledAttr = myDuelSubmission ? "disabled" : "";
                    const safeSym = String(sym).replace(/'/g, "\\'");
                    return `
                        <button type="button" class="role-draft-opt-symbol-btn${selectedClass}" onclick="toggleDuelOptimizeSymbol('${safeSym}')" ${disabledAttr}>
                            <span>${sym}</span>
                            <span class="role-draft-opt-symbol-meta">${count}/2</span>
                        </button>
                    `;
                }).join("");
                const handCardsHtml = previewHand.map((card, idx) => {
                    const selectedClass = selectedExcludeSet.has(idx) ? " selected" : "";
                    const onClick = myDuelSubmission ? "" : `toggleDuelOptimizeExclude(${idx})`;
                    const cardHtml = renderCardView(card, {
                        cssClass: `card ${card.type} role-draft-opt-card${selectedClass}`,
                        onClick
                    });
                    return `
                        <div class="role-draft-opt-hand-item">
                            ${cardHtml}
                            <span class="role-draft-opt-hand-index">#${idx + 1}</span>
                        </div>
                    `;
                }).join("");
                const selectedSymbolsText = selectedSymbols.length > 0 ? selectedSymbols.join(", ") : "未選択";
                const symbolNote = myDuelSubmission
                    ? "記号選択は確定済みです。"
                    : `選択中: ${selectedSymbolsText} (${selectedSymbols.length}/3)`;
                const excludeNote = myDuelSubmission
                    ? "除外選択は確定済みです。"
                    : `除外選択: ${selectedExclude.length}/4`;
                bodyHtml = `
                    <div class="role-draft-opt-wrap">
                        <div class="role-draft-opt-status-list">${statusRows}</div>
                        <div class="role-draft-opt-panel">
                            <div class="role-draft-opt-panel-title">1) 記号カードを3枚選択（同種2枚まで）</div>
                            <div class="role-draft-opt-symbol-grid">${symbolButtons}</div>
                            <div class="role-draft-opt-note">${symbolNote}</div>
                        </div>
                        <div class="role-draft-opt-panel">
                            <div class="role-draft-opt-panel-title">2) 13枚手札から不要カード4枚を除外</div>
                            <div class="role-draft-opt-hand-grid">${handCardsHtml}</div>
                            <div class="role-draft-opt-note">${excludeNote}</div>
                        </div>
                    </div>
                `;
                if (myDuelSubmission) {
                    footerHtml = `
                        <div class="role-draft-footer">
                            <span class="role-draft-selected-label">確定済み: 相手のOPTIMIZE完了を待っています</span>
                        </div>
                    `;
                } else {
                    const canConfirm = selectedSymbols.length === 3 && selectedExclude.length === 4 && previewHand.length === 13;
                    footerHtml = `
                        <div class="role-draft-footer">
                            <span class="role-draft-selected-label">記号 ${selectedSymbols.length}/3 ・ 除外 ${selectedExclude.length}/4</span>
                            <button type="button" class="role-draft-confirm-btn" onclick="confirmDuelOptimizeSelection()" ${canConfirm ? "" : "disabled"}>CONFIRM</button>
                        </div>
                    `;
                }
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
                draftGroupOrder,
                mySelectedRole,
                selectedRoleForUi,
                publicUnusedRoles: rd.publicUnusedRoles || [],
                selectedGroups: rd.selectedGroups || {},
                duelSubmissions: duelSubmissions,
                duelSelectedSymbols: phase === "duel_optimize" ? duelOptimizeSelectedSymbols : [],
                duelExcludeIndices: phase === "duel_optimize" ? duelOptimizeExcludeIndices : []
            });
            const shouldPatchMonitor = (roleDraftMonitorCache.signature !== monitorSignature) || (roleDraftMonitorCache.html !== nextHtml);

            monitor.classList.remove("hidden");
            monitor.classList.toggle("phase-noise-out", phase === "noise_out");
            monitor.dataset.roleDraftPhase = phase;
            if (shouldPatchMonitor) {
                let prevOptimizeScrollTop = null;
                if (phase === "duel_optimize") {
                    const prevOptWrap = monitor.querySelector(".role-draft-opt-wrap");
                    if (prevOptWrap) prevOptimizeScrollTop = prevOptWrap.scrollTop;
                }
                monitor.innerHTML = nextHtml;
                roleDraftMonitorCache.signature = monitorSignature;
                roleDraftMonitorCache.html = nextHtml;
                applyRoleDraftLayoutDensity(monitor);
                if (phase === "duel_optimize" && prevOptimizeScrollTop !== null) {
                    const nextOptWrap = monitor.querySelector(".role-draft-opt-wrap");
                    if (nextOptWrap) nextOptWrap.scrollTop = prevOptimizeScrollTop;
                }
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
                    const noRoleMode = currentRd.noRoleMode === true;
                    const duelMode = currentRd.duelMode === true;
                    const enabledGroups = noRoleMode
                        ? []
                        : (Array.isArray(currentRd.groupOrder) ? currentRd.groupOrder : ROLE_DRAFT_GROUP_ORDER);
                    if (endAt > 0 && now < endAt) return state;

                    let clearRoleDraft = false;

                    if (phase === "booting") {
                        const order = Array.isArray(currentRd.order) ? currentRd.order : [];
                        if (noRoleMode) {
                            if (duelMode) {
                                currentRd.phase = "duel_optimize";
                                currentRd.phaseStartedAt = now;
                                currentRd.phaseEndsAt = 0;
                                currentRd.currentIdx = order.length;
                                currentRd.resolve = null;
                                appendLogEntryToState(state, "役職なしモードのため選択フェーズをスキップし、OPTIMIZE SEQUENCEへ移行しました", "public");
                            } else {
                                currentRd.phase = "system_online";
                                currentRd.phaseStartedAt = now;
                                currentRd.phaseEndsAt = now + ROLE_DRAFT_PHASE_MS.system_online;
                                currentRd.resolve = null;
                                appendLogEntryToState(state, "役職なしモードのため選択フェーズをスキップしました", "public");
                            }
                        } else {
                            currentRd.phase = "selecting";
                            currentRd.phaseStartedAt = now;
                            currentRd.phaseEndsAt = 0;
                            currentRd.resolve = null;
                        }
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
                                selectedGroups: { ...(currentRd.selectedGroups || {}) },
                                enabledGroups: [...enabledGroups],
                                noRoleMode: noRoleMode
                            };
                            appendLogEntryToState(state, "未選択役職を公開しました", "public");
                        } else {
                            currentRd.phase = "selecting";
                            currentRd.phaseStartedAt = now;
                            currentRd.phaseEndsAt = 0;
                            currentRd.resolve = null;
                        }
                    } else if (phase === "reveal_unused") {
                        if (duelMode) {
                            const order = Array.isArray(currentRd.order) ? currentRd.order : [];
                            currentRd.phase = "duel_optimize";
                            currentRd.phaseStartedAt = now;
                            currentRd.phaseEndsAt = 0;
                            currentRd.currentIdx = order.length;
                            currentRd.resolve = null;
                            appendLogEntryToState(state, "OPTIMIZE SEQUENCEを開始します", "public");
                        } else {
                            currentRd.phase = "system_online";
                            currentRd.phaseStartedAt = now;
                            currentRd.phaseEndsAt = now + ROLE_DRAFT_PHASE_MS.system_online;
                        }
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
                            selectedGroups: selectedGroups,
                            enabledGroups: [...enabledGroups],
                            noRoleMode: noRoleMode
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

