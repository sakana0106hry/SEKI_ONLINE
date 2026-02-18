/* --- CPU ENGINE (host-driven, single-file) --- */
(function () {
    const CPU_SLOT_IDS = ["cpu_01", "cpu_02", "cpu_03", "cpu_04", "cpu_05"];
    const CPU_NAME_POOL = ["アヤカ", "ジュノン", "リュカ", "ケント"];
    const CPU_DUEL_SYMBOLS = ["REVERSE", "TRADE", "DIG UP"];
    const CPU_MAX_PLAYERS_NORMAL = 5;
    const CPU_MAX_PLAYERS_DUEL = 2;
    const CPU_TICK_MS = 320;
    const CPU_ACTION_COOLDOWN_MS = 420;
    const CPU_WATCHDOG_MS = 7000;

    let lastHostCpuCount = null;
    let cpuLoopBusy = false;
    let cpuWatchSig = "";
    let cpuWatchStartedAt = 0;
    let cpuWatchdogDoneSig = "";
    const cpuLastAttemptAtBySig = {};

    function toInt(value, fallback = 0) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.floor(n);
    }

    function clampInt(value, minValue, maxValue) {
        const n = toInt(value, minValue);
        return Math.max(minValue, Math.min(maxValue, n));
    }

    function pickRandom(list) {
        if (!Array.isArray(list) || list.length === 0) return null;
        const idx = Math.floor(Math.random() * list.length);
        return list[idx];
    }

    function shuffleCopy(list) {
        const arr = Array.isArray(list) ? [...list] : [];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function pickDistinctRandomIndices(length, count) {
        const base = [];
        for (let i = 0; i < length; i++) base.push(i);
        const shuffled = shuffleCopy(base);
        return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
    }

    function getPlayerNameFromState(state, pid) {
        if (!state || !state.players || !state.players[pid]) return "CPU";
        return state.players[pid].name || "CPU";
    }

    function isCpuPlayerInState(state, pid) {
        if (!state || !state.players || !pid) return false;
        return !!(state.players[pid] && state.players[pid].isCpu === true);
    }

    function getCpuCount(players) {
        if (!players) return 0;
        return Object.keys(players).filter(pid => players[pid] && players[pid].isCpu === true).length;
    }

    function getHumanCount(players) {
        if (!players) return 0;
        return Object.keys(players).filter(pid => !(players[pid] && players[pid].isCpu === true)).length;
    }

    function normalizeMode(modeOrNum) {
        if (modeOrNum === undefined || modeOrNum === null) return "normal";
        if (modeOrNum === "normal" || modeOrNum === "short" || modeOrNum === "duel") return modeOrNum;
        if (modeOrNum === 6) return "normal";
        if (modeOrNum === 4) return "short";
        return null;
    }

    function resolveCpuCapByMode(mode) {
        return mode === "duel" ? CPU_MAX_PLAYERS_DUEL : CPU_MAX_PLAYERS_NORMAL;
    }

    function getSelectedModeFromHostModal() {
        const modeEls = document.getElementsByName("gameMode");
        for (let i = 0; i < modeEls.length; i++) {
            const el = modeEls[i];
            if (el && el.checked) {
                const mode = String(el.value || "");
                if (mode === "normal" || mode === "short" || mode === "duel") return mode;
            }
        }
        if (lastHostGameMode === "normal" || lastHostGameMode === "short" || lastHostGameMode === "duel") {
            return lastHostGameMode;
        }
        return "normal";
    }

    function syncCpuInputLimit() {
        const input = document.getElementById("cpu-player-count");
        const note = document.getElementById("cpu-player-count-note");
        if (!input || !note) return;

        const mode = getSelectedModeFromHostModal();
        const humanCount = getHumanCount(gameState && gameState.players ? gameState.players : {});
        const cap = resolveCpuCapByMode(mode);
        const maxCpu = Math.max(0, cap - humanCount);

        input.min = "0";
        input.max = String(maxCpu);
        input.step = "1";

        const clamped = clampInt(input.value, 0, maxCpu);
        input.value = String(clamped);
        input.disabled = (maxCpu <= 0);

        lastHostCpuCount = clamped;
        note.innerText = `人間 ${humanCount}人 / 上限 ${cap}人 / CPU最大 ${maxCpu}人`;
    }

    function injectCpuSettingToHostModal() {
        if (!els || !els.mTitle || !els.mContent) return;
        if (String(els.mTitle.innerText || "").trim() !== "ホスト設定") return;

        const root = els.mContent.querySelector(".seki-host-settings");
        if (!root) return;
        const actionArea = root.querySelector(".seki-host-actions");
        if (!actionArea) return;

        const existed = root.querySelector("#seki-host-cpu-box");
        if (existed) existed.remove();

        const existingCpu = getCpuCount(gameState && gameState.players ? gameState.players : {});
        if (lastHostCpuCount === null) lastHostCpuCount = existingCpu;

        const cpuBox = document.createElement("div");
        cpuBox.className = "seki-host-mode-box";
        cpuBox.id = "seki-host-cpu-box";
        cpuBox.innerHTML = `
            <div class="seki-host-mode-title">CPUプレイヤー</div>
            <label class="seki-host-mode-item">
                <div>
                    <span class="seki-host-mode-title">CPU人数</span>
                    <span class="seki-host-mode-meta">― 開始時に自動参加</span>
                </div>
                <input id="cpu-player-count" type="number" min="0" step="1" value="${Math.max(0, toInt(lastHostCpuCount, 0))}">
            </label>
            <div id="cpu-player-count-note" class="seki-host-mode-meta"></div>
        `;
        root.insertBefore(cpuBox, actionArea);

        const modeEls = root.querySelectorAll("input[name='gameMode']");
        modeEls.forEach(el => {
            el.addEventListener("change", syncCpuInputLimit);
        });

        const cpuInput = document.getElementById("cpu-player-count");
        if (cpuInput) {
            cpuInput.addEventListener("input", () => {
                const mode = getSelectedModeFromHostModal();
                const humanCount = getHumanCount(gameState && gameState.players ? gameState.players : {});
                const cap = resolveCpuCapByMode(mode);
                const maxCpu = Math.max(0, cap - humanCount);
                const safe = clampInt(cpuInput.value, 0, maxCpu);
                cpuInput.value = String(safe);
                lastHostCpuCount = safe;
            });
        }

        syncCpuInputLimit();
    }

    function buildInitConfirmFooterWithCpu(cpuCount) {
        const modeArg = `'${String(lastHostGameMode || "normal").replace(/'/g, "\\'")}'`;
        const groups = Array.isArray(lastHostRoleGroups) ? lastHostRoleGroups : [];
        const roleGroupsArg = `[${groups.map(groupKey => `'${String(groupKey).replace(/'/g, "\\'")}'`).join(",")}]`;

        if (els && els.mContent) {
            els.mContent.innerHTML = `
                ${els.mContent.innerHTML}
                <p class="seki-host-mode-meta">CPU人数: ${cpuCount}人</p>
            `;
        }

        if (els && els.mFooter) {
            els.mFooter.innerHTML = `
                ${renderModalButton(getModalActionLabel("yes"), `closeModal(); execInitGame(${modeArg}, ${roleGroupsArg}, ${cpuCount})`, "primary")}
                ${renderModalButton(getModalActionLabel("no"), "openHostSettings()", "ghost")}
            `;
        }
    }
    async function syncCpuSeatsBeforeInit(mode, requestedCpuCount) {
        if (!currentRoom) return { ok: false, message: "ルーム未接続のためCPU席同期を中止しました。" };

        const roomRef = db.ref(`rooms/${currentRoom}`);
        let rejectMessage = "";
        let appliedCpuCount = 0;

        const tx = await roomRef.transaction((state) => {
            if (!state || typeof state !== "object" || !state.players) {
                rejectMessage = "部屋データを取得できないためCPU席同期を中止しました。";
                return;
            }

            const players = { ...(state.players || {}) };
            const humanCount = getHumanCount(players);
            const cap = resolveCpuCapByMode(mode);
            const maxCpu = Math.max(0, cap - humanCount);
            const safeRequested = clampInt(requestedCpuCount, 0, maxCpu);

            if (toInt(requestedCpuCount, 0) > maxCpu) {
                rejectMessage = `CPU人数が上限を超えています（最大 ${maxCpu}人）。`;
                return;
            }

            const now = Date.now();
            const shuffledCpuNames = shuffleCopy(CPU_NAME_POOL);
            CPU_SLOT_IDS.forEach((slotId, index) => {
                if (index < safeRequested) {
                    const current = players[slotId] || {};
                    const joinedAt = Number(current.joinedAt);
                    players[slotId] = {
                        ...current,
                        name: shuffledCpuNames[index] || `CPU-${index + 1}`,
                        online: true,
                        isCpu: true,
                        joinedAt: Number.isFinite(joinedAt) && joinedAt > 0 ? joinedAt : (now + index + 1)
                    };
                    delete players[slotId].notification;
                } else if (players[slotId] && players[slotId].isCpu === true) {
                    delete players[slotId];
                }
            });

            Object.keys(players).forEach(pid => {
                if (players[pid] && players[pid].isCpu === true && !CPU_SLOT_IDS.includes(pid)) {
                    delete players[pid];
                }
            });

            appliedCpuCount = safeRequested;
            state.players = players;
            return state;
        });

        if (!tx.committed) {
            return {
                ok: false,
                message: rejectMessage || "CPU席の同期に失敗しました。最新状態で再試行してください。"
            };
        }

        return { ok: true, cpuCount: appliedCpuCount };
    }

    async function refreshRoomSnapshotToLocalState() {
        if (!currentRoom) return { ok: false, message: "ルーム未接続です。" };
        try {
            const snap = await db.ref(`rooms/${currentRoom}`).get();
            if (!snap.exists()) return { ok: false, message: "部屋データが見つかりません。" };
            gameState = snap.val();
            return { ok: true };
        } catch (e) {
            return { ok: false, message: `部屋同期エラー: ${e.message}` };
        }
    }

    function installHostSettingWrappers() {
        if (window.__sekiCpuHostWrapperInstalled) return;
        window.__sekiCpuHostWrapperInstalled = true;

        const originalOpenHostSettings = window.openHostSettings;
        const originalConfirmInitGameWithSettings = window.confirmInitGameWithSettings;
        const originalExecInitGame = window.execInitGame;

        const wrappedOpenHostSettings = function (...args) {
            if (typeof originalOpenHostSettings === "function") {
                originalOpenHostSettings.apply(this, args);
            }
            injectCpuSettingToHostModal();
        };

        const wrappedConfirmInitGameWithSettings = function (...args) {
            const mode = getSelectedModeFromHostModal();
            const humanCount = getHumanCount(gameState && gameState.players ? gameState.players : {});
            const cap = resolveCpuCapByMode(mode);
            const maxCpu = Math.max(0, cap - humanCount);
            const input = document.getElementById("cpu-player-count");
            const requestedCpu = clampInt(input ? input.value : (lastHostCpuCount === null ? 0 : lastHostCpuCount), 0, maxCpu);

            if (toInt(input ? input.value : requestedCpu, requestedCpu) > maxCpu) {
                showInfoModal("エラー", `CPU人数が上限を超えています（最大 ${maxCpu}人）。`);
                return;
            }

            lastHostCpuCount = requestedCpu;

            if (typeof originalConfirmInitGameWithSettings === "function") {
                originalConfirmInitGameWithSettings.apply(this, args);
            }

            if (!els || !els.mTitle || String(els.mTitle.innerText || "").trim() !== "開始確認") {
                return;
            }
            buildInitConfirmFooterWithCpu(requestedCpu);
        };

        const wrappedExecInitGame = async function (modeOrNum, fixedRoleGroups, cpuCountArg) {
            const mode = normalizeMode(modeOrNum);
            if (!mode) {
                if (typeof originalExecInitGame === "function") {
                    return originalExecInitGame.call(this, modeOrNum, fixedRoleGroups);
                }
                return;
            }

            const desiredCpu = clampInt(
                cpuCountArg === undefined ? (lastHostCpuCount === null ? 0 : lastHostCpuCount) : cpuCountArg,
                0,
                mode === "duel" ? 1 : CPU_SLOT_IDS.length
            );

            const syncResult = await syncCpuSeatsBeforeInit(mode, desiredCpu);
            if (!syncResult.ok) {
                showInfoModal("エラー", syncResult.message);
                return;
            }
            lastHostCpuCount = syncResult.cpuCount;

            const refreshResult = await refreshRoomSnapshotToLocalState();
            if (!refreshResult.ok) {
                showInfoModal("エラー", `${refreshResult.message}<br>開始を中止しました。`);
                return;
            }

            if (typeof originalExecInitGame === "function") {
                return originalExecInitGame.call(this, modeOrNum, fixedRoleGroups);
            }
        };

        window.openHostSettings = wrappedOpenHostSettings;
        window.confirmInitGameWithSettings = wrappedConfirmInitGameWithSettings;
        window.execInitGame = wrappedExecInitGame;
        try { openHostSettings = wrappedOpenHostSettings; } catch (e) {}
        try { confirmInitGameWithSettings = wrappedConfirmInitGameWithSettings; } catch (e) {}
        try { execInitGame = wrappedExecInitGame; } catch (e) {}
    }

    function isCpuHostController(state = gameState) {
        if (!state || !currentRoom) return false;
        return getEffectiveHostId(state) === myId;
    }

    function getCpuPendingAction(state = gameState) {
        if (!state || !state.status) return null;

        if (state.status === "role_selecting" && state.roleDraft) {
            const rd = state.roleDraft;
            const phase = rd.phase || "";
            if (phase === "selecting") {
                const activePid = getRoleDraftActivePlayerId(state);
                if (activePid && isCpuPlayerInState(state, activePid)) {
                    return {
                        type: "role-select",
                        pid: activePid,
                        sig: `role-select:${rd.currentIdx || 0}:${activePid}`
                    };
                }
            }
            if (phase === "duel_optimize") {
                const order = Array.isArray(rd.order) ? rd.order : [];
                const submissions = (rd.duelOptimize && rd.duelOptimize.submissions) ? rd.duelOptimize.submissions : {};
                const pendingCpuPid = order.find(pid => isCpuPlayerInState(state, pid) && !submissions[pid]);
                if (pendingCpuPid) {
                    return {
                        type: "duel-optimize",
                        pid: pendingCpuPid,
                        sig: `duel-optimize:${Object.keys(submissions).length}:${pendingCpuPid}`
                    };
                }
            }
            return null;
        }

        if (state.status === "playing" && Array.isArray(state.playerOrder)) {
            const activePid = state.playerOrder[state.turnIdx];
            if (activePid && isCpuPlayerInState(state, activePid)) {
                return {
                    type: "playing",
                    pid: activePid,
                    sig: `playing:${state.turnIdx}:${activePid}:${state.passCount || 0}:${state.isReverse ? 1 : 0}`
                };
            }
        }

        return null;
    }

    function updateCpuWatchSignature(action) {
        if (!action || action.type !== "playing") {
            cpuWatchSig = "";
            cpuWatchStartedAt = 0;
            cpuWatchdogDoneSig = "";
            return;
        }
        if (cpuWatchSig !== action.sig) {
            cpuWatchSig = action.sig;
            cpuWatchStartedAt = Date.now();
            cpuWatchdogDoneSig = "";
        }
    }

    function cpuCanUseReset(state, pid) {
        if (!state) return false;
        const isDuelMode = state.gameMode === "duel";
        const hasResetSource = Array.isArray(state.graveNum) && state.graveNum.length > 0;
        let resetHolder = null;
        let inherited = false;

        if (isDuelMode) {
            resetHolder = hasResetSource ? (state.lastGraveActorId || null) : null;
        } else {
            const top = hasResetSource ? getTop(state.graveNum) : null;
            resetHolder = top ? top.owner : null;
            inherited = checkInheritedResetLogic(state, pid);
        }

        return resetHolder === pid || inherited;
    }

    function buildCpuDuelSymbols() {
        const picked = [];
        const counts = { REVERSE: 0, TRADE: 0, "DIG UP": 0 };
        while (picked.length < 3) {
            const sym = pickRandom(CPU_DUEL_SYMBOLS);
            if (!sym) break;
            if (counts[sym] >= 2) continue;
            counts[sym] += 1;
            picked.push(sym);
        }
        return picked;
    }

    function buildCpuDuelPreviewHand(baseHand, selectedSymbols) {
        const symbols = (Array.isArray(selectedSymbols) ? selectedSymbols : []).map(val => ({ type: "sym", val }));
        return sortCards([...(baseHand || []), ...symbols]);
    }

    function buildSoundList(baseSound, remainCount) {
        const list = [baseSound];
        if (remainCount === 1) list.push("UNO");
        else if (remainCount === 2) list.push("DOS");
        return list;
    }
    function isCpuImplementedRole(roleKey) {
        return (
            roleKey === "POLITICIAN" ||
            roleKey === "HACKER" ||
            roleKey === "FORTUNE TELLER" ||
            roleKey === "NECROMANCER" ||
            roleKey === "ASTRONOMER"
        );
    }
    function getTotalHandCountInState(state, pid) {
        const h1 = ((state && state.hands && state.hands[pid]) ? state.hands[pid] : []).length;
        const h2 = ((state && state.hackedHands && state.hackedHands[pid]) ? state.hackedHands[pid] : []).length;
        return h1 + h2;
    }
    function getAliveOtherPlayerIds(state, activePid) {
        return (state && Array.isArray(state.playerOrder) ? state.playerOrder : []).filter(pid => {
            if (pid === activePid) return false;
            if (state && state.rankings && state.rankings[pid]) return false;
            return true;
        });
    }
    function getCpuRoleMemoNode(state) {
        if (!state.cpuRoleMemo || typeof state.cpuRoleMemo !== "object") {
            state.cpuRoleMemo = {};
        }
        return state.cpuRoleMemo;
    }
    function getCpuFortuneDiscardOwners(state, activePid) {
        const memoRoot = getCpuRoleMemoNode(state);
        const memo = memoRoot[activePid];
        if (!memo || !Array.isArray(memo.fortuneDiscardOwners)) return [];
        return memo.fortuneDiscardOwners.filter(pid => typeof pid === "string" && pid.length > 0);
    }
    function setCpuFortuneMemo(state, activePid, ownerIds, nowMs) {
        const memoRoot = getCpuRoleMemoNode(state);
        const before = (memoRoot[activePid] && typeof memoRoot[activePid] === "object") ? memoRoot[activePid] : {};
        const uniqueOwners = [...new Set((Array.isArray(ownerIds) ? ownerIds : []).filter(pid => typeof pid === "string" && pid.length > 0))];
        memoRoot[activePid] = {
            ...before,
            fortuneDiscardOwners: uniqueOwners,
            capturedAt: Number.isFinite(nowMs) ? nowMs : Date.now()
        };
    }
    function getCpuTurnSeenNode(state) {
        if (!state.cpuTurnSeen || typeof state.cpuTurnSeen !== "object") {
            state.cpuTurnSeen = {};
        }
        return state.cpuTurnSeen;
    }
    function isCpuFirstPlayingTurn(state, pid) {
        const turnSeen = getCpuTurnSeenNode(state);
        return !turnSeen[pid];
    }
    function markCpuPlayingTurnSeen(state, pid, nowMs) {
        const turnSeen = getCpuTurnSeenNode(state);
        if (turnSeen[pid]) return;
        turnSeen[pid] = {
            seenAt: Number.isFinite(nowMs) ? nowMs : Date.now()
        };
    }
    function getLastPublicLogTimestamp(state) {
        if (!state || !Array.isArray(state.logs)) return 0;
        for (let i = state.logs.length - 1; i >= 0; i--) {
            const log = state.logs[i];
            if (log && log.type === "public") {
                return Number(log.timestamp) || 0;
            }
        }
        return 0;
    }
    function shouldCpuActivatePoliticianPreemptive(roleKey, activated, hand) {
        if (roleKey !== "POLITICIAN" || activated) return false;
        const symbols = (Array.isArray(hand) ? hand : []).filter(card => card && card.type === "sym");
        if (symbols.length === 0) return true;
        return symbols.length === 1 && symbols[0].val === "DISCARD";
    }
    function collectCpuHackerTargets(state, activePid) {
        return (state && Array.isArray(state.playerOrder) ? state.playerOrder : []).filter(pid => {
            if (pid === activePid) return false;
            if (state.rankings && state.rankings[pid]) return false;
            if (isPoliticianShieldActive(pid, state)) return false;
            const targetHand = (state.hands && state.hands[pid]) ? state.hands[pid] : [];
            return targetHand.length > 0;
        });
    }
    function shouldCpuActivateHackerPreemptive(state, activePid, roleKey, activated) {
        if (roleKey !== "HACKER" || activated) return false;
        const aliveOthers = getAliveOtherPlayerIds(state, activePid);
        if (aliveOthers.length <= 0) return false;
        if (!aliveOthers.every(pid => getTotalHandCountInState(state, pid) <= 2)) return false;
        const targets = collectCpuHackerTargets(state, activePid);
        return targets.length > 0;
    }
    function tryCpuActivatePolitician(state, ctx, activePid, playerName) {
        const actList = { ...(state.activatedList || {}) };
        if (actList[activePid]) return false;

        actList[activePid] = true;
        state.activatedList = actList;
        state.politicianShield = { ...(state.politicianShield || {}), [activePid]: true };
        ctx.appendLog(`${playerName}が[政治家]を発動し、手札干渉の対象外になりました。`, "public");
        return true;
    }
    function tryCpuActivateHacker(state, ctx, activePid, playerName) {
        const actList = { ...(state.activatedList || {}) };
        if (actList[activePid]) return false;

        const targets = collectCpuHackerTargets(state, activePid);
        if (targets.length <= 0) return false;

        let lockedCount = 0;
        const hackedHands = deepCopy(state.hackedHands || {});
        state.hands = state.hands || {};

        for (let i = 0; i < targets.length; i++) {
            const pid = targets[i];
            const targetHand = deepCopy((state.hands && state.hands[pid]) ? state.hands[pid] : []);
            if (targetHand.length <= 0) continue;

            const targetIdx = pickRandom(targetHand.map((_, idx) => idx));
            if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= targetHand.length) continue;

            const lockedCard = targetHand.splice(targetIdx, 1)[0];
            if (!lockedCard) continue;

            lockedCard.hackedBy = activePid;
            lockedCard.hackedAt = ctx.now;
            if (!Array.isArray(hackedHands[pid])) hackedHands[pid] = [];
            hackedHands[pid].push(lockedCard);
            state.hands[pid] = targetHand;
            lockedCount += 1;
        }

        if (lockedCount <= 0) return false;

        actList[activePid] = true;
        state.activatedList = actList;
        state.hackedHands = hackedHands;
        ctx.appendLog(`${playerName}が[ハッカー]を発動！システムをハッキングしました`, "public");
        return true;
    }
    function tryCpuCleanupHackerLocks(state, ctx, activePid, playerName) {
        if (!state || !state.hackedHands) return false;

        const lastPublicLogTime = getLastPublicLogTimestamp(state);
        const hackedHands = deepCopy(state.hackedHands || {});
        let needsUpdate = false;

        Object.keys(hackedHands).forEach(pid => {
            if (!state.players || !state.players[pid]) {
                delete hackedHands[pid];
                needsUpdate = true;
                return;
            }

            const lockedCards = hackedHands[pid] || [];
            const remainingLocked = [];
            const returningCards = [];

            lockedCards.forEach(card => {
                const hackTime = card ? (card.hackedAt || 0) : 0;
                if (card && card.hackedBy === activePid && (lastPublicLogTime - hackTime > 2000)) {
                    const restored = { ...card };
                    delete restored.hackedBy;
                    delete restored.hackedAt;
                    returningCards.push(restored);
                } else {
                    remainingLocked.push(card);
                }
            });

            if (returningCards.length > 0) {
                let targetHand = deepCopy((state.hands && state.hands[pid]) ? state.hands[pid] : []);
                targetHand = sortCards(targetHand.concat(returningCards));
                state.hands = state.hands || {};
                state.hands[pid] = targetHand;
                hackedHands[pid] = remainingLocked;
                needsUpdate = true;
            }
        });

        if (!needsUpdate) return false;

        state.hackedHands = hackedHands;
        ctx.appendLog(`${playerName}のウイルス効果が切れ、ロックが解除されました。`, "public");
        return true;
    }
    function tryCpuActivateFortuneTeller(state, ctx, activePid, playerName) {
        const actList = { ...(state.activatedList || {}) };
        if (actList[activePid]) return false;

        const discardOwners = [];
        const memoLines = [];
        const pids = Array.isArray(state.playerOrder) ? state.playerOrder : [];
        for (let i = 0; i < pids.length; i++) {
            const pid = pids[i];
            if (pid === activePid) continue;

            const pName = getPlayerNameFromState(state, pid);
            if (isPoliticianShieldActive(pid, state)) {
                memoLines.push(`[${pName}] [政治家]発動中のため確認不可`);
                continue;
            }

            const pRole = (state.roles && state.roles[pid]) ? state.roles[pid] : null;
            const pRoleJP = (pRole && ROLE_INFO[pRole] && ROLE_INFO[pRole].jp) ? ROLE_INFO[pRole].jp : (pRole || "不明");
            const pHand = (state.hands && state.hands[pid]) ? state.hands[pid] : [];
            const handText = pHand.map(card => card && card.val).filter(Boolean).join(", ") || "なし";

            memoLines.push(`[${pName}] 役職:${pRoleJP} / 手札:${handText}`);
            if (pHand.some(card => card && card.type === "sym" && card.val === "DISCARD")) {
                discardOwners.push(pid);
            }
        }

        actList[activePid] = true;
        state.activatedList = actList;
        setCpuFortuneMemo(state, activePid, discardOwners, ctx.now);

        ctx.appendLog(`${playerName}が[占い師]を発動！水晶玉を覗き込みました...`, "public");
        const memoBody = memoLines.length > 0 ? memoLines.join("<br>") : "対象プレイヤーはいません。";
        ctx.appendLog(`【占い結果メモ】<br>${memoBody}`, "private", activePid);
        return true;
    }
    function tryCpuActivateNecromancer(state, ctx, activePid, playerName) {
        const actList = { ...(state.activatedList || {}) };
        if (actList[activePid]) return false;

        const gn = [...(state.graveNum || [])];
        if (gn.length <= 0) return false;
        const removedCard = gn.pop();
        if (!removedCard) return false;

        actList[activePid] = true;
        state.activatedList = actList;
        state.graveNum = gn;
        state.exclusion = [...(state.exclusion || []), removedCard];
        ctx.appendLog(`${playerName}が[牧師]を発動！数字墓地の [${removedCard.val}] を除外しました。`, "public");
        return true;
    }
    function isCpuAstronomerSelectableValue(val, isRev) {
        const numVal = Number(val);
        return ASTRONOMER_CHOICES.includes(numVal) || (!isRev && numVal === 1) || (isRev && numVal === 9);
    }
    function pickCpuAstronomerObservedValue(hand, isRev) {
        const counts = {};
        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            if (!card || card.type !== "num") continue;
            const numVal = Number(card.val);
            if (!isCpuAstronomerSelectableValue(numVal, isRev)) continue;
            counts[numVal] = (counts[numVal] || 0) + 1;
        }

        const vals = Object.keys(counts).map(v => Number(v)).filter(Number.isFinite);
        if (vals.length <= 0) return null;
        const maxCount = Math.max(...vals.map(v => counts[v] || 0));
        const topVals = vals.filter(v => (counts[v] || 0) === maxCount);
        return pickRandom(topVals);
    }
    function tryCpuActivateAstronomer(state, ctx, activePid, playerName, hand) {
        const actList = { ...(state.activatedList || {}) };
        if (actList[activePid]) return false;

        const observedVal = pickCpuAstronomerObservedValue(hand, !!state.isReverse);
        if (!Number.isInteger(observedVal)) return false;

        actList[activePid] = true;
        state.activatedList = actList;
        state.astronomerObservation = {
            value: observedVal,
            activatedIsReverse: !!state.isReverse,
            activatedBy: activePid,
            timestamp: ctx.now
        };
        state.passCount = 0;
        state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});

        const strongerThan = state.isReverse ? 1 : 9;
        ctx.appendLog(`${playerName}が[天文学者]を発動し、[${observedVal}] を観測して [${strongerThan}] より強くしました。`, "public");
        return true;
    }
    function pickCpuTradeTarget(state, activePid, roleKey, targets) {
        if (!Array.isArray(targets) || targets.length <= 0) return null;
        if (roleKey !== "FORTUNE TELLER") return pickRandom(targets);

        const memoTargets = getCpuFortuneDiscardOwners(state, activePid);
        if (!Array.isArray(memoTargets) || memoTargets.length <= 0) return pickRandom(targets);

        const preferred = targets.filter(pid => memoTargets.includes(pid));
        if (preferred.length > 0) return pickRandom(preferred);
        return pickRandom(targets);
    }
    function finalizeCpuFinishIfNeeded(state, ctx, activePid, currentHand, hackedCount, finishMethod, soundList) {
        let tempRankings = { ...(state.rankings || {}) };
        if (currentHand.length === 0 && hackedCount === 0) {
            const currentRank = Object.keys(state.rankings || {}).length + 1;
            state.rankings = { ...(state.rankings || {}), [activePid]: currentRank };
            state.finishMethods = { ...(state.finishMethods || {}), [activePid]: finishMethod };
            ctx.appendLog(`${ctx.playerName}が ${currentRank}位 であがりました！`, "public");
            state.lastWinnerId = activePid;
            state.lastWinnerTime = ctx.now;

            const totalPlayers = state.playerOrder.length;
            appendRankSound(soundList, currentRank, totalPlayers);

            if (currentRank >= totalPlayers - 1) {
                state.status = "finished";
                const loserId = state.playerOrder.find(pid => !(state.rankings && state.rankings[pid]) && pid !== activePid);
                if (loserId) {
                    state.rankings = { ...(state.rankings || {}), [loserId]: totalPlayers };
                    appendRankSound(soundList, totalPlayers, totalPlayers);

                    const lHand = (state.hands && state.hands[loserId]) ? state.hands[loserId] : [];
                    const lHacked = (state.hackedHands && state.hackedHands[loserId]) ? state.hackedHands[loserId] : [];
                    const allL = [...lHand, ...lHacked];
                    const lText = allL.map(c => c.val).join(", ") || "なし";
                    const lName = (state.players && state.players[loserId]) ? state.players[loserId].name : "Player";
                    ctx.appendLog(`全順位確定！！最下位 ${lName} の残り手札: [${lText}]`, "public");
                } else {
                    ctx.appendLog("全順位が確定しました！！", "public");
                }
            }

            tempRankings[activePid] = 99;
            ctx.finishedNow = true;
        }
        state.turnIdx = ctx.getNextTurnIdx(tempRankings);
    }

    function applyCpuPass(state, ctx, activePid, opts = {}) {
        const shouldDraw = !!opts.draw;
        const playerName = ctx.playerName;
        const isReset = cpuCanUseReset(state, activePid);

        if (shouldDraw) {
            let deck = [...(state.deckNum || [])];
            if (deck.length === 0) {
                const excl = [...(state.exclusion || [])];
                const refillDeck = excl.filter(c => c && c.type === "num");
                const remainingExcl = excl.filter(c => !c || c.type !== "num");
                if (refillDeck.length > 0) {
                    shuffle(refillDeck);
                    deck = refillDeck;
                    state.exclusion = remainingExcl;
                    ctx.appendLog("除外場から数字山札を補充しました", "public");
                }
            }

            if (deck.length > 0) {
                const card = deck.pop();
                state.deckNum = deck;

                let hand = [...((state.hands && state.hands[activePid]) || [])];
                hand.push(card);
                hand = sortCards(hand);
                state.hands = state.hands || {};
                state.hands[activePid] = hand;

                if (isReset) {
                    const resetExcl = [...(state.exclusion || []), ...(state.graveNum || [])];
                    state.exclusion = resetExcl;
                    state.graveNum = [];
                    state.passCount = 0;
                    state.lastSound = { type: "RESET", id: ctx.now };
                    ctx.appendLog(`${playerName}がリセットして1枚引きました`, "public");
                } else {
                    state.passCount = (state.passCount || 0) + 1;
                    ctx.appendLog(`${playerName}がパスして1枚引きました`, "public");
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                }
                return;
            }
        }

        if (isReset) {
            const resetExcl = [...(state.exclusion || []), ...(state.graveNum || [])];
            state.exclusion = resetExcl;
            state.graveNum = [];
            state.passCount = 0;
            state.lastSound = { type: "RESET", id: ctx.now };
            ctx.appendLog(`${playerName}がドローせずリセットしました`, "public");
        } else {
            state.passCount = (state.passCount || 0) + 1;
            ctx.appendLog(`${playerName}がドローせずパスしました`, "public");
            state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
        }
    }

    async function runCpuRoleSelect(targetPid) {
        if (!currentRoom) return false;
        const roomRef = db.ref(`rooms/${currentRoom}`);
        const result = await roomRef.transaction((state) => {
            if (!state || state.status !== "role_selecting" || !state.roleDraft) return state;
            const rd = state.roleDraft;
            if ((rd.phase || "") !== "selecting") return state;

            const order = Array.isArray(rd.order) ? rd.order : [];
            const currentIdx = Math.max(0, Number(rd.currentIdx) || 0);
            const activePid = order[currentIdx] || null;
            if (activePid !== targetPid) return state;
            if (!isCpuPlayerInState(state, activePid)) return state;

            const alreadySelected = rd.selectedRoles && rd.selectedRoles[activePid];
            if (alreadySelected) return state;

            const draftGroupOrder = (rd.noRoleMode === true)
                ? []
                : (Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER);
            const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[activePid]) ? rd.choicesByPlayer[activePid] : {};
            const validRoles = draftGroupOrder.map(groupKey => myChoices[groupKey]).filter(Boolean);
            if (validRoles.length === 0) return state;

            const selectedRoleKey = pickRandom(validRoles);
            const selectedGroup = getRoleGroup(selectedRoleKey);
            if (!selectedGroup) return state;

            rd.selectedRoles = { ...(rd.selectedRoles || {}), [activePid]: selectedRoleKey };
            rd.selectedGroups = { ...(rd.selectedGroups || {}), [activePid]: selectedGroup };

            const unselectedRoles = validRoles.filter(roleKey => roleKey !== selectedRoleKey);
            rd.unusedByPlayer = { ...(rd.unusedByPlayer || {}), [activePid]: unselectedRoles };
            rd.resolve = {
                playerId: activePid,
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

            const pName = getPlayerNameFromState(state, activePid);
            appendLogEntryToState(state, `${pName} が役職を確定しました（${getRoleGroupLabel(selectedGroup)}）`, "public");

            state.roleDraft = rd;
            state.lastSound = { type: "CONFIRM", id: now + Math.floor(Math.random() * 1000) };
            return state;
        });

        return !!result.committed;
    }
    async function runCpuDuelOptimize(targetPid) {
        if (!currentRoom) return false;
        const roomRef = db.ref(`rooms/${currentRoom}`);
        const result = await roomRef.transaction((state) => {
            if (!state || state.status !== "role_selecting" || !state.roleDraft) return state;
            const rd = state.roleDraft;
            if ((rd.phase || "") !== "duel_optimize") return state;
            if (rd.duelMode !== true) return state;
            if (!isCpuPlayerInState(state, targetPid)) return state;

            const order = Array.isArray(rd.order) ? rd.order : [];
            if (!order.includes(targetPid)) return state;

            const duelOptimize = rd.duelOptimize || {};
            if (duelOptimize.enabled !== true) return state;
            const submissions = { ...(duelOptimize.submissions || {}) };
            if (submissions[targetPid]) return state;

            const selectedSymbols = buildCpuDuelSymbols();
            if (selectedSymbols.length !== 3) return state;

            let txDeckSym = [...(state.deckSym || [])];
            for (let i = 0; i < selectedSymbols.length; i++) {
                const sym = selectedSymbols[i];
                const idx = txDeckSym.findIndex(c => c && c.type === "sym" && c.val === sym);
                if (idx < 0) return state;
                txDeckSym.splice(idx, 1);
            }

            const baseHand = sortCards(deepCopy((state.hands && state.hands[targetPid]) || []));
            if (baseHand.length !== 10) return state;
            if (baseHand.some(c => !c || c.type !== "num")) return state;

            const previewHand = buildCpuDuelPreviewHand(baseHand, selectedSymbols);
            if (previewHand.length !== 13) return state;
            const numericIndices = [];
            for (let i = 0; i < previewHand.length; i++) {
                const card = previewHand[i];
                if (card && card.type === "num") numericIndices.push(i);
            }
            const excludeIndices = shuffleCopy(numericIndices).slice(0, 4);
            if (excludeIndices.length !== 4) return state;

            submissions[targetPid] = {
                symbols: [...selectedSymbols],
                excludeIndices: [...excludeIndices],
                submittedAt: Date.now(),
                source: "cpu"
            };
            rd.duelOptimize = {
                ...duelOptimize,
                enabled: true,
                submissions
            };
            state.deckSym = txDeckSym;

            const allSubmitted = order.every(pid => !!submissions[pid]);
            if (allSubmitted) {
                let exclusion = [...(state.exclusion || [])];
                for (let i = 0; i < order.length; i++) {
                    const pid = order[i];
                    const submission = submissions[pid];
                    if (!submission) return state;

                    const pidBaseHand = sortCards(deepCopy((state.hands && state.hands[pid]) || []));
                    if (pidBaseHand.length !== 10) return state;
                    if (pidBaseHand.some(c => !c || c.type !== "num")) return state;

                    const pidSymbols = Array.isArray(submission.symbols) ? submission.symbols : [];
                    if (pidSymbols.length !== 3) return state;
                    const symCount = { REVERSE: 0, TRADE: 0, "DIG UP": 0 };
                    for (let j = 0; j < pidSymbols.length; j++) {
                        const sym = pidSymbols[j];
                        if (!CPU_DUEL_SYMBOLS.includes(sym)) return state;
                        symCount[sym] += 1;
                        if (symCount[sym] > 2) return state;
                    }

                    const pidPreview = buildCpuDuelPreviewHand(pidBaseHand, pidSymbols);
                    if (pidPreview.length !== 13) return state;

                    const pidExcludeIndices = Array.isArray(submission.excludeIndices)
                        ? submission.excludeIndices.map(v => Number(v))
                        : [];
                    if (pidExcludeIndices.length !== 4) return state;
                    if ((new Set(pidExcludeIndices)).size !== 4) return state;

                    const sortedRemove = [...pidExcludeIndices].sort((a, b) => b - a);
                    let finalHand = [...pidPreview];
                    const excludedCards = [];
                    for (let j = 0; j < sortedRemove.length; j++) {
                        const idx = sortedRemove[j];
                        if (!Number.isInteger(idx) || idx < 0 || idx >= finalHand.length) return state;
                        const removed = finalHand.splice(idx, 1)[0];
                        if (!removed) return state;
                        if (submission.source === "cpu" && removed.type !== "num") return state;
                        excludedCards.push(removed);
                    }
                    if (finalHand.length !== 9) return state;

                    state.hands = state.hands || {};
                    state.hands[pid] = sortCards(finalHand);
                    exclusion = exclusion.concat(excludedCards);

                    const pName = getPlayerNameFromState(state, pid);
                    const excludedText = excludedCards.map(c => c.val).join(", ");
                    appendLogEntryToState(state, `${pName} のOPTIMIZE除外: [${excludedText}]`, "public");
                }

                rd.phase = "system_online";
                rd.phaseStartedAt = Date.now();
                rd.phaseEndsAt = Date.now() + ROLE_DRAFT_PHASE_MS.system_online;
                rd.resolve = null;
                rd.currentIdx = order.length;
                state.exclusion = exclusion;
                appendLogEntryToState(state, "OPTIMIZE SEQUENCEを完了しました", "public");
            }

            state.roleDraft = rd;
            state.lastSound = { type: "CONFIRM", id: Date.now() + Math.floor(Math.random() * 1000) };
            return state;
        });

        return !!result.committed;
    }
    async function runCpuPlayingTurn(opts = {}) {
        if (!currentRoom) return false;
        const targetPid = opts.pid;
        if (!targetPid) return false;

        let finishedNow = false;
        const roomRef = db.ref(`rooms/${currentRoom}`);
        const result = await roomRef.transaction((state) => {
            if (!state || state.status !== "playing") return state;
            if (!Array.isArray(state.playerOrder) || typeof state.turnIdx !== "number") return state;

            const activePid = state.playerOrder[state.turnIdx];
            if (activePid !== targetPid) return state;
            if (!isCpuPlayerInState(state, activePid)) return state;

            const playerName = getPlayerNameFromState(state, activePid);
            const ctx = {
                now: Date.now(),
                playerName,
                appendLog: (text, type = "public", targetId = null) => {
                    appendLogEntryToState(state, text, type, targetId);
                },
                getNextTurnIdx: (rankings = state.rankings || {}) => {
                    return getNextActivePlayerIndex(state.turnIdx, state.playerOrder, rankings);
                },
                finishedNow: false
            };

            let hand = sortCards(deepCopy((state.hands && state.hands[activePid]) || []));
            const hackedCount = (state.hackedHands && state.hackedHands[activePid]) ? state.hackedHands[activePid].length : 0;
            const top = getTop(state.graveNum || []);
            const roleKey = (state.roles && state.roles[activePid]) ? state.roles[activePid] : null;
            const activated = !!(state.activatedList && state.activatedList[activePid]);
            const roleLabel = roleKey ? getRoleDisplayName(roleKey) : "";
            const isFirstPlayingTurn = isCpuFirstPlayingTurn(state, activePid);
            markCpuPlayingTurnSeen(state, activePid, ctx.now);

            let hasForbiddenZeroFinish = false;
            const playableNums = [];
            for (let i = 0; i < hand.length; i++) {
                const card = hand[i];
                if (!card || card.type !== "num") continue;
                if (!canPlay(card, top, state.isReverse, state)) continue;

                const nextTotal = (hand.length - 1) + hackedCount;
                if (Number(card.val) === 0 && nextTotal === 0) {
                    hasForbiddenZeroFinish = true;
                    continue;
                }
                playableNums.push({ idx: i, val: Number(card.val) });
            }

            const forceWatchdog = !!opts.watchdog;
            if (!forceWatchdog) {
                tryCpuCleanupHackerLocks(state, ctx, activePid, playerName);
            }
            if (!forceWatchdog && !activated) {
                let preemptiveRoleActivated = false;
                if (roleKey === "FORTUNE TELLER" && isFirstPlayingTurn) {
                    preemptiveRoleActivated = tryCpuActivateFortuneTeller(state, ctx, activePid, playerName);
                } else if (shouldCpuActivatePoliticianPreemptive(roleKey, activated, hand)) {
                    preemptiveRoleActivated = tryCpuActivatePolitician(state, ctx, activePid, playerName);
                } else if (shouldCpuActivateHackerPreemptive(state, activePid, roleKey, activated)) {
                    preemptiveRoleActivated = tryCpuActivateHacker(state, ctx, activePid, playerName);
                }
                if (preemptiveRoleActivated) return state;
            }

            if (!forceWatchdog && playableNums.length > 0) {
                playableNums.sort((a, b) => a.val - b.val);
                const picked = playableNums[0];
                const useCard = hand.splice(picked.idx, 1)[0];
                if (!useCard || useCard.type !== "num") return state;

                const remainCount = hand.length + hackedCount;
                const soundList = buildSoundList("PUT", remainCount);

                state.lastSound = { type: soundList, id: ctx.now };
                state.hands = state.hands || {};
                state.hands[activePid] = hand;
                state.graveNum = [...(state.graveNum || []), { ...useCard, owner: activePid }];
                state.lastGraveActorId = activePid;
                state.passCount = 0;
                ctx.appendLog(`${playerName}が [${useCard.val}] を出しました`, "public");

                finalizeCpuFinishIfNeeded(state, ctx, activePid, hand, hackedCount, "NUMERIC", soundList);
                finishedNow = finishedNow || ctx.finishedNow;
                return state;
            }

            const isForbiddenSymbolFinish = hand.length === 1 && hackedCount === 0 && hand[0] && hand[0].type === "sym";

            const symbolOptions = [];
            if (!forceWatchdog) {
                const rankings = state.rankings || {};
                const activePids = (state.playerOrder || []).filter(pid => !rankings[pid]);
                const onlyOtherPid = (activePids.length === 2) ? activePids.find(pid => pid !== activePid) : null;

                for (let i = 0; i < hand.length; i++) {
                    const card = hand[i];
                    if (!card || card.type !== "sym") continue;

                    const remainAfterUse = (hand.length - 1) + hackedCount;
                    if ((card.val === "REVERSE" || card.val === "TRADE" || card.val === "DIG UP") && remainAfterUse === 0) {
                        continue;
                    }

                    if (card.val === "REVERSE") {
                        symbolOptions.push({ kind: "REVERSE", idx: i });
                    } else if (card.val === "TRADE") {
                        const myRemainAfterTradeUse = hand.length - 1;
                        if (myRemainAfterTradeUse <= 0) continue;

                        const targets = (state.playerOrder || []).filter(pid => {
                            if (pid === activePid) return false;
                            if (state.rankings && state.rankings[pid]) return false;
                            if (isPoliticianShieldActive(pid, state)) return false;
                            return ((state.hands && state.hands[pid]) ? state.hands[pid].length : 0) > 0;
                        });

                        if (targets.length > 0) {
                            symbolOptions.push({ kind: "TRADE", idx: i, targets });
                        } else if (onlyOtherPid && isPoliticianShieldActive(onlyOtherPid, state)) {
                            symbolOptions.push({ kind: "TRADE_WHIFF", idx: i, blockedPid: onlyOtherPid });
                        }
                    } else if (card.val === "DIG UP") {
                        const gn = state.graveNum || [];
                        if (gn.length <= 0) continue;
                        const buryIdxs = [];
                        for (let j = 0; j < hand.length; j++) {
                            if (j === i) continue;
                            const c = hand[j];
                            if (c && c.type === "num") buryIdxs.push(j);
                        }
                        if (buryIdxs.length > 0) {
                            symbolOptions.push({ kind: "DIG_UP", idx: i, buryIdxs });
                        }
                    } else if (card.val === "DISCARD") {
                        const totalCount = hand.length + hackedCount;
                        if (totalCount > 2) continue;
                        const handAfterUse = hand.filter((_, idx) => idx !== i);
                        const targetIdxs = [];
                        for (let j = 0; j < handAfterUse.length; j++) {
                            if (handAfterUse[j] && handAfterUse[j].type === "num") targetIdxs.push(j);
                        }
                        if (targetIdxs.length > 0) {
                            symbolOptions.push({ kind: "DISCARD", idx: i, targetIdxs });
                        }
                    }
                }
            }

            let symbolCandidates = symbolOptions;
            if (roleKey === "POLITICIAN") {
                const hasDiscardSymbol = hand.some(card => card && card.type === "sym" && card.val === "DISCARD");
                const nonDiscardOptions = symbolOptions.filter(option => option.kind !== "DISCARD");
                if (hasDiscardSymbol && nonDiscardOptions.length > 0) {
                    symbolCandidates = nonDiscardOptions;
                }
            }

            if (!forceWatchdog && symbolCandidates.length > 0) {
                const picked = pickRandom(shuffleCopy(symbolCandidates));
                if (!picked) return state;

                if (picked.kind === "REVERSE") {
                    const used = hand.splice(picked.idx, 1)[0];
                    if (!used || used.val !== "REVERSE") return state;

                    const remainCount = hand.length + hackedCount;
                    const soundList = buildSoundList("REVERSE", remainCount);
                    state.lastSound = { type: soundList, id: ctx.now };
                    state.hands = state.hands || {};
                    state.hands[activePid] = hand;
                    state.graveSym = [...(state.graveSym || []), used];
                    state.lastGraveActorId = activePid;
                    clearPoliticianShieldInState(state, activePid, ctx, "REVERSE使用");
                    state.isReverse = !state.isReverse;
                    ctx.appendLog(`${playerName}が [REVERSE] を使用して強弱を逆転させました`, "public");
                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    return state;
                }

                if (picked.kind === "TRADE_WHIFF") {
                    const used = hand.splice(picked.idx, 1)[0];
                    if (!used || used.val !== "TRADE") return state;
                    const blockedName = getPlayerNameFromState(state, picked.blockedPid);

                    const remainCount = hand.length + hackedCount;
                    const soundList = buildSoundList("TRADE", remainCount);
                    state.lastSound = { type: soundList, id: ctx.now };
                    state.hands = state.hands || {};
                    state.hands[activePid] = hand;
                    state.graveSym = [...(state.graveSym || []), used];
                    state.lastGraveActorId = activePid;
                    clearPoliticianShieldInState(state, activePid, ctx, "TRADE空振り使用");
                    ctx.appendLog(`${playerName}が [TRADE] を使用しましたが、${blockedName} は[政治家]保護中のため空振りになりました。`, "public");
                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    return state;
                }

                if (picked.kind === "TRADE") {
                    const targetId = pickCpuTradeTarget(state, activePid, roleKey, picked.targets);
                    if (!targetId) return state;

                    const used = hand.splice(picked.idx, 1)[0];
                    if (!used || used.val !== "TRADE") return state;

                    let targetHand = sortCards(deepCopy((state.hands && state.hands[targetId]) || []));
                    if (targetHand.length <= 0) return state;
                    if (isPoliticianShieldActive(targetId, state)) return state;

                    const giveCandidates = hand.map((_, idx) => idx);
                    if (giveCandidates.length <= 0) return state;
                    const numGive = giveCandidates.filter(idx => hand[idx] && hand[idx].type === "num");
                    const giveIdx = pickRandom(numGive.length > 0 ? numGive : giveCandidates);
                    const takeIdx = pickRandom(targetHand.map((_, idx) => idx));
                    if (!Number.isInteger(giveIdx) || !Number.isInteger(takeIdx)) return state;

                    const giveCard = hand.splice(giveIdx, 1)[0];
                    const receiveCard = targetHand.splice(takeIdx, 1)[0];
                    if (!giveCard || !receiveCard) return state;

                    hand.push(receiveCard);
                    targetHand.push(giveCard);
                    hand = sortCards(hand);
                    targetHand = sortCards(targetHand);

                    state.hands = state.hands || {};
                    state.hands[activePid] = hand;
                    state.hands[targetId] = targetHand;
                    state.graveSym = [...(state.graveSym || []), used];
                    state.lastGraveActorId = activePid;
                    clearPoliticianShieldInState(state, activePid, ctx, "TRADE使用");

                    const targetName = getPlayerNameFromState(state, targetId);
                    ctx.appendLog(`${playerName}が [TRADE] を使用して${targetName} とカードを交換しました`, "public");
                    ctx.appendLog(`${targetName}から [${receiveCard.val}] を奪い、[${giveCard.val}] を渡しました。`, "private", activePid);
                    ctx.appendLog(`${playerName}に [${receiveCard.val}] を奪われ、 [${giveCard.val}] を渡されました。`, "private", targetId);

                    state.players = state.players || {};
                    state.players[targetId] = state.players[targetId] || { name: targetName };
                    state.players[targetId].notification = {
                        fromName: `${playerName}(TRADE)`,
                        lostVal: receiveCard.val,
                        gotVal: giveCard.val
                    };

                    const remainCount = hand.length + hackedCount;
                    state.lastSound = { type: buildSoundList("TRADE", remainCount), id: ctx.now };
                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    return state;
                }

                if (picked.kind === "DIG_UP") {
                    let gn = [...(state.graveNum || [])];
                    if (gn.length <= 0) return state;

                    const used = hand.splice(picked.idx, 1)[0];
                    if (!used || used.val !== "DIG UP") return state;

                    const burySource = pickRandom(picked.buryIdxs);
                    if (!Number.isInteger(burySource)) return state;
                    const actualBuryIdx = (burySource > picked.idx) ? (burySource - 1) : burySource;
                    if (actualBuryIdx < 0 || actualBuryIdx >= hand.length) return state;

                    const topCard = gn.pop();
                    const buryCard = hand.splice(actualBuryIdx, 1)[0];
                    if (!topCard || !buryCard || buryCard.type !== "num") return state;

                    hand.push(topCard);
                    hand = sortCards(hand);
                    gn.push({ ...buryCard, owner: activePid });

                    state.hands = state.hands || {};
                    state.hands[activePid] = hand;
                    state.graveNum = gn;
                    state.graveSym = [...(state.graveSym || []), used];
                    state.lastGraveActorId = activePid;
                    clearPoliticianShieldInState(state, activePid, ctx, "DIG UP使用");

                    const remainCount = hand.length + hackedCount;
                    state.lastSound = { type: buildSoundList("DIG UP", remainCount), id: ctx.now };
                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    ctx.appendLog(`${playerName}が [DIG UP] を使用して [${topCard.val}] を回収し、[${buryCard.val}] を埋めました。`, "public");
                    return state;
                }

                if (picked.kind === "DISCARD") {
                    const used = hand.splice(picked.idx, 1)[0];
                    if (!used || used.val !== "DISCARD") return state;

                    const targetAfterUse = pickRandom(picked.targetIdxs);
                    if (!Number.isInteger(targetAfterUse) || targetAfterUse < 0 || targetAfterUse >= hand.length) return state;
                    const discardCard = hand.splice(targetAfterUse, 1)[0];
                    if (!discardCard || discardCard.type !== "num") return state;

                    hand = sortCards(hand);
                    state.hands = state.hands || {};
                    state.hands[activePid] = hand;

                    state.graveNum = [...(state.graveNum || []), { ...discardCard, owner: activePid }];
                    state.graveSym = [...(state.graveSym || []), used];
                    state.lastGraveActorId = activePid;
                    clearPoliticianShieldInState(state, activePid, ctx, "DISCARD使用");

                    const remainCount = hand.length + hackedCount;
                    const soundList = buildSoundList("DISCARD", remainCount);
                    state.lastSound = { type: soundList, id: ctx.now };
                    state.passCount = 0;
                    ctx.appendLog(`${playerName}が [DISCARD] で [${discardCard.val}] を捨てました！！`, "public");

                    finalizeCpuFinishIfNeeded(state, ctx, activePid, hand, hackedCount, "DISCARD", soundList);
                    finishedNow = finishedNow || ctx.finishedNow;
                    return state;
                }
            }

            let roleActivatedNow = false;
            if (!forceWatchdog && !activated) {
                if (roleKey === "NECROMANCER") {
                    roleActivatedNow = tryCpuActivateNecromancer(state, ctx, activePid, playerName);
                } else if (roleKey === "ASTRONOMER") {
                    roleActivatedNow = tryCpuActivateAstronomer(state, ctx, activePid, playerName, hand);
                }
            }
            if (roleActivatedNow) return state;

            const forbiddenOnly = hasForbiddenZeroFinish || isForbiddenSymbolFinish;

            if (forceWatchdog) {
                ctx.appendLog(`${playerName}のCPU処理がタイムアウトしたため強制パスします。`, "public");
            } else if (roleKey && !activated && !isCpuImplementedRole(roleKey)) {
                ctx.appendLog(`${playerName}の役職[${roleLabel}]はCPU未実装のためパスします。`, "public");
            }

            applyCpuPass(state, ctx, activePid, { draw: forbiddenOnly });
            return state;
        });

        if (!result.committed) return false;
        const snapshot = result.snapshot ? result.snapshot.val() : null;

        if (
            finishedNow &&
            snapshot &&
            snapshot.status === "finished" &&
            snapshot.rankings &&
            snapshot.playerOrder
        ) {
            await updateFinalScores(snapshot.rankings, snapshot.playerOrder, { sourceState: snapshot });
        }
        return true;
    }

    async function cpuTick() {
        if (cpuLoopBusy) return;
        if (!currentRoom || !gameState) return;
        if (!isCpuHostController(gameState)) return;

        const action = getCpuPendingAction(gameState);
        if (!action) {
            updateCpuWatchSignature(null);
            return;
        }

        updateCpuWatchSignature(action);

        const now = Date.now();
        const lastAttemptAt = cpuLastAttemptAtBySig[action.sig] || 0;
        const shouldForceWatchdog =
            action.type === "playing" &&
            cpuWatchSig === action.sig &&
            cpuWatchStartedAt > 0 &&
            (now - cpuWatchStartedAt >= CPU_WATCHDOG_MS) &&
            cpuWatchdogDoneSig !== action.sig;

        if (!shouldForceWatchdog && (now - lastAttemptAt < CPU_ACTION_COOLDOWN_MS)) return;
        cpuLastAttemptAtBySig[action.sig] = now;

        cpuLoopBusy = true;
        try {
            let acted = false;

            if (action.type === "role-select") {
                acted = await runCpuRoleSelect(action.pid);
            } else if (action.type === "duel-optimize") {
                acted = await runCpuDuelOptimize(action.pid);
            } else if (action.type === "playing") {
                acted = await runCpuPlayingTurn({ pid: action.pid, watchdog: shouldForceWatchdog });
                if (shouldForceWatchdog && acted) {
                    cpuWatchdogDoneSig = action.sig;
                }
            }

            if (!acted && shouldForceWatchdog && cpuWatchdogDoneSig !== action.sig) {
                const forced = await runCpuPlayingTurn({ pid: action.pid, watchdog: true });
                if (forced) cpuWatchdogDoneSig = action.sig;
            }
        } catch (e) {
            console.error("[cpu-engine] tick error", e);
        } finally {
            cpuLoopBusy = false;
        }
    }

    installHostSettingWrappers();
    setInterval(() => {
        cpuTick();
    }, CPU_TICK_MS);
})();
