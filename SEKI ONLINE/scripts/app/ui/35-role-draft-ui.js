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
            const draftGroupOrder = Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER;

            const myChoices = (rd.choicesByPlayer && rd.choicesByPlayer[myId]) ? rd.choicesByPlayer[myId] : {};
            const validRoles = draftGroupOrder.map(groupKey => myChoices[groupKey]).filter(Boolean);
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
                    const draftGroupOrder = Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER;

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
                        const enabledGroups = Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER;
                        state.publicRoleInfo = {
                            unselectedRoles: [...rd.publicUnusedRoles],
                            selectedGroups: { ...(rd.selectedGroups || {}) },
                            enabledGroups: [...enabledGroups]
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
            const draftGroupOrder = Array.isArray(rd.groupOrder) ? rd.groupOrder : ROLE_DRAFT_GROUP_ORDER;
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
                    const enabledGroups = Array.isArray(currentRd.groupOrder) ? currentRd.groupOrder : ROLE_DRAFT_GROUP_ORDER;
                    if (endAt > 0 && now < endAt) return state;

                    let clearRoleDraft = false;

                    if (phase === "booting") {
                        currentRd.phase = (enabledGroups.length === 0) ? "system_online" : "selecting";
                        currentRd.phaseStartedAt = now;
                        currentRd.phaseEndsAt = (enabledGroups.length === 0)
                            ? now + ROLE_DRAFT_PHASE_MS.system_online
                            : 0;
                        currentRd.resolve = null;
                        if (enabledGroups.length === 0) {
                            appendLogEntryToState(state, "役職なしモードのため選択フェーズをスキップしました", "public");
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
                                enabledGroups: [...enabledGroups]
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
                            selectedGroups: selectedGroups,
                            enabledGroups: [...enabledGroups]
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

