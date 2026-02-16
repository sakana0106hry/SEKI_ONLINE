    /* --- カウンティングロジック (改修版) --- */
    
    // カードの初期枚数定義
    const INITIAL_COUNTS = {
        // 数字 (各4枚)
        0:4, 1:4, 2:4, 3:4, 4:4, 5:4, 6:4, 7:4, 8:4, 9:4,
        // 記号
        "REVERSE": 4,
        "TRADE": 4,
        "DIG UP": 4,
        "DISCARD": 1
    };

    // パネル開閉関数
    window.toggleCounterHUD = function() {
        const panel = document.getElementById("counter-panel");
        if(panel) {
            panel.classList.toggle("active");
            updateCounterHUD(); // 開いた瞬間に更新
        }
    };

    // カウント更新関数（メインロジック）
    function updateCounterHUD() {
        const wrapper = document.getElementById("counter-hud-wrapper");
        
        // ★重要: ゲームに参加していない（ログイン画面）ときは隠す
        // gameStateがない、または myId がない場合は非表示にして終了
        if (typeof gameState === 'undefined' || !gameState || typeof myId === 'undefined' || !myId) {
            if(wrapper) wrapper.classList.add("hidden");
            counterHudCache.signature = "";
            counterHudCache.numHtml = "";
            counterHudCache.symHtml = "";
            counterHudCache.roleHtml = "";
            return;
        }

        // ゲーム中なら表示する
        if(wrapper && wrapper.classList.contains("hidden")) {
            wrapper.classList.remove("hidden");
        }

        // ★修正ポイント: 手札の取得方法を変更
        // 以前の currentHand は更新されていない場合があるため、
        // 確実な gameState.hands[myId] から取得します。
        let myHandRef = [];
        // myId が定義されているか念のためチェック
        if (typeof myId !== 'undefined' && gameState.hands && gameState.hands[myId]) {
            myHandRef = gameState.hands[myId];
        }
        const hudSignature = buildRenderSignature({
            myId,
            status: gameState.status || "",
            myHandRef,
            graveNum: gameState.graveNum || [],
            graveSym: gameState.graveSym || [],
            exclusion: gameState.exclusion || [],
            removed: gameState.removed || [],
            roleDraft: gameState.roleDraft || null,
            roles: gameState.roles || {},
            publicRoleInfo: gameState.publicRoleInfo || {},
            activatedList: gameState.activatedList || {},
            revealedRoles: gameState.revealedRoles || {},
            rankings: gameState.rankings || {},
            playerOrder: gameState.playerOrder || []
        });
        if (counterHudCache.signature === hudSignature) return;
        counterHudCache.signature = hudSignature;

        // 1. カウント用オブジェクトを初期化（コピー）
        let remaining = Object.assign({}, INITIAL_COUNTS);

        // 2. 「見えているカード」を減算するヘルパー関数
        const subtractVisible = (cardList) => {
            if (!cardList || !Array.isArray(cardList)) return;
            cardList.forEach(c => {
                if (!c || c.val === undefined) return;

                // ★重要: 錬金術師によって生成されたカード(isAlchemy=true)は
                // 「本来の山札の枚数」ではないため、カウントから除外しない（無視する）。
                if (c.isAlchemy) return;

                if (remaining[c.val] !== undefined) {
                    remaining[c.val]--;
                }
            });
        };

        // 3. 各場所から減算 (gameStateのキー名に注意)
        subtractVisible(myHandRef);                // 自分の手札（これで正しく引かれます！）
        subtractVisible(gameState.graveNum);       // 数字墓地
        subtractVisible(gameState.graveSym);       // 記号墓地
        
        // ★除外エリアの対応
        // コード解析の結果、gameState.exclusion に格納されていることが判明
        if (gameState.exclusion) subtractVisible(gameState.exclusion);
        
        // 念のため removed もチェック (古いバージョン対策)
        if (gameState.removed) subtractVisible(gameState.removed);


        // 4. HTMLへの描画（数字）
        const gridNum = document.getElementById("hud-grid-num");
        if(gridNum) {
            let html = "";
            for (let i = 0; i <= 9; i++) {
                let count = remaining[i];
                if (count < 0) count = 0; // エラー防止
                let cls = count === 0 ? "zero" : (count >= 3 ? "rich" : "");
                html += `
                    <div class="hud-item ${cls}">
                        <span class="hud-val">${i}</span>
                        <span class="hud-count" style="color:${getColorForCount(count)}">${count}</span>
                    </div>
                `;
            }
            if (counterHudCache.numHtml !== html) {
                gridNum.innerHTML = html;
                counterHudCache.numHtml = html;
            }
        }

        // 5. HTMLへの描画（記号）
        const gridSym = document.getElementById("hud-grid-sym");
        if(gridSym) {
            const syms = [
                {k: "REVERSE", l:"REVERSE", c:"sym-rev"},
                {k: "TRADE",   l:"TRADE", c:"sym-tra"},
                {k: "DIG UP",  l:"DIG UP", c:"sym-dig"},
                {k: "DISCARD", l:"DISCARD", c:"sym-dis"}
            ];
            let html = "";
            syms.forEach(s => {
                let count = remaining[s.k];
                if (count < 0) count = 0;
                let cls = count === 0 ? "zero" : "";
                html += `
                    <div class="hud-item ${s.c} ${cls}">
                        <span class="hud-val">${s.l}</span>
                        <span class="hud-count">${count}</span>
                    </div>
                `;
            });
            if (counterHudCache.symHtml !== html) {
                gridSym.innerHTML = html;
                counterHudCache.symHtml = html;
            }
        }

        const gridRole = document.getElementById("hud-grid-role");
        if (gridRole) {
            const publicRoleInfo = gameState.publicRoleInfo || {};
            const publicUnused = Array.isArray(publicRoleInfo.unselectedRoles)
                ? publicRoleInfo.unselectedRoles
                : [];
            const publicUnusedSet = new Set(publicUnused);

            const roleDraft = gameState.roleDraft || null;
            const savedRoles = gameState.roles || {};
            const draftSelectedRoles = (roleDraft && roleDraft.selectedRoles) ? roleDraft.selectedRoles : {};
            const resolvedRoles = (gameState.status === "role_selecting")
                ? { ...savedRoles, ...draftSelectedRoles }
                : savedRoles;
            const selectedGroupMap = {
                ...((roleDraft && roleDraft.selectedGroups) ? roleDraft.selectedGroups : {}),
                ...((publicRoleInfo && publicRoleInfo.selectedGroups) ? publicRoleInfo.selectedGroups : {})
            };

            const myRoleKey = resolvedRoles[myId] || null;
            const activatedList = gameState.activatedList || {};
            const revealedRoles = gameState.revealedRoles || {};
            const rankings = gameState.rankings || {};
            const orderedPlayerIds = Array.isArray(gameState.playerOrder) ? gameState.playerOrder : [];
            const playerIds = new Set([
                ...orderedPlayerIds,
                ...Object.keys(gameState.players || {}),
                ...Object.keys(resolvedRoles)
            ]);
            const publicRevealedRoleSet = new Set();
            const hiddenOpponentGroupSet = new Set();
            let hiddenOpponentCount = 0;
            let hasUnknownHiddenGroup = false;
            playerIds.forEach(pid => {
                if (!pid || pid === myId) return;
                const isPublicRevealed = !!activatedList[pid] || !!rankings[pid] || !!revealedRoles[pid];
                const roleKey = resolvedRoles[pid];

                if (isPublicRevealed) {
                    if (roleKey) publicRevealedRoleSet.add(roleKey);
                    return;
                }

                hiddenOpponentCount++;
                const groupKey = selectedGroupMap[pid];
                if (groupKey) hiddenOpponentGroupSet.add(groupKey);
                else hasUnknownHiddenGroup = true;
            });

            const shouldFilterByHiddenGroups = hiddenOpponentCount > 0 && !hasUnknownHiddenGroup;

            const roleCandidates = sortRoleKeysForDisplay(
                ROLES.filter(roleKey => {
                    if (hiddenOpponentCount === 0) return false;
                    if (publicUnusedSet.has(roleKey)) return false;
                    if (myRoleKey && roleKey === myRoleKey) return false;
                    if (publicRevealedRoleSet.has(roleKey)) return false;
                    if (shouldFilterByHiddenGroups && !hiddenOpponentGroupSet.has(getRoleGroup(roleKey))) return false;
                    return true;
                })
            );

            if (roleCandidates.length === 0) {
                const roleHtml = `<div class="hud-loading">No Candidate Roles</div>`;
                if (counterHudCache.roleHtml !== roleHtml) {
                    gridRole.innerHTML = roleHtml;
                    counterHudCache.roleHtml = roleHtml;
                }
            } else {
                const roleHtml = roleCandidates.map(roleKey => {
                    const roleInfo = ROLE_INFO[roleKey];
                    const label = roleInfo ? `${roleInfo.jp} / ${getRoleDisplayCode(roleKey)}` : roleKey;
                    const attrClass = getRoleAttrClass(roleKey);
                    return `<div class="hud-role-pill ${attrClass}">${label}</div>`;
                }).join("");
                if (counterHudCache.roleHtml !== roleHtml) {
                    gridRole.innerHTML = roleHtml;
                    counterHudCache.roleHtml = roleHtml;
                }
            }
        }
    }

    // カウントの色分け（多いと緑、少ないと赤）
    function getColorForCount(n) {
        if (n === 0) return "#555";
        if (n === 1) return "#ff5252"; // 赤
        if (n === 2) return "#ffeb3b"; // 黄
        return "#69f0ae"; // 緑
    }

