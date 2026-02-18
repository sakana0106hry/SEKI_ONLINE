/* --- ★追加: 演出受信リスナー --- */
function setupEffectListener() {
    // DBの 'effect' ノードを監視
    db.ref(`rooms/${currentRoom}/effect`).on('value', (snapshot) => {
        let data = snapshot.val();
        if (!data) return;

        // タイムスタンプが古すぎる(5秒以上前)なら無視 (リロード時の暴発防止)
        const ts = Number(data.timestamp);
        if (Number.isFinite(ts) && Date.now() - ts > 5000) return;

        const cardValForId = (data.cardVal !== undefined && data.cardVal !== null) ? data.cardVal : "-";
        const effectId = (data.effectId !== undefined && data.effectId !== null)
            ? String(data.effectId)
            : `${Number.isFinite(ts) ? ts : 0}:${data.guessType || "-"}:${cardValForId}`;
        if (effectId === lastProcessedEffectId) return;
        lastProcessedEffectId = effectId;

        const delayRaw = Number(data.showDelayMs);
        const showDelayMs = Number.isFinite(delayRaw) ? Math.max(0, delayRaw) : 0;

        clearTimeout(gamblerEffectStartTimer);
        gamblerEffectStartTimer = null;
        cancelGamblerVisualPlayback();

        gamblerEffectStartTimer = setTimeout(() => {
            gamblerEffectStartTimer = null;
            showVisualEffect(data);
        }, showDelayMs);
    });
}
// ★新設: ホスト設定メニューを開く
        // ↓↓↓ openHostSettings関数をこれに置き換えてください ↓↓↓
        function openHostSettings() {
            const checkNormal = (lastHostGameMode === "normal") ? "checked" : "";
            const checkShort = (lastHostGameMode === "short") ? "checked" : "";
            const checkDuel = (lastHostGameMode === "duel") ? "checked" : "";
            const selectedGroupSet = new Set(Array.isArray(lastHostRoleGroups) ? lastHostRoleGroups : []);
            const roleGroupItems = ROLE_DRAFT_GROUP_ORDER.map(groupKey => {
                const groupMeta = ROLE_GROUP_META[groupKey] || {};
                const checked = selectedGroupSet.has(groupKey) ? "checked" : "";
                return `
                        <label class="seki-host-mode-item seki-host-role-item ${groupMeta.cssClass || ""}">
                            <input type="checkbox" name="roleGroup" value="${groupKey}" ${checked}>
                            <div>
                                <span class="seki-host-mode-title">${groupMeta.label || groupKey}</span>
                                <span class="seki-host-mode-meta">― 属性を有効化</span>
                            </div>
                        </label>
                `;
            }).join("");

            let html = `
                <div class="seki-host-settings">
                    <div class="seki-host-mode-box">
                        <label class="seki-host-mode-item">
                            <input type="radio" name="gameMode" value="normal" ${checkNormal}>
                            <div>
                                <span class="seki-host-mode-title">通常モード (6枚)</span>
                                <span class="seki-host-mode-meta">― 数字6 + 記号2</span>
                            </div>
                        </label>
                        <label class="seki-host-mode-item">
                            <input type="radio" name="gameMode" value="short" ${checkShort}>
                            <div>
                                <span class="seki-host-mode-title hot">短期決戦モード (4枚)</span>
                                <span class="seki-host-mode-meta">― 数字4 + 記号2</span>
                            </div>
                        </label>
                        <label class="seki-host-mode-item">
                            <input type="radio" name="gameMode" value="duel" ${checkDuel}>
                            <div>
                                <span class="seki-host-mode-title">デュエルモード (2人専用)</span>
                                <span class="seki-host-mode-meta">― 数字0-9の10+好きな記号3</span>
                            </div>
                        </label>
                    </div>

                    <div class="seki-host-mode-box">
                        <div class="seki-host-mode-title">役職属性</div>
                        ${roleGroupItems}
                        <div class="seki-host-mode-meta seki-host-role-note">※全てOFFで役職なしモード（演出のみ）</div>
                    </div>
                    
                    <div class="seki-host-actions">
                        <button onclick="confirmInitGameWithSettings()" class="modal-btn primary">
                            START / RESET
                        </button>
                        <button onclick="confirmCloseRoom()" class="modal-btn danger">
                            END
                        </button>
                    </div>
                </div>
            `;
            openModal("ホスト設定", html, { tone: "guide" });
        }

        // ★新設: 設定値を読み取って開始確認へ
        function confirmInitGameWithSettings() {
            const modeEls = document.getElementsByName('gameMode');
            for (let el of modeEls) {
                if (el.checked) lastHostGameMode = String(el.value || "normal");
            }
            const validModes = ["normal", "short", "duel"];
            if (!validModes.includes(lastHostGameMode)) {
                console.error("[host-settings] 無効なゲームモードを検知したため開始確認を停止します。", lastHostGameMode);
                showInfoModal("エラー", "ゲームモードの指定が不正なため、開始確認を中止しました。");
                return;
            }
            const selectedGroups = [];
            const roleEls = document.getElementsByName('roleGroup');
            for (let el of roleEls) {
                if (el.checked) selectedGroups.push(el.value);
            }
            lastHostRoleGroups = ROLE_DRAFT_GROUP_ORDER.filter(groupKey => selectedGroups.includes(groupKey));

            const roleModeText = (lastHostRoleGroups.length > 0)
                ? `有効属性: ${lastHostRoleGroups.map(groupKey => getRoleGroupLabel(groupKey)).join(" / ")}`
                : "有効属性: なし（役職なしモード）";
            const modeLabelMap = {
                normal: "通常モード (数字6 + 記号2)",
                short: "短期決戦モード (数字4 + 記号2)",
                duel: "デュエルモード (2人専用 / 数字10+記号3)"
            };
            const selectedModeLabel = modeLabelMap[lastHostGameMode] || "通常モード";
            const modeArg = `'${String(lastHostGameMode).replace(/'/g, "\\'")}'`;
            const roleGroupsArg = `[${lastHostRoleGroups.map(groupKey => `'${String(groupKey).replace(/'/g, "\\'")}'`).join(",")}]`;

            // 確認画面へ切り替え
            els.mTitle.innerText = "開始確認";
            els.mContent.innerHTML = `
                <p><strong>${selectedModeLabel}</strong> / <strong>${roleModeText}</strong><br>ゲームを開始（リセット）しますか？</p>
            `;
            els.mFooter.innerHTML = `
                ${renderModalButton(getModalActionLabel("yes"), `closeModal(); execInitGame(${modeArg}, ${roleGroupsArg})`, "primary")}
                ${renderModalButton(getModalActionLabel("no"), "openHostSettings()", "ghost")}
            `;
        }

        /* ===============================================
           iPhone対策: タブ切り替え後のオーディオ復活処理
           =============================================== */
        
        // 1. ページが再び「見える状態」になったら起こす
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                checkAndResumeAudio();
            }
        });

        // 2. 画面をタッチしたときも念のため起こす
        document.addEventListener('touchstart', function() {
            checkAndResumeAudio();
        }, { passive: true }); // passive: true はスクロール性能への配慮

        // オーディオの状態を確認して、死んでたら再開させる関数
        function checkAndResumeAudio() {
            if (!audioCtx) return;

            // 'suspended' (一時停止) や 'interrupted' (割り込み停止) なら再開
            if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
                audioCtx.resume().then(() => {
                    console.log("AudioContext Resumed by User Action/Visibility");
                }).catch(e => {
                    console.log("AudioContext Resume Failed", e);
                });
            }
        }

        function buildRoleGuideHtml() {
            let html = '<div class="font-readable seki-guide-root">';
            const publicUnusedRoles = (gameState && gameState.publicRoleInfo && Array.isArray(gameState.publicRoleInfo.unselectedRoles))
                ? new Set(gameState.publicRoleInfo.unselectedRoles)
                : new Set();

            Object.keys(ROLE_GROUPS).forEach(groupKey => {
                const groupRoles = ROLE_GROUPS[groupKey] || [];
                const groupMeta = ROLE_GROUP_META[groupKey] || {};
                const groupClass = groupMeta.cssClass || "";

                html += `
                    <section class="seki-guide-role-group ${groupClass}">
                        <h4 class="seki-guide-group-title">${groupMeta.label || groupKey}</h4>`;

                groupRoles.forEach(key => {
                    const info = ROLE_INFO[key];
                    if (!info) return;

                    let imgHtml = "";
                    if (typeof ROLE_IMAGES !== 'undefined' && ROLE_IMAGES[key]) {
                        imgHtml = `<img src="${ROLE_IMAGES[key]}" class="seki-guide-role-img">`;
                    }
                    const isPublicUnused = publicUnusedRoles.has(key);
                    const itemClass = isPublicUnused ? "is-public-unused" : "";
                    const publicTag = isPublicUnused ? `<span class="seki-guide-public-tag">不在</span>` : "";

                    html += `
                        <details class="seki-guide-role-item ${groupClass} ${itemClass}">
                            <summary class="seki-guide-summary">
                                ${imgHtml}
                                <div class="seki-guide-role-main">
                                    <div class="seki-guide-role-jp">
                                        ${info.jp}
                                        <span class="seki-guide-role-en">${getRoleDisplayCode(key)}</span>
                                        ${publicTag}
                                    </div>
                                    <div class="seki-guide-role-summary">
                                        <div>${info.summary}</div>
                                        <span class="seki-guide-hint">▼詳細</span>
                                    </div>
                                </div>
                            </summary>
                            <div class="seki-guide-role-detail">${info.desc}</div>
                        </details>`;
                });

                html += `</section>`;
            });

            html += "</div>";
            return html;
        }

        function buildRuleGuideHtml() {
            return `
                <div class="font-readable seki-rule-root">
                    <h4 class="seki-rule-heading">基本ルール</h4>
                    <p class="seki-rule-paragraph">・順に回ってくるターンで、手札を先に0枚にした人が勝ち！<br />・自分のターンでは以下から<strong>1つ</strong>の行動ができる<br />　　1. 手札から<span style="color: #3598db;"><strong>数字カード</strong></span>を数字墓地に出す（前の人より<strong>強いカード</strong>を出せる）<br />　　2. 手札から<span style="color: #e03e2d;"><strong>記号カード</strong></span>を使う<br />　　3. 一度きりの<span style="color: #843fa1;"><strong>役職能力</strong></span>を使う（詳しい説明は<strong><span style="color: #843fa1;">【役職】</span></strong>を参照）<br />　　4. <span style="color: #e67e23;"><strong>パス</strong></span>をして自分のターンを流す（パスの詳細は下部へ）</p>
                    <p class="seki-rule-paragraph">&nbsp;</p>
                    <h4 class="seki-rule-heading danger">記号カード</h4>
                    <ul class="seki-rule-list">
                    <li><strong>REVERSE</strong>（4枚）: <strong><span style="color: #3598db;">数字カード</span></strong>の強弱を逆転させる</li>
                    <li><strong>TRADE</strong>（4枚）: 好きな手札1枚を他のプレイヤーと交換する</li>
                    <li><strong>DIG UP</strong>（4枚）: 数字墓地の1番上のカードと、手札の<strong><span style="color: #3598db;">数字カード</span></strong>を交換する</li>
                    <li><strong>DISCARD</strong>（<strong><span style="color: #e03e2d;">1</span>枚</strong>）: 好きな<strong><span style="color: #3598db;">数字カード</span></strong>を1枚捨てる</li>
                    </ul>
                    <p>&nbsp;</p>
                    <h4 class="seki-rule-heading info">数字カード</h4>
                    <p class="seki-rule-paragraph">・数字カードは0~9まで各4枚ずつ<br /><strong>・「0」はいつでも出せるが、その上に何でも出せる！</strong><br /><strong>　🔵 順行🐘 (通常):</strong><br />　　0 &lt; 1 &lt; 2 &lt; 3 &lt; 4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9<br /><strong>　🔴 逆行🐁 (REVERSE中):</strong><br />　　0 &lt; 9 &lt; 8 &lt; 7 &lt; 6 &lt; 5 &lt; 4 &lt; 3 &lt; 2 &lt; 1</p>
                    <p class="seki-rule-paragraph">&nbsp;</p>
                    <h4 class="seki-rule-heading warn">パスとリセット</h4>
                    <p class="seki-rule-paragraph">・<strong>パス</strong>では、数字カードを1枚引いても良い<br />　&rArr;その際、出せるなら出しても良い！</p>
                    <p class="seki-rule-paragraph"><strong>【リセットとは】</strong></p>
                    <ul class="seki-rule-list">
                    <li>数字墓地の一番上のカードを出したプレイヤーは<strong>リセット権</strong>を持つ<br />
                    <li><strong>リセット権</strong>を持っているプレイヤーがパスすると、数字墓地のカードが全て除外され、何でも出せる<br />
                    <li><strong>リセット権</strong>は、<strong>RESET</strong>で表示されている</li>
                    <li><strong>リセット権</strong>を持ったプレイヤーがあがった場合、<span style="text-decoration: underline;">数字墓地の一番上のカードが変わらない限り、一周後に次のプレイヤーに移動する</span></li>
                    </ul>
                    <p class="seki-rule-paragraph">&nbsp;</p>
                    <h4 class="seki-rule-heading danger">🚫禁止事項🚫</h4>
                    <ul class="seki-rule-list">
                    <li><strong>記号あがり</strong>: 手札の最後の1枚が記号カードのとき、それを使って0枚にはできない</li>
                    </ul>
                    <ul class="seki-rule-list">
                    <li><strong>0あがり</strong>: 手札の最後の1枚が0のとき、0を出して0枚にすることはできない</li>
                    </ul>
                </div>
            `;
        }

        function openGuide(kind, surface = "main") {
            let title = "";
            let html = "";

            if (kind === "role") {
                title = "👥役職一覧";
                html = buildRoleGuideHtml();
            } else if (kind === "rule") {
                title = "📖ルール";
                html = buildRuleGuideHtml();
            } else {
                return;
            }

            if (surface === "sub" && typeof openSubModal === "function") {
                openSubModal(title, html);
                return;
            }

            openModal(title, html, { size: "wide", tone: "guide" });
        }

        function showRoleList() { openGuide("role", "main"); }
        function showRule() { openGuide("rule", "main"); }

        // --- ★追加: プレイヤー別ログ表示機能 ---
        function showPlayerLogs(targetId) {
            if (!gameState || !gameState.logs) return showInfoModal("履歴なし", "まだ記録がありません。");
            if (!gameState.players[targetId]) return;

            const targetName = gameState.players[targetId].name;
            const logs = gameState.logs;
            
            // フィルタリング: typeがpublicで、テキストにその人の名前が含まれるもの
            const filtered = logs.filter(l => 
                l.type === 'public' && l.text.includes(targetName)
            );

            if (filtered.length === 0) return showInfoModal(targetName + "の履歴", "表示できる行動履歴がありません。");

            let html = `<div class="seki-scroll-panel">`;
            
            // 新しい順に表示
            [...filtered].reverse().forEach(l => {
                let time = new Date(l.timestamp).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'});
                html += `
                    <div class="seki-log-line">
                        <span class="seki-log-time">${time}</span>
                        <span class="seki-log-text">${l.text}</span>
                    </div>
                `;
            });
            
            html += `</div>`;
            openModal(`${targetName} の行動履歴`, html, { size: "default", tone: "guide" });
        }

        const MATCH_HISTORY_LIMIT = 20;
        const FINISH_METHOD_LABELS = Object.freeze({
            NUMERIC: "数字カード",
            GAMBLER: "賭博師",
            ALCHEMIST: "錬金術師",
            DISCARD: "DISCARD"
        });

        function getFinishMethodLabel(methodKey) {
            if (!methodKey) return "-";
            return FINISH_METHOD_LABELS[methodKey] || "-";
        }

        function buildWinAttrRatioBlock(matchHistory) {
            const methodOrder = ["NUMERIC", "GAMBLER", "ALCHEMIST", "DISCARD"];
            const methodCounts = {
                NUMERIC: 0,
                GAMBLER: 0,
                ALCHEMIST: 0,
                DISCARD: 0
            };
            let winnerCount = 0;

            (Array.isArray(matchHistory) ? matchHistory : []).forEach(entry => {
                if (!entry || typeof entry !== "object") return;
                const rankings = entry.rankings || {};
                const finishMethods = entry.finishMethods || {};

                const winnerPid = Object.keys(rankings).find(pid => Number(rankings[pid]) === 1);
                if (!winnerPid) return;

                const methodKey = finishMethods[winnerPid];
                if (!methodKey || !Object.prototype.hasOwnProperty.call(methodCounts, methodKey)) return;

                methodCounts[methodKey] += 1;
                winnerCount += 1;
            });

            if (winnerCount === 0) {
                return `<section class="seki-section info">
                            <div class="win-attr-title">上がり方の割合（1位）</div>
                            <div class="score-empty">まだ集計できるデータがありません</div>
                        </section>`;
            }

            let rowsHtml = "";
            methodOrder.forEach(methodKey => {
                const count = methodCounts[methodKey] || 0;
                const ratio = (count / winnerCount) * 100;
                rowsHtml += `
                    <div class="win-attr-row">
                        <div class="win-attr-label">${getFinishMethodLabel(methodKey)}</div>
                        <div class="win-attr-bar-wrap">
                            <div class="win-attr-bar" style="width:${ratio.toFixed(1)}%;"></div>
                        </div>
                        <div class="win-attr-value">${count}勝 (${ratio.toFixed(1)}%)</div>
                    </div>
                `;
            });

            return `<section class="seki-section info">
                        <div class="win-attr-title">上がり方の割合（1位）</div>
                        ${rowsHtml}
                    </section>`;
        }

        function buildWinnerRoleGroupRatioBlock(matchHistory) {
            const defaultGroups = ["STRATEGY", "EFFICIENCY", "KILLER"];
            const groupOrder = Array.isArray(ROLE_DRAFT_GROUP_ORDER) && ROLE_DRAFT_GROUP_ORDER.length > 0
                ? ROLE_DRAFT_GROUP_ORDER.filter(groupKey => defaultGroups.includes(groupKey))
                : defaultGroups;
            const groupThemeClassMap = {
                STRATEGY: "attr-s",
                EFFICIENCY: "attr-e",
                KILLER: "attr-k"
            };

            const groupCounts = {};
            groupOrder.forEach(groupKey => { groupCounts[groupKey] = 0; });

            let winnerCount = 0;

            (Array.isArray(matchHistory) ? matchHistory : []).forEach(entry => {
                if (!entry || typeof entry !== "object") return;
                const rankings = entry.rankings || {};
                const roles = entry.roles || {};

                const winnerPid = Object.keys(rankings).find(pid => Number(rankings[pid]) === 1);
                if (!winnerPid) return;

                const winnerRoleKey = roles[winnerPid];
                if (!winnerRoleKey) return;

                const groupKey = (typeof getRoleGroup === "function") ? getRoleGroup(winnerRoleKey) : null;
                if (!groupKey || !Object.prototype.hasOwnProperty.call(groupCounts, groupKey)) return;

                groupCounts[groupKey] += 1;
                winnerCount += 1;
            });

            if (winnerCount === 0) {
                return `<section class="seki-section info">
                            <div class="win-attr-title">3属性の割合（1位の役職属性）</div>
                            <div class="score-empty">まだ集計できるデータがありません</div>
                        </section>`;
            }

            let stackedBarHtml = `<div class="attr-share-stack">`;
            let legendHtml = "";
            groupOrder.forEach(groupKey => {
                const count = groupCounts[groupKey] || 0;
                const ratio = (count / winnerCount) * 100;
                const groupLabel = (typeof getRoleGroupLabel === "function")
                    ? getRoleGroupLabel(groupKey)
                    : groupKey;
                const themeClass = groupThemeClassMap[groupKey] || "attr-s";

                if (ratio > 0) {
                    stackedBarHtml += `<div class="attr-share-segment ${themeClass}" style="width:${ratio.toFixed(1)}%;" title="${groupLabel} ${ratio.toFixed(1)}%"></div>`;
                }
                legendHtml += `
                    <div class="attr-share-legend-item">
                        <span class="attr-share-dot ${themeClass}"></span>
                        <span class="attr-share-label">${groupLabel}</span>
                        <span class="attr-share-value">${count}勝 (${ratio.toFixed(1)}%)</span>
                    </div>
                `;
            });
            stackedBarHtml += `</div>`;

            return `<section class="seki-section info">
                        <div class="win-attr-title">3属性の割合（1位の役職属性）</div>
                        ${stackedBarHtml}
                        <div class="attr-share-legend">${legendHtml}</div>
                    </section>`;
        }

        function buildMatchHistoryEntry(finalRankings, playerOrder, sourceState, finishedAt) {
            if (!finalRankings || typeof finalRankings !== "object") {
                console.warn("[score-history] 順位情報が不正なため履歴保存を停止します。", finalRankings);
                return null;
            }
            if (!Array.isArray(playerOrder) || playerOrder.length === 0) {
                console.warn("[score-history] 手番順情報が不正なため履歴保存を停止します。", playerOrder);
                return null;
            }
            if (!sourceState || typeof sourceState !== "object") {
                console.warn("[score-history] 試合状態が不正なため履歴保存を停止します。", sourceState);
                return null;
            }

            const players = sourceState.players || {};
            const roles = sourceState.roles || {};
            const finishMethods = sourceState.finishMethods || {};

            const rankingsSnapshot = {};
            const playerNameSnapshot = {};
            const roleSnapshot = {};
            const finishMethodSnapshot = {};

            for (const pid of playerOrder) {
                const rank = Number(finalRankings[pid]);
                if (!Number.isFinite(rank) || rank <= 0) {
                    console.warn("[score-history] 順位が不足しているため履歴保存を停止します。", { pid, rank: finalRankings[pid] });
                    return null;
                }

                const player = players[pid];
                if (!player || !player.name) {
                    console.warn("[score-history] プレイヤー名が不足しているため履歴保存を停止します。", { pid, player });
                    return null;
                }

                const roleKey = roles[pid];
                if (!roleKey) {
                    console.warn("[score-history] 役職情報が不足しているため履歴保存を停止します。", { pid, roleKey });
                    return null;
                }

                rankingsSnapshot[pid] = rank;
                playerNameSnapshot[pid] = player.name;
                roleSnapshot[pid] = roleKey;

                const finishMethod = finishMethods[pid];
                if (finishMethod) {
                    finishMethodSnapshot[pid] = finishMethod;
                }
            }

            const finishedAtNum = Number(finishedAt);
            return {
                finishedAt: Number.isFinite(finishedAtNum) ? finishedAtNum : Date.now(),
                playerOrder: [...playerOrder],
                rankings: rankingsSnapshot,
                players: playerNameSnapshot,
                roles: roleSnapshot,
                finishMethods: finishMethodSnapshot
            };
        }

        // --- スコア更新関数 ---
        async function updateFinalScores(finalRankings, playerOrder, options = {}) {
            if (!currentRoom) {
                console.warn("[score] ルーム未参加のためスコア更新を停止します。");
                return;
            }
            if (!finalRankings || typeof finalRankings !== "object") {
                console.warn("[score] 順位情報が不正なためスコア更新を停止します。", finalRankings);
                return;
            }
            if (!Array.isArray(playerOrder) || playerOrder.length === 0) {
                console.warn("[score] 手番順情報が不正なためスコア更新を停止します。", playerOrder);
                return;
            }

            const sourceState = (options && typeof options.sourceState === "object" && options.sourceState)
                ? options.sourceState
                : gameState;
            const finishedAtRaw = Number(options && options.finishedAt);
            const finishedAt = Number.isFinite(finishedAtRaw) ? finishedAtRaw : Date.now();

            await db.ref(`rooms/${currentRoom}`).transaction((state) => {
                if (!state || typeof state !== "object") {
                    console.warn("[score] 部屋データが存在しないためスコア更新を停止します。");
                    return state;
                }

                const totalPlayers = playerOrder.length;
                const nextScores = { ...(state.scores || {}) };

                playerOrder.forEach(pid => {
                    const rank = Number(finalRankings[pid]);
                    if (!Number.isFinite(rank) || rank <= 0) return;

                    // スコア計算式: 2 * (人数 - 順位) + 1
                    const roundPoint = 2 * (totalPlayers - rank) + 1;
                    const oldScore = Number(nextScores[pid]) || 0;
                    nextScores[pid] = oldScore + roundPoint;
                });
                state.scores = nextScores;

                const historyEntry = buildMatchHistoryEntry(finalRankings, playerOrder, sourceState, finishedAt);
                if (!historyEntry) {
                    console.warn("[score-history] 必須情報不足のため履歴保存を停止します。");
                    return state;
                }

                const nextHistory = Array.isArray(state.matchHistory) ? [...state.matchHistory] : [];
                nextHistory.push(historyEntry);
                if (nextHistory.length > MATCH_HISTORY_LIMIT) {
                    nextHistory.splice(0, nextHistory.length - MATCH_HISTORY_LIMIT);
                }
                state.matchHistory = nextHistory;

                return state;
            });
        }

        function showMatchHistory() {
            if (!gameState) return;
            const matchHistory = Array.isArray(gameState.matchHistory) ? [...gameState.matchHistory] : [];
            if (matchHistory.length === 0) return showInfoModal("試合履歴", "まだ記録がありません。");

            matchHistory.sort((a, b) => {
                const tsA = Number(a && a.finishedAt) || 0;
                const tsB = Number(b && b.finishedAt) || 0;
                return tsB - tsA;
            });

            let html = `<div class="seki-scroll-panel">`;
            html += buildWinAttrRatioBlock(matchHistory);
            html += buildWinnerRoleGroupRatioBlock(matchHistory);

            matchHistory.forEach((entry, idx) => {
                if (!entry || !Array.isArray(entry.playerOrder)) return;

                const entryOrder = [...entry.playerOrder];
                const entryRankings = entry.rankings || {};
                const entryPlayers = entry.players || {};
                const entryRoles = entry.roles || {};
                const entryFinishMethods = entry.finishMethods || {};
                const totalPlayers = entryOrder.length;

                const finishedAtNum = Number(entry.finishedAt);
                const finishedAtText = Number.isFinite(finishedAtNum)
                    ? new Date(finishedAtNum).toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    })
                    : "-";

                const rankedPids = [...entryOrder].sort((a, b) => {
                    const rankA = Number(entryRankings[a]) || 999;
                    const rankB = Number(entryRankings[b]) || 999;
                    if (rankA === rankB) return String(a).localeCompare(String(b));
                    return rankA - rankB;
                });

                html += `
                    <section class="seki-section info">
                        <div class="seki-log-line">
                            <span class="seki-log-time">MATCH ${idx + 1}</span>
                            <span class="seki-log-text">終了時刻: ${finishedAtText}</span>
                        </div>
                        <table class="score-table">
                            <tr class="score-head">
                                <th>順位</th>
                                <th>名 前</th>
                                <th>役 職</th>
                                <th>上がり方</th>
                            </tr>`;

                rankedPids.forEach(pid => {
                    const rank = Number(entryRankings[pid]) || "-";
                    const name = entryPlayers[pid] || "不明なユーザー";
                    const roleName = getRoleDisplayName(entryRoles[pid]);
                    const finishMethod = (rank === totalPlayers)
                        ? "-"
                        : getFinishMethodLabel(entryFinishMethods[pid]);

                    html += `
                            <tr class="score-row">
                                <td class="score-name-cell">${rank}</td>
                                <td class="score-name-cell">${name}</td>
                                <td class="score-name-cell">${roleName || "-"}</td>
                                <td class="score-point-cell">${finishMethod}</td>
                            </tr>`;
                });

                html += `
                        </table>
                    </section>`;
            });

            html += `</div>`;
            openModal("📜 試合履歴", html, { size: "wide", tone: "guide" });
        }

        // --- スコアボード表示関数 ---
        function showScoreboard() {
            if (!gameState) return;
            let scores = gameState.scores || {};
            let players = gameState.players || {};

            // 現在の参加人数を取得（ゲーム開始前なら現在のプレイヤー数を使用）
            let playerOrder = gameState.playerOrder || Object.keys(players);
            let totalPlayers = playerOrder.length;

            // 1. 点数配分のテキストを作成
            let distributionText = "";
            if (totalPlayers >= 2) {
                let distArray = [];
                for (let r = 1; r <= totalPlayers; r++) {
                    let pts = 2 * (totalPlayers - r) + 1;
                    distArray.push(`${r}位:${pts}pt`);
                }
                distributionText = `<div class="score-dist">
                    現在の配分 (${totalPlayers}人戦): ${distArray.join(' / ')}
                </div>`;
            }

            // スコア順にソート
            let sortedPids = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

            // 2. HTMLの組み立て
            let html = distributionText; // タイトルのすぐ下に配分を表示

            html += `<table class="score-table">
                        <tr class="score-head">
                            <th>名 前</th>
                            <th>合計点数</th>
                        </tr>`;

            if (sortedPids.length === 0) {
                html += `<tr><td colspan="2" class="score-empty">まだ記録がありません</td></tr>`;
            }

            sortedPids.forEach(pid => {
                let pName = players[pid] ? players[pid].name : "不明なユーザー";
                let score = scores[pid];
                let rowClass = (pid === myId) ? "score-row me" : "score-row";
                html += `<tr class="${rowClass}">
                            <td class="score-name-cell">${pName}</td>
                            <td class="score-point-cell">${score} pt</td>
                        </tr>`;
            });
            html += `</table>`;

            html += `<div class="score-reset-wrap">
                        <button onclick="showMatchHistory()" class="score-reset-btn score-history-btn">試合履歴を閲覧</button>
                    </div>`;
            
            // ホストのみスコアリセットボタンを表示
            let hostId = getEffectiveHostId(gameState);

            if (myId === hostId) {
                html += `<div class="score-reset-wrap">
                            <button onclick="confirmResetScores()" class="score-reset-btn">スコアと履歴をリセット</button>
                        </div>`;
            }

            openModal("🏆 総合ランキング", html, { tone: "guide" });
        }

        // スコアリセット用（ホスト用）
        function confirmResetScores() {
            showConfirmModal("スコアリセット", "部屋全体の累積スコアと試合履歴を消去しますか？", "execResetScoresAndHistory()");
        }

        async function execResetScoresAndHistory() {
            if (!currentRoom) {
                console.warn("[score] ルーム未参加のためリセットを停止します。");
                return;
            }

            try {
                const updates = {};
                updates[`rooms/${currentRoom}/scores`] = null;
                updates[`rooms/${currentRoom}/matchHistory`] = null;
                await db.ref().update(updates);
            } catch (e) {
                console.error("[score] スコア・履歴リセットに失敗しました。", e);
                showInfoModal("エラー", `リセット失敗: ${e.message}`);
            }
        }

        // 1. 共通のホスト判定関数（これを一度作っておけば、どこでも使えます）
