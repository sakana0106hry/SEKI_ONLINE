        async function joinGame() {
            unlockAudioContext();
            playSoundEffect('JOIN');
            if(currentRoom) return;
            els.btnJoin.disabled = true; 
            
            lastReadLogTime = Date.now();

            try {
                const room = els.roomName.value.trim();
                const name = els.playerName.value.trim();
                if (!room || !name) {
                    els.btnJoin.disabled = false;
                    return showInfoModal("入力エラー", "部屋名と名前を入力してください");
                }

                // ▼▼▼▼▼ ここから追加・修正 ▼▼▼▼▼
                
                // 1. まず部屋のデータを取得して確認する
                const checkRef = db.ref(`rooms/${room}`);
                const snapshot = await checkRef.get();

                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const players = data.players || {};
                    const playerCount = Object.keys(players).length;
                    
                    // 「自分がまだリストにいない」かつ「既に5人以上いる」ならエラー
                    // (リロードして戻ってきた人は入れるように !players[myId] で判定します)
                    if (!players[myId] && playerCount >= 5) {
                        els.btnJoin.disabled = false;
                        return showInfoModal("満員", "この部屋は定員(5名)に達しています。<br>別の部屋名を使ってください。");
                    }

                    // ★追加: 名前重複チェック
                    // IDが違うのに、同じ名前の人がいたらエラーにする
                    const isNameDuplicate = Object.keys(players).some(pid => {
                        // 自分自身は除外
                        if (pid === myId) return false;
                        // 名前が一致するかチェック
                        return players[pid].name === name;
                    });

                    if (isNameDuplicate) {
                         els.btnJoin.disabled = false;
                         return showInfoModal("名前重複", "その名前は既に使用されています。<br>別の名前を使ってください。");
                    }

                }
                

                myName = name;
                currentRoom = room;

                const updates = {};
                updates[`rooms/${room}/players/${myId}/name`] = name;
                updates[`rooms/${room}/players/${myId}/online`] = true;
                //★変更：サーバーの正確な時間を使って「入室時刻」を記録する
                updates[`rooms/${room}/players/${myId}/joinedAt`] = firebase.database.ServerValue.TIMESTAMP;


                await db.ref().update(updates);
                joined = true;

                showAssetLoadingScreen();

                let failedAssets = [];
                let retryTargets = null;
                while (true) {
                    const preloadResult = await preloadAllAssets({
                        targets: retryTargets,
                        concurrency: 4,
                        onProgress: updateAssetLoadingUI
                    });

                    failedAssets = preloadResult.failed || [];
                    if (failedAssets.length === 0) {
                        renderAssetLoadingFailed([]);
                        break;
                    }

                    console.warn("アセットプリロード失敗一覧", failedAssets);
                    renderAssetLoadingFailed(failedAssets);

                    const action = await waitAssetLoadingAction();
                    if (action === "retry") {
                        retryTargets = failedAssets.map(item => ({
                            kind: item.kind,
                            key: item.key,
                            url: item.url,
                            label: item.label
                        }));

                        renderAssetLoadingFailed([]);
                        updateAssetLoadingUI({
                            loaded: 0,
                            total: retryTargets.length,
                            percent: 0,
                            currentLabel: "再試行を開始...",
                            failedCount: 0
                        });
                        continue;
                    }
                    break;
                }

                await hideAssetLoadingScreen();

                stabilizeViewportForGameEntry();
                setRoomSuggestionVisible(false);
                stopRoomSuggestionPolling();
                els.login.classList.add("hidden");
                await showBootTransitionScreen();
                els.game.classList.remove("hidden");
                stabilizeViewportForGameEntry();
                setTimeout(stabilizeViewportForGameEntry, 120);
                document.getElementById("room-display").innerText = `部屋: ${room}`;

                setupEffectListener();
                playBgm('BGM_LOBBY');

                const roomRef = db.ref(`rooms/${room}`);
                const applyRoomSnapshot = (data, options = {}) => {
                    const deferRender = !!(options && options.deferRender);
                    if (data) {
                        if (deferRender) {
                            scheduleRoomRender(data);
                        } else {
                            cancelQueuedRoomRender();
                            gameState = data;
                            render(data);
                        }
                    } else {
                        cancelQueuedRoomRender();
                        if (joined && gameState && gameState.playerOrder) {
                            showInfoModal("終了", "部屋が解散（削除）されました。");
                            setTimeout(() => location.reload(), 2000);
                        } else {
                            gameState = { players: { [myId]: { name, online: true } }, logs: [] };
                            render(gameState);
                        }
                    }
                };

                const initialRoomSnapshot = await roomRef.get();
                applyRoomSnapshot(initialRoomSnapshot.val(), { deferRender: false });

                roomRef.on('value', (snapshot) => {
                    applyRoomSnapshot(snapshot.val(), { deferRender: true });
                });
            } catch(e) {
                await hideAssetLoadingScreen();
                showInfoModal("通信エラー", e.message);
                els.btnJoin.disabled = false;
            }
        }

        function confirmCloseRoom() {
            showConfirmModal("解散確認", "本当に部屋を解散しますか？", "execCloseRoom()");
        }
        async function execCloseRoom() {
            try { await db.ref(`rooms/${currentRoom}`).remove(); location.reload(); } 
            catch(e) { showInfoModal("エラー", "削除失敗: " + e.message); }
        }

        /* --- 修正版 confirmInitGame --- */
        function confirmInitGame() {
            // showConfirmModalを使うと、ボタンを押した瞬間に強制的に閉じてしまい、
            // エラーメッセージまで消してしまうので、手動でボタンを作ります。
            
            els.mTitle.innerText = "開始確認";
            els.mContent.innerHTML = "<p>ゲームを開始（リセット）しますか？</p>";
            els.mFooter.innerHTML = `
                <button onclick="closeModal(); execInitGame()" class="modal-btn primary">${getModalActionLabel("yes")}</button>
                <button onclick="closeModal()" class="modal-btn">${getModalActionLabel("no")}</button>
            `;
            els.modal.classList.remove("hidden");
        }
        async function execInitGame(fixedNumCount) {
            try {
                const players = gameState.players || {};

                // 1. 入室順リスト取得
                let playerIds = getSortedPlayerIds(players);

                // 2. 最下位を先頭へ
                if (gameState.rankings) {
                    let loserId = Object.keys(gameState.rankings).reduce((a, b) => 
                        gameState.rankings[a] > gameState.rankings[b] ? a : b
                    , null);

                    if (loserId && playerIds.includes(loserId)) {
                        playerIds = playerIds.filter(pid => pid !== loserId);
                        playerIds.unshift(loserId);
                    }
                }

                if(playerIds.length < 2) return showInfoModal("エラー", "最低2人のプレイヤーが必要です！");

                // ★修正: 引数で枚数を受け取る（なければデフォルト6）
                // (モーダル内の要素を探す処理は削除しました)
                let numCount = fixedNumCount || 6;

                let deckNum = [];
                NUMBERS.forEach(n => { for(let i=0; i<4; i++) deckNum.push({type:'num', val:n}); });
                let deckSym = [];
                SYMBOLS.forEach(s => { for(let i=0; i<SYMBOL_COUNTS[s]; i++) deckSym.push({type:'sym', val:s}); });
                
                shuffle(deckNum);
                shuffle(deckSym);

                /* --- execInitGame関数内 --- */
                let hands = {};
                playerIds.forEach((pid, i) => {
                    let h = [];
                    // ★枚数選択反映
                    for(let k=0; k<numCount; k++) h.push(deckNum.pop());
                    for(let k=0; k<2; k++) h.push(deckSym.pop());
                    h = sortCards(h);
                    hands[pid] = h;
                });

                const roleDraftChoices = buildRoleDraftChoices(playerIds);
                const now = Date.now();

                const initData = {
                    status: "role_selecting",
                    deckNum,
                    deckSym,
                    graveNum: [],
                    graveSym: [],
                    exclusion: [],
                    isReverse: false,
                    turnIdx: 0,
                    playerOrder: playerIds,
                    passCount: 0,
                    hands,
                    roles: {},
                    players,
                    rankings: {},
                    astronomerObservation: null,
                    // 【追加】能力使用済みフラグ（初期値は空）
                    activatedList: {},
                    politicianShield: {},
                    revealedRoles: {},
                    publicRoleInfo: {
                        unselectedRoles: [],
                        selectedGroups: {}
                    },
                    roleDraft: {
                        order: playerIds,
                        currentIdx: 0,
                        choicesByPlayer: roleDraftChoices,
                        selectedRoles: {},
                        selectedGroups: {},
                        unusedByPlayer: {},
                        publicUnusedRoles: [],
                        phase: "booting",
                        phaseStartedAt: now,
                        phaseEndsAt: now + ROLE_DRAFT_PHASE_MS.booting,
                        resolve: null
                    },

                    // ★追加: ハッキングされたカードの隔離所
                    hackedHands: null,

                    // ▼▼▼ 修正: ここに lastSound: null を追加して、前の音を消す ▼▼▼
                    lastSound: null,
                    // ▲▲▲ 追加ここまで ▲▲▲

                    // ログにカミングアウト情報を追加
                    logs: [
                        {text: `ゲーム開始！(数字${numCount}枚モード)`, type: "public", timestamp: now},
                        {text: "役職選択フェーズを開始します", type: "public", timestamp: now + 1}
                    ]
                };

                wasMyTurn = false;
                hasFinished = false;
                roleDraftPendingSelection = null;
                roleDraftPhaseAudioToken = "";
                await db.ref(`rooms/${currentRoom}`).update(initData);
            } catch(e) { showInfoModal("エラー", "開始エラー: " + e.message); }
        }

        // ★共通関数: リセット権の継承判定ロジック
        function checkInheritedResetLogic(data, myId) {
            if (!data) return false;
            
            let top = (data.graveNum && data.graveNum.length > 0) ? data.graveNum[data.graveNum.length-1] : null;
            
            // 1. 基本条件: 墓地にカードがあり、その持ち主が前回の勝者であり、かつその勝者が今回のランキングに存在すること
            if (!top || !data.lastWinnerId || data.lastWinnerId !== top.owner) return false;
            if (!data.rankings || !data.rankings[data.lastWinnerId]) return false;

            // 2. 生存人数計算 (あがっていない人)
            let activePIds = (data.playerOrder || []).filter(pid => !data.rankings || !data.rankings[pid]);
            let activeCount = activePIds.length;
            if (activeCount <= 0) return false;

            // 3. 一周判定ガード:
            // 手番が「勝者の次の生存者」に戻っている時だけ継承成立を許可する
            if (!Array.isArray(data.playerOrder) || typeof data.turnIdx !== 'number') return false;
            let winnerIdx = data.playerOrder.indexOf(data.lastWinnerId);
            if (winnerIdx < 0) return false;
            let cycleStartIdx = getNextActivePlayerIndex(winnerIdx, data.playerOrder, data.rankings || {});
            if (cycleStartIdx < 0 || data.turnIdx !== cycleStartIdx) return false;
            
            // 4. ログ解析: 勝った時間より後のログを確認
            let winTime = data.lastWinnerTime || 0;
            let logs = data.logs || [];
            let actedNames = new Set();
            let recentLogs = logs.filter(l => l.timestamp > winTime && l.type === 'public');

            recentLogs.forEach(l => {
                let match = l.text.match(/^(.+?)が/);
                if (match) actedNames.add(match[1]);
            });

            // 5. 除外処理 (勝者本人を除外)
            if (data.players && data.players[data.lastWinnerId]) {
                actedNames.delete(data.players[data.lastWinnerId].name);
            }

            // 6. 判定
            return actedNames.size >= activeCount;
        }

       function render(data) {
            // 1. 要素の取得
            let turnIndicator = document.getElementById("turn-indicator");
            let graveContainer = document.getElementById("grave-container");
            let handContainer = document.getElementById("my-hand");
            let hackedContainer = document.getElementById("hacked-area");
            let didPatchOpponentArea = false;
            let didPatchNameBar = false;

            // 3. データ準備
            const players = data.players || {};
            const hands = data.hands || {};
            const roleDraft = data.roleDraft || null;
            const savedRoles = data.roles || {};
            const draftSelectedRoles = (roleDraft && roleDraft.selectedRoles) ? roleDraft.selectedRoles : {};
            const roles = (data.status === "role_selecting")
                ? { ...savedRoles, ...draftSelectedRoles }
                : savedRoles;
            const hackedHands = data.hackedHands || {};
            const currentAct = data.activatedList || {};
            const currentRev = data.revealedRoles || {};
            const publicRoleInfo = data.publicRoleInfo || {};
            const selectedGroupMap = {
                ...((roleDraft && roleDraft.selectedGroups) ? roleDraft.selectedGroups : {}),
                ...((publicRoleInfo && publicRoleInfo.selectedGroups) ? publicRoleInfo.selectedGroups : {})
            };

            renderRoleDraftMonitor(data);
            if (data.status === "role_selecting") {
                advanceRoleDraftPhaseIfNeeded(data);
            }

            // ★追加: 墓地トップとリセット権所有者の計算（位置を上に移動）
            let top = (data.graveNum && data.graveNum.length > 0) ? data.graveNum[data.graveNum.length-1] : null;
            let resetHolder = top ? top.owner : null;

           // ★修正: 共通関数を使ってリセット権の継承判定を行う
            let isInheritedReset = checkInheritedResetLogic(data, myId);

            // ★決定: 最終的なリセット権を持つプレイヤーID
            // 継承が起きているなら「現在の手番プレイヤー」、そうでなければ「カードの持ち主」
            let effectiveResetHolder = resetHolder;
            if (isInheritedReset && data.playerOrder) {
                effectiveResetHolder = data.playerOrder[data.turnIdx];
            }

            // ★追加: 実質的なホスト（権限者）を決定する
            // 通常は先頭の人だが、ゲーム終了時は「最下位の人」に権限を移す
            let pIdsForHost = getSortedPlayerIds(players);
            if (data.playerOrder) pIdsForHost = data.playerOrder;
            
            let effectiveHostId = (pIdsForHost.length > 0) ? pIdsForHost[0] : null;

            if (data.status === "finished" && data.rankings) {
                let loserId = Object.keys(data.rankings).reduce((a, b) => 
                    data.rankings[a] > data.rankings[b] ? a : b
                , null);
                
                if (loserId && players[loserId]) {
                    effectiveHostId = loserId;
                }
            }

            // ↓↓↓ 修正: "山札: xx枚" という文字を消し、数字だけ入れる ↓↓↓
            if (data.deckNum && els.deckNum) els.deckNum.innerText = data.deckNum.length;
            if (data.deckSym && els.deckSym) els.deckSym.innerText = data.deckSym.length;
            
            // -----------------------------------------------------
            // A. ゲーム進行中の描画
            // -----------------------------------------------------
            if (data.status === "playing" || data.status === "finished" || data.status === "role_selecting") {
                
                // --- 1. 手札の描画 (統合版・安全対策済み) ---
                const rawHand = hands[myId] || [];
                const myLockedHand = hackedHands[myId] || [];
                if (selectedIdx >= rawHand.length) selectedIdx = -1;
                const handSignature = buildRenderSignature({
                    status: data.status,
                    selectedIdx,
                    rankings: data.rankings || {},
                    rawHand,
                    myLockedHand
                });
                if (renderCache.handSig !== handSignature) {
                    if (handContainer) {
                        handContainer.innerHTML = ""; // クリア
                        let myHand = rawHand ? sortCards(deepCopy(rawHand)) : [];
                        const fragment = document.createDocumentFragment();

                        // 【対策A】 「通常の手札」
                        myHand.forEach((c, i) => {
                            let div = document.createElement("div");
                            let cssClass = `card ${c.type}`;
                            if (c.isOpen) cssClass += " revealed";

                            div.className = cssClass;
                            div.dataset.handIndex = String(i);
                            // if(c.val === 0) div.setAttribute("data-val", "0");
                            if(i === selectedIdx) div.classList.add("selected");

                            let valNode = document.createTextNode(c.val);
                            div.appendChild(valNode);

                            let imgUrl = CARD_IMAGES[c.val];
                            if (imgUrl) {
                                div.style.backgroundImage = `url('${imgUrl}')`;
                                div.classList.add('has-img');
                            }

                            if (data.status === "playing" && !data.rankings?.[myId]) {
                                div.onclick = () => {
                                    selectedIdx = (selectedIdx === i) ? -1 : i;
                                    updateMyHandSelectionVisual(handContainer);
                                };
                            }
                            fragment.appendChild(div);
                        });

                        // 【対策B】 「隔離カード」
                        myLockedHand.forEach(c => {
                            let div = document.createElement("div");
                            div.className = `card ${c.type} locked`;

                            let imgUrl = CARD_IMAGES[c.val];
                            if (imgUrl) {
                                div.style.backgroundImage = `url('${imgUrl}')`;
                                div.classList.add('has-img');
                            }

                            let valNode = document.createTextNode(c.val);
                            div.appendChild(valNode);
                            // if(c.val === 0) div.setAttribute("data-val", "0");

                            div.onclick = () => showInfoModal("ロック中", "このカードは機能停止しています。");
                            fragment.appendChild(div);
                        });

                        handContainer.appendChild(fragment);
                        applyMyHandLayout();
                    }
                    if (hackedContainer) hackedContainer.innerHTML = "";
                    renderCache.handSig = handSignature;
                }

                // --- 3. 役職パネルの描画 ---
                const myRole = roles[myId];
                const rInfo = (typeof ROLE_INFO !== 'undefined') ? ROLE_INFO[myRole] : null;
                const rolePanelSignature = buildRenderSignature({
                    status: data.status,
                    myRole: myRole || "",
                    activated: currentAct[myId] || "",
                    myRank: (data.rankings && data.rankings[myId]) ? data.rankings[myId] : 0,
                    myTurn: isMyTurn(),
                    shield: isPoliticianShieldActive(myId, data)
                });

                let roleArea = document.getElementById("my-role-panel");
                if(!roleArea && document.getElementById("my-area")) {
                    roleArea = document.createElement("div");
                    roleArea.id = "my-role-panel";
                    let controls = document.getElementById("controls");
                    if(controls) document.getElementById("my-area").insertBefore(roleArea, controls);
                }

                if (renderCache.rolePanelSig !== rolePanelSignature) {
                    if (roleArea && myRole && rInfo) {
                        const myRoleAttrClass = getRoleAttrClass(myRole);
                        let actBtnHtml = "";
                        let isActivated = currentAct[myId];
                        let isPoliticianShielded = isPoliticianShieldActive(myId, data);

                        if (isMyTurn() && !isActivated && data.status === "playing") {
                            let funcName = "";
                            // 各役職の発動関数マッピング
                            if (myRole === "ANGLER") funcName = "activateAngler()";
                            else if (myRole === "FORTUNE TELLER") funcName = "activateFortuneTeller()";
                            else if (myRole === "THIEF") funcName = "activateThief(1)";
                            else if (myRole === "HUNTER") funcName = "activateHunter()";
                            else if (myRole === "GAMBLER") funcName = "activateGambler()";
                            else if (myRole === "CROWN") funcName = "activateMagician()";
                            else if (myRole === "MILLIONAIRE") funcName = "activateMillionaire()";
                            else if (myRole === "EMPEROR") funcName = "activateEmperor()";
                            else if (myRole === "POLITICIAN") funcName = "activatePolitician()";
                            else if (myRole === "POLICE OFFICER") funcName = "activatePoliceOfficer()";
                            else if (myRole === "HACKER") funcName = "activateHacker()";
                            else if (myRole === "ALCHEMIST") funcName = "activateAlchemist()";
                            else if (myRole === "ASTRONOMER") funcName = "activateAstronomer()";
                            else if (myRole === "NECROMANCER") funcName = "activateNecromancer()";
                            else if (myRole === "AGENT") funcName = "activateAgent()";

                            if (funcName) {
                                actBtnHtml = `<button onclick="${funcName}" class="seki-btn seki-btn-mini role-activate-btn ${myRoleAttrClass}">ACTIVATE</button>`;
                            }
                        } else if (isActivated) {
                            let statusText = "ACTIVATED";
                            if (myRole === "POLITICIAN") statusText = isPoliticianShielded ? "PROTECTING" : "EXPIRED";
                            else if (myRole === "EMPEROR") statusText = "ACTIVATED";
                            else if (myRole === "ASTRONOMER") statusText = getAstronomerRoleSubText(data) || "ACTIVATED";

                            // ▼▼▼ 修正: ピエロの場合、中身を表示 ▼▼▼
                            if (myRole === "CROWN" && typeof isActivated === 'string') {
                                // 役職IDなら日本語に変換、そうでなければそのまま表示(REVERSE等)
                                let val = isActivated;
                                if (ROLE_INFO[val]) val = ROLE_INFO[val].jp;

                                statusText = `USED: ${val}`;
                            }
                            // ▲▲▲ 修正ここまで ▲▲▲

                            actBtnHtml = `<div class="role-status-badge">${statusText}</div>`;
                        }

                        // 背景スタイル
                        let roleCardClass = `role-card ${myRoleAttrClass}`.trim();
                        if (isActivated) roleCardClass += " is-used";
                        const bgUrl = (typeof ROLE_IMAGES !== 'undefined') ? ROLE_IMAGES[myRole] : null;
                        let bgStyle = "";

                        if (bgUrl) {
                            bgStyle = `background: linear-gradient(135deg, rgba(var(--role-accent-rgb, 0, 216, 255), 0.28), rgba(0,0,0,0.78)), url('${bgUrl}'); background-size: cover; background-position: center 12%;`;
                        } else {
                            bgStyle = `background: linear-gradient(135deg, rgba(var(--role-accent-rgb, 0, 216, 255), 0.36), rgba(4,11,23,0.92));`;
                        }

                        roleArea.innerHTML = `
                            <div class="${roleCardClass}" style="${bgStyle}">
                                <div class="role-name">${getRoleDisplayCode(myRole)}</div>
                                <div class="role-jp">${rInfo.jp}</div>
                                <div class="role-desc">${rInfo.summary}</div>
                                ${actBtnHtml}
                            </div>
                        `;
                    } else if (roleArea) {
                        roleArea.innerHTML = "";
                    }
                    renderCache.rolePanelSig = rolePanelSignature;
                }

                // --- 4. 演出・音・カットイン ---
                Object.keys(currentAct).forEach(pid => {
                    if (!prevActivatedList[pid] && currentAct[pid]) {
                        const rKey = roles[pid];
                        const rNameJP = (typeof ROLE_INFO !== 'undefined' && ROLE_INFO[rKey]) ? ROLE_INFO[rKey].jp : rKey;
                        const pName = players[pid].name;
                        
                        if (typeof playCutInAnimation === 'function') playCutInAnimation(rKey, rNameJP, pName);
                    }
                });
                
                Object.keys(currentRev).forEach(pid => {
                    if (!prevRevealedRoles[pid] && currentRev[pid]) {
                        const rKey = roles[pid];
                        if (rKey === "EMPEROR") {
                            const rNameJP = (typeof ROLE_INFO !== 'undefined' && ROLE_INFO[rKey]) ? ROLE_INFO[rKey].jp : rKey;
                            const pName = players[pid].name;
                            if (typeof playCutInAnimation === 'function') playCutInAnimation(rKey, rNameJP, pName);
                        }
                    }
                });

                prevActivatedList = deepCopy(currentAct);
                prevRevealedRoles = deepCopy(currentRev);

                // --- 5. BGM & 他プレイヤー表示 ---
                // ★修正: ゲーム終了時はロビーBGM（または停止）に切り替える
                if (data.status === "playing") {
                    playBgm('BGM_BATTLE');
                } else if (data.status === "role_selecting") {
                    playBgm('BGM_CHOICE');
                } else {
                    playBgm('BGM_LOBBY'); 
                    // ※もし無音が良ければ stopBgm(); にしてください
                }

                const areaTop = document.getElementById("area-top");
                const areaLeft = document.getElementById("area-left");
                const areaRight = document.getElementById("area-right");

                let pIds = getSortedPlayerIds(players);
                if(data.playerOrder) pIds = data.playerOrder;
                const roleDraftActivePid = getRoleDraftActivePlayerId(data);
                const opponentSignature = buildRenderSignature({
                    status: data.status,
                    turnIdx: Number(data.turnIdx) || 0,
                    playerOrder: pIds,
                    rankings: data.rankings || {},
                    effectiveResetHolder: effectiveResetHolder || null,
                    effectiveHostId: effectiveHostId || null,
                    roleDraftActivePid: roleDraftActivePid || null,
                    hands,
                    hackedHands,
                    roles,
                    currentAct,
                    currentRev,
                    selectedGroupMap,
                    revealedCards: data.revealedCards || {}
                });

                if (renderCache.opponentsSig !== opponentSignature) {
                    // 自分エリアの演出処理
                    const myAreaEl = document.getElementById("my-area");
                    if (myAreaEl) {
                        myAreaEl.classList.remove("current-turn", "warning-1", "warning-2");
                        if ((data.status === "role_selecting" && roleDraftActivePid === myId) || (data.status !== "role_selecting" && pIds[data.turnIdx] === myId)) {
                            myAreaEl.classList.add("current-turn");
                        }
                    }

                    // 配置計算
                    let relativeOrder = [];
                    let myIndex = pIds.indexOf(myId);
                    if (myIndex !== -1) {
                        for (let i = 1; i < pIds.length; i++) {
                            let idx = (myIndex + i) % pIds.length;
                            relativeOrder.push(pIds[idx]);
                        }
                    } else {
                        relativeOrder = pIds; // 観戦用
                    }

                    let layoutMap = [];
                    let total = relativeOrder.length;
                    if (total === 2) {
                        layoutMap = [{ pid: relativeOrder[0], areaKey: "left" }, { pid: relativeOrder[1], areaKey: "right" }];
                    } else if (total === 3) {
                        layoutMap = [{ pid: relativeOrder[0], areaKey: "left" }, { pid: relativeOrder[1], areaKey: "top" }, { pid: relativeOrder[2], areaKey: "right" }];
                    } else if (total === 4) {
                        layoutMap = [{ pid: relativeOrder[0], areaKey: "left" }, { pid: relativeOrder[1], areaKey: "top" }, { pid: relativeOrder[2], areaKey: "top" }, { pid: relativeOrder[3], areaKey: "right" }];
                    } else {
                        relativeOrder.forEach(pid => layoutMap.push({pid: pid, areaKey: "top"}));
                    }
                    const areaHtml = { top: "", left: "", right: "" };

                    // ■■■ 描画ループ (3段固定レイアウト版) ■■■
                    layoutMap.forEach(item => {
                        let pid = item.pid;
                        if (!pid) return;

                        // ▼▼▼ 追加: エリアに応じた吹き出し位置クラスを決定 ▼▼▼
                        let bubbleClass = "bubble-pos-top"; // デフォルト（上）
                        if (item.areaKey === "left") bubbleClass = "bubble-pos-left";
                        else if (item.areaKey === "right") bubbleClass = "bubble-pos-right";
                        // ▲▲▲ 追加ここまで ▲▲▲

                        let isTurn = false;
                        if (data.status === "role_selecting") {
                            isTurn = (roleDraftActivePid === pid);
                        } else {
                            isTurn = (pIds[data.turnIdx] === pid);
                        }
                        let isRanked = (data.rankings && data.rankings[pid]);
                        let pHand = hands[pid] || [];
                        let lockedHand = hackedHands[pid] || [];
                        let handCount = pHand.length + lockedHand.length;

                    // クラス設定
                    let boxClass = "p-box-new";
                    if (isTurn) boxClass += " current";
                    if (isRanked) boxClass += " passed";

                    // --- 1. 手札枚数の色スタイル ---
                    let countClass = "";
                    if (!isRanked) { 
                        if (handCount === 1) {
                            boxClass += " warning-1";
                            countClass = " count-danger";
                        } else if (handCount === 2) {
                            boxClass += " warning-2";
                            countClass = " count-warning";
                        }
                    } else {
                        // あがった人は枚数0でグレーアウト
                        countClass = " count-passed";
                    }

                    // --- 2. ステータス表示 (NORMAL / RESET / RANK) ---
                    let statusHtml = `<span class="status-text status-normal">NORMAL</span>`;
                    
                    if (isRanked) {
                        // 順位がついている場合
                        let rank = data.rankings[pid];
                        let suffix = ["st","nd","rd"][rank-1] || "th"; // 1st, 2nd...
                        statusHtml = `<span class="status-text status-rank">🏆 ${rank}${suffix}</span>`;
                    } else if (data.status === "role_selecting") {
                        statusHtml = isTurn
                            ? `<span class="status-text status-reset">PICKING</span>`
                            : `<span class="status-text status-normal">WAITING</span>`;
                    } else if (pid === effectiveResetHolder) {
                        // リセット権を持っている場合
                        statusHtml = `<span class="status-text status-reset">RESET</span>`;
                    }
                    
                    // --- 3. 役職表示 (??? / ROLE NAME) ---
                    let isRevealed = currentAct[pid] || isRanked || currentRev[pid];
                    let roleHtml = `<span class="role-unknown">ROLE: ???</span>`; // デフォルト
                    
                    if (isRevealed) {
                        let rName = roles[pid];
                        let rJp = (typeof ROLE_INFO !== 'undefined' && ROLE_INFO[rName]) ? ROLE_INFO[rName].jp : rName;
                        const roleAttrClass = getRoleAttrClass(rName);
                        
                        let roleSub = "";
                        if (rName === "CROWN" && typeof currentAct[pid] === 'string') {
                            roleSub = currentAct[pid];
                        } else if (rName === "POLITICIAN" && currentAct[pid]) {
                            roleSub = isPoliticianShieldActive(pid, data) ? "保護中" : "保護解除";
                        } else if (rName === "ASTRONOMER" && currentAct[pid]) {
                            roleSub = getAstronomerRoleSubText(data) || "使用済み";
                        } else if (rName === "EMPEROR" && currentAct[pid]) {
                            roleSub = "使用済み";
                        }

                        if (roleSub) {
                            roleHtml = `<div class="role-badge-pill ${roleAttrClass}">${rJp}: <span class="role-sub">${roleSub}</span></div>`;
                        } else {
                            roleHtml = `<div class="role-badge-pill ${roleAttrClass}">${rJp}</div>`;
                        }
                    } else if (selectedGroupMap[pid]) {
                        const groupKey = selectedGroupMap[pid];
                        const groupMeta = ROLE_GROUP_META[groupKey] || {};
                        const groupClass = groupMeta.cssClass || "";
                        const groupLabel = groupMeta.label || groupKey;
                        roleHtml = `<div class="role-badge-pill role-badge-group-mask ${groupClass}">${groupLabel}</div>`;
                    }

                    // ヘッダーアイコン
                    let hostMark = (pid === effectiveHostId) ? "<span class='p-host-mark'>★</span>" : "";
                    
                    // --- 4. 公開カード情報のテキスト生成 (ここが変更点) ---
                    // 手札データ(hands)の中で isOpen フラグが立っているものを探す
                    let openFromHand = pHand.filter(c => c.isOpen);
                    
                    // サーバーから別途リストが送られてくる場合（念のため安全策）
                    let openFromServer = (data.revealedCards && data.revealedCards[pid]) ? data.revealedCards[pid] : [];
                    
                    // 両方をマージ
                    let allOpenCards = [...openFromHand, ...openFromServer];
                    let revealedTextHtml = "";

                    if (allOpenCards.length > 0) {
                        // 文字列リストを作成 (例: ["1", "REV"])
                        let textList = allOpenCards.map(c => {
                            let v = c.val; 
                            // 数字(0-9)があればそのまま返す
                            if (v !== undefined && v !== null && !isNaN(v)) {
                                return v;
                            }
                            
                            // 記号カードの略称変換
                            let name = String(v).toUpperCase();
                            if (name.includes('REVERSE')) return 'REV';
                            if (name.includes('TRADE'))   return 'TRD';
                            if (name.includes('DIG'))     return 'DIG';
                            if (name.includes('DISCARD')) return 'DIS';
                            
                            return "?"; 
                        });
                        
                        // ★修正: 重複を削除せず、ソートして見やすくしてから結合
                        // (Setを使わないことで、3が2枚なら "3, 3" と表示されるようになります)
                        textList.sort((a, b) => {
                            // 数字なら数字順、文字ならアルファベット順
                            if (!isNaN(a) && !isNaN(b)) return a - b;
                            return String(a).localeCompare(String(b));
                        });

                        let uniqueText = textList.join(', ');
                        revealedTextHtml = `公開: <span class="revealed-active">${uniqueText}</span>`;
                    } else {
                        // なし (グレー文字)
                        revealedTextHtml = `<span class="revealed-none">公開: NONE</span>`;
                    }
                    let pName = players[pid].name;


                    // ★ HTML組み立て ★
                    let html = `
                        <div class="${boxClass} with-bubble">
                            <div id="bubble-${pid}" class="chat-bubble ${bubbleClass}"></div>
                            <div class="p-header clickable" onclick="showPlayerLogs('${pid}')">${hostMark}${pName}</div>
                            <div class="p-body">
                                <div class="p-hand-count${countClass}">
                                    <span class="p-hand-icon">🃏×</span>${handCount}
                                </div>

                                <div class="p-status-area">
                                    ${statusHtml}
                                    <div class="p-revealed-info">
                                        ${revealedTextHtml}
                                    </div>
                                </div>
                            </div>

                            <div class="p-role-row">
                                ${roleHtml}
                            </div>
                        </div>
                    `;
                    
                        areaHtml[item.areaKey] += `<div class="p-box-wrap">${html}</div>`;
                    });

                    if (areaTop) {
                        areaTop.innerHTML = areaHtml.top;
                        areaTop.style.display = areaHtml.top ? "flex" : "none";
                    }
                    if (areaLeft) areaLeft.innerHTML = areaHtml.left;
                    if (areaRight) areaRight.innerHTML = areaHtml.right;
                    renderCache.opponentsSig = opponentSignature;
                    didPatchOpponentArea = true;
                }

                // --- 6. 場の情報更新 ---
                const boardSignature = buildRenderSignature({
                    status: data.status,
                    isReverse: !!data.isReverse,
                    graveNum: data.graveNum || [],
                    graveSym: data.graveSym || [],
                    exclusionCount: (data.exclusion || []).length,
                    astronomerObservation: data.astronomerObservation || null,
                    activatedList: data.activatedList || {},
                    roles
                });
                if (renderCache.boardSig !== boardSignature) {
                    if (els.indicator) {
                        let targetSrc = data.isReverse ? "./images/reverse_red.jpg" : "./images/reverse_blue.jpg";
                        if (els.indicator.getAttribute('src') !== targetSrc) els.indicator.src = targetSrc;
                    }
                    updateAstronomerIndicator(data);
                    if (els.graveNum) els.graveNum.innerHTML = renderPile(data.graveNum);
                    if (els.graveSym) els.graveSym.innerHTML = renderPile(data.graveSym);
                    if (document.getElementById("exclusion-count")) document.getElementById("exclusion-count").innerText = (data.exclusion || []).length;
                    renderCache.boardSig = boardSignature;
                }

                // メッセージ
                const messageSignature = buildRenderSignature({
                    status: data.status,
                    turnIdx: Number(data.turnIdx) || 0,
                    rankings: data.rankings || {},
                    roleDraftPhase: roleDraft ? roleDraft.phase : "",
                    roleDraftActivePid: roleDraftActivePid || null,
                    resetHolder: resetHolder || null,
                    isInheritedReset: !!isInheritedReset,
                    effectiveResetHolder: effectiveResetHolder || null,
                    playerOrder: pIds,
                    players: Object.keys(players).map(pid => [pid, players[pid] ? players[pid].name : ""])
                });
                if (renderCache.messageSig !== messageSignature) {
                    let isMyTurnNow = (pIds[data.turnIdx] === myId);
                    if (data.status === "role_selecting") {
                        const rd = data.roleDraft || {};
                        const activePid = getRoleDraftActivePlayerId(data);
                        const activeName = (activePid && players[activePid]) ? players[activePid].name : "プレイヤー";
                        const phase = rd.phase || "booting";
                        if (phase === "booting") {
                            els.msg.innerText = "役職選択システム起動中...";
                        } else if (phase === "selecting") {
                            els.msg.innerText = activePid === myId
                                ? "役職を選択して決定してください"
                                : `${activeName} が役職を選択中...`;
                        } else if (phase === "resolving") {
                            els.msg.innerText = "役職を確定中...";
                        } else if (phase === "reveal_unused") {
                            els.msg.innerText = "未選択役職を公開中...";
                        } else if (phase === "system_online") {
                            els.msg.innerText = "ALL ROLES AUTHENTICATED. SYSTEM ONLINE...";
                        } else {
                            els.msg.innerText = "ゲーム開始準備中...";
                        }
                        document.getElementById("btn-play").disabled = true;
                        document.getElementById("btn-pass").disabled = true;
                        lastCleanupTurnIdx = -1;
                        wasMyTurn = false;
                    } else if (data.status === "finished") {
                        els.msg.innerText = `ゲーム終了！`;
                        document.getElementById("btn-play").disabled = true;
                        document.getElementById("btn-pass").disabled = true;
                        wasMyTurn = false;
                    } else if (data.rankings && data.rankings[myId]) {
                        els.msg.innerText = `あなたは ${data.rankings[myId]}位 であがりました！`;
                        document.getElementById("btn-play").disabled = true;
                        document.getElementById("btn-pass").disabled = true;
                        wasMyTurn = false;

                    } else {
                        // ここでの activeCount, isInheritedReset は冒頭で計算したものを使用
                        let isOwnerReset = (resetHolder === myId);
                        let canReset = isOwnerReset || isInheritedReset;

                        if (isMyTurnNow) {
                            if (!wasMyTurn) playSoundEffect('turn');
                            if (data.turnIdx !== lastCleanupTurnIdx) {
                                lastCleanupTurnIdx = data.turnIdx;
                                if (typeof checkHackerCleanup === 'function') checkHackerCleanup();
                            }
                            els.msg.innerText = canReset ? "リセット可能（パスで発動）" : "あなたの番です";
                            document.getElementById("btn-play").disabled = false;
                            document.getElementById("btn-pass").disabled = false;
                        } else {
                            lastCleanupTurnIdx = -1;
                            let curP = players[pIds[data.turnIdx]];
                            els.msg.innerText = `${curP ? curP.name : '相手'} のターン`;
                            document.getElementById("btn-play").disabled = true;
                            document.getElementById("btn-pass").disabled = true;
                        }
                        wasMyTurn = isMyTurnNow;
                    }
                    renderCache.messageSig = messageSignature;
                }

            } else {
                // 待機中 (Lobby)
                const lobbyMessageSignature = buildRenderSignature({
                    status: data.status,
                    playerCount: Object.keys(players).length
                });
                if (renderCache.messageSig !== lobbyMessageSignature) {
                    els.msg.innerText = `待機中... ${Object.keys(players).length}人が参加`;
                    renderCache.messageSig = lobbyMessageSignature;
                }
                playBgm('BGM_LOBBY');
                prevActivatedList = {};
                prevRevealedRoles = {};
                if (renderCache.handSig !== "lobby") {
                    if (handContainer) handContainer.innerHTML = "";
                    if (hackedContainer) hackedContainer.innerHTML = "";
                    renderCache.handSig = "lobby";
                }
                if (renderCache.rolePanelSig !== "lobby") {
                    if (document.getElementById("my-role-panel")) document.getElementById("my-role-panel").innerHTML = "";
                    renderCache.rolePanelSig = "lobby";
                }
                if (renderCache.opponentsSig !== "lobby") {
                    const areaTop = document.getElementById("area-top");
                    const areaLeft = document.getElementById("area-left");
                    const areaRight = document.getElementById("area-right");
                    if (areaTop) {
                        areaTop.innerHTML = "";
                        areaTop.style.display = "none";
                    }
                    if (areaLeft) areaLeft.innerHTML = "";
                    if (areaRight) areaRight.innerHTML = "";
                    renderCache.opponentsSig = "lobby";
                    didPatchOpponentArea = true;
                }
                if (renderCache.boardSig !== "lobby") {
                    updateAstronomerIndicator(null);
                    renderCache.boardSig = "lobby";
                }
                renderRoleDraftMonitor(null);
            }

            // ホストコントロール (★変更点: effectiveHostIdを使用)
            // ↓↓↓ render関数内の「ホストコントロール」部分を書き換え ↓↓↓
            // ホストコントロール (★変更点: 新しいボタンを表示/非表示にする)
            const isHost = (effectiveHostId === myId);
            const btnHost = document.getElementById("btn-host-settings");
            
            if (isHost && btnHost) {
                btnHost.classList.remove("hidden");
            } else if (btnHost) {
                btnHost.classList.add("hidden");
            }

            // 通知チェック
            const myPlayer = players[myId] || {};
            if (myPlayer.notification) {
                playSoundEffect('WARNING');
                const note = myPlayer.notification;
                const toNotifCard = (val) => {
                    const asNumber = Number(val);
                    const type = Number.isFinite(asNumber) ? "num" : "sym";
                    return { type, val };
                };
                const lostCard = toNotifCard(note.lostVal);
                const gotCard = toNotifCard(note.gotVal);
                let html = `
                    <div class="modal-notif-wrap">
                        <p class="modal-notif-title">${note.fromName} にトレードされました！</p>
                        <div class="modal-card-row">
                            <div class="modal-notif-card"><div class="modal-card-label">盗まれた</div>${renderCardView(lostCard, { cssClass: `card ${lostCard.type} modal-notif-card-view`, attrs: 'aria-label="盗まれたカード"' })}</div>
                            <div class="modal-notif-arrow">➡</div>
                            <div class="modal-notif-card"><div class="modal-card-label">渡された</div>${renderCardView(gotCard, { cssClass: `card ${gotCard.type} modal-notif-card-view`, attrs: 'aria-label="渡されたカード"' })}</div>
                        </div>
                    </div>`;
                openModal("⚠️ トレード警告", html, { tone: "alert" });
                firebase.database().ref(`rooms/${currentRoom}/players/${myId}/notification`).remove();
            }

            // ↓↓↓ 追加: 自分の名前バーの更新 ↓↓↓
            // ■■■ 自分エリア（名前・役職・順位）の表示処理 ■■■
            const nameBar = document.getElementById("my-name-bar");
            if (nameBar && players[myId]) {
                const nameBarSignature = buildRenderSignature({
                    status: data.status,
                    myName: players[myId].name,
                    myRole: roles[myId] || "",
                    myAct: currentAct[myId] || "",
                    myRank: (data.rankings && data.rankings[myId]) ? data.rankings[myId] : 0,
                    effectiveResetHolder: effectiveResetHolder || null,
                    effectiveHostId: effectiveHostId || null
                });
                if (renderCache.nameBarSig !== nameBarSignature) {
                    // ▼▼▼ 追加: 自分用の吹き出しを nameBar の近くに追加 ▼▼▼
                    // nameBar は position: relative がないので、親の my-area に依存させるか、
                    // nameBar自体に relative をつける手もありますが、
                    // ここでは nameBar の中に absolute で配置します。
                    // nameBar に style="position:relative" を付与しておくと安全です
                    let myPName = players[myId].name;

                    // 1. 役職のHTML生成
                    let myRoleHtml = "";
                    if (roles[myId]) {
                        const rKey = roles[myId];
                        const rInfo = (typeof ROLE_INFO !== 'undefined') ? ROLE_INFO[rKey] : null;
                        const jpName = rInfo ? rInfo.jp : rKey;
                        const roleAttrClass = getRoleAttrClass(rKey);

                        // 使用済みは色を残しつつ減衰表示
                        const isUsed = currentAct[myId];
                        const usedClass = isUsed ? " used" : "";
                        myRoleHtml = `<span class="my-role-chip ${roleAttrClass}${usedClass}">【役職】${jpName}</span>`;
                    }

                    // ★修正: resetHolder ではなく effectiveResetHolder を使用して判定
                    let resetBadge = "";
                    if (effectiveResetHolder === myId) {
                        // status-resetクラスをそのまま利用（位置調整のためstyleを追加）
                        resetBadge = `<span class="status-reset my-reset-badge">RESET</span>`;
                    }

                    // 2. ホストなら★を表示
                    let hostIcon = (effectiveHostId === myId) ? "<span class='my-host-icon'>★</span>" : "";

                    // 3. 順位がついているなら表示
                    let rankText = (data.rankings && data.rankings[myId]) ? `<span class="my-rank-badge">🏆${data.rankings[myId]}位</span>` : "";

                    let bubbleHtml = `<div id="bubble-${myId}" class="chat-bubble bubble-pos-bottom"></div>`;

                    // ★全部まとめてセット！ (先頭に bubbleHtml を追加)
                    // ★変更: 自分の名前もクリックして履歴を見れるようにする
                    nameBar.innerHTML = `${bubbleHtml}${hostIcon}<span onclick="showPlayerLogs('${myId}')" class="my-name-link">${myPName}</span>${myRoleHtml}${resetBadge}${rankText}`;
                    renderCache.nameBarSig = nameBarSignature;
                    didPatchNameBar = true;
                }
            } else if (nameBar && renderCache.nameBarSig !== "") {
                nameBar.innerHTML = "";
                renderCache.nameBarSig = "";
                didPatchNameBar = true;
            }

            // 共通: ログ更新
            renderLogs(data.logs, { forceBubbleRefresh: didPatchOpponentArea || didPatchNameBar });

            // 音再生
            const soundData = data.lastSound;
            if (soundData && soundData.id !== prevSoundId) {
                if (Array.isArray(soundData.type)) {
                    soundData.type.forEach(t => playSoundEffect(t));
                } else {
                    playSoundEffect(soundData.type);
                }
                prevSoundId = soundData.id;
            }
            updateCounterHUD();
        }

        function getTotalHandCount(pid) {
            let h1 = (gameState.hands[pid] || []).length;
            let h2 = (gameState.hackedHands && gameState.hackedHands[pid]) ? gameState.hackedHands[pid].length : 0;
            return h1 + h2;
        }

        function viewGrave(type) {
            let list;
            let title;
            if (type === 'num') { list = gameState.graveNum; title = "数字墓地"; }
            else if (type === 'sym') { list = gameState.graveSym; title = "記号墓地"; }
            else if (type === 'excl') { list = gameState.exclusion; title = "除外場"; }

            if (!list || list.length === 0) return showInfoModal(title, "空です");
            
            let html = '<div class="modal-list">';
            list.slice().reverse().forEach(c => {
                html += renderCardView(c);
            });
            html += '</div>';
            openModal(title, html);
        }

        // --- Action Logic ---
