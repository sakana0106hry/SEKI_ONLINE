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
        async function execInitGame(fixedNumCount, fixedRoleGroups) {
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
                const requestedRoleGroups = (fixedRoleGroups === undefined)
                    ? [...ROLE_DRAFT_GROUP_ORDER]
                    : fixedRoleGroups;
                if (!Array.isArray(requestedRoleGroups)) {
                    console.error("[init] 無効な役職属性指定を検知したため開始を中止しました。", requestedRoleGroups);
                    showInfoModal("エラー", "役職属性の指定形式が不正なため、開始を中止しました。");
                    return;
                }
                const invalidRoleGroups = requestedRoleGroups.filter(groupKey => !ROLE_DRAFT_GROUP_ORDER.includes(groupKey));
                if (invalidRoleGroups.length > 0) {
                    console.error("[init] 未定義の役職属性を検知したため開始を中止しました。", invalidRoleGroups);
                    showInfoModal("エラー", `未定義の役職属性(${invalidRoleGroups.join(", ")})が指定されたため、開始を中止しました。`);
                    return;
                }
                const enabledRoleGroups = ROLE_DRAFT_GROUP_ORDER.filter(groupKey => requestedRoleGroups.includes(groupKey));

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

                const roleDraftChoices = buildRoleDraftChoices(playerIds, enabledRoleGroups);
                const now = Date.now();
                const roleModeLabel = (enabledRoleGroups.length > 0)
                    ? enabledRoleGroups.map(groupKey => getRoleGroupLabel(groupKey)).join(" / ")
                    : "なし（役職なしモード）";
                const rolePhaseStartLog = (enabledRoleGroups.length > 0)
                    ? "役職選択フェーズを開始します"
                    : "役職なしモードを開始します";

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
                        selectedGroups: {},
                        enabledGroups: [...enabledRoleGroups]
                    },
                    roleDraft: {
                        order: playerIds,
                        groupOrder: [...enabledRoleGroups],
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
                        {text: `ゲーム開始！(数字${numCount}枚モード / 役職:${roleModeLabel})`, type: "public", timestamp: now},
                        {text: rolePhaseStartLog, type: "public", timestamp: now + 1}
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
