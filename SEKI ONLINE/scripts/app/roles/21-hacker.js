/* --- HACKER (ハッカー) Ver 4.0 [隔離リスト方式] --- */

let hackerTargets = {}; 

// 1. 発動画面
function activateHacker() {
    hackerTargets = {}; 
    renderHackerUI();
}

function renderHackerUI() {
    let pIds = gameState.playerOrder;
    // ターゲット候補: 手札がある人
    let targets = pIds.filter(pid => 
        pid !== myId && 
        !gameState.rankings?.[pid] && 
        !isPoliticianShieldActive(pid) &&
        (gameState.hands[pid] || []).length > 0
    );
    let blockedTargets = pIds.filter(pid =>
        pid !== myId &&
        !gameState.rankings?.[pid] &&
        isPoliticianShieldActive(pid) &&
        (gameState.hands[pid] || []).length > 0
    );
    Object.keys(hackerTargets).forEach(pid => {
        if (!targets.includes(pid)) delete hackerTargets[pid];
    });

    let html = `
        <p><strong>システムへの侵入を開始します...</strong><br>
        対象プレイヤーの手札から<span style="color:#ef5350; font-weight:bold;">1枚ずつ</span>選び、
        ウイルス(ロック)を仕込んでください。
        </p>
        <div id="hacker-ui-container" style="text-align:left; max-height:300px; overflow-y:auto;">`;

    if (targets.length === 0) {
        html += `<p style="text-align:center; color:#9cb3c9;">ハッキング可能な相手がいません。</p>`;
    }
    if (blockedTargets.length > 0) {
        html += `<p class="seki-disabled-note" style="text-align:center;">※政治家の保護中プレイヤーは対象外です</p>`;
        blockedTargets.forEach(pid => {
            const p = gameState.players[pid];
            html += `<button class="modal-btn is-disabled" style="width:100%; margin:4px 0;" disabled>${p.name} (政治家で対象外)</button>`;
        });
    }

    targets.forEach(pid => {
        let p = gameState.players[pid];
        let hand = gameState.hands[pid] || [];
        
        let selectedIdx = hackerTargets[pid]; 

        html += `<div style="margin-bottom:10px; background:rgba(8,26,48,0.45); border:1px solid rgba(143,176,214,0.3); padding:8px; border-radius:5px;">
                    <div style="font-weight:bold; font-size:12px; margin-bottom:5px; color:#d9ebff;">
                        ${p.name} <span style="font-size:12px; color:#9cb3c9;">(手札:${hand.length})</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:4px;">`;
        
        hand.forEach((c, i) => {
            let isSel = (selectedIdx === i);
            let cssClass = `card ${c.type}`;
            if (isSel) cssClass += " target-hack";
            
            let style = "width:36px; height:54px; font-size:12px; cursor:pointer; transition:0.1s;";
            let content = "?";

            if (c.isOpen) {
                content = c.val;
                let cImg = CARD_IMAGES[c.val];
                if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:none;`;
            } else {
                style += "background:#455a64; color:#cfd8dc; border:1px solid #78909c;";
            }

            if (isSel) {
                style += "border:2px solid #ef5350 !important; transform:scale(1.1); box-shadow:0 0 8px #ef5350; opacity:1;";
            }

            html += `<div class="${cssClass}" style="${style}" onclick="selectHackerTarget('${pid}', ${i})">
                        ${content}
                     </div>`;
        });
        html += `</div></div>`;
    });

    html += `</div>`;
    
    let currentSelectCount = Object.keys(hackerTargets).length;
    let requiredCount = targets.length;
    let canExec = (currentSelectCount === requiredCount && requiredCount > 0);

    html += `<div style="text-align:center; margin-top:10px;">
                <p style="font-size:12px; color:${canExec ? '#7dffc0' : '#ff9fb3'}; margin-bottom:5px;">
                    選択状況: ${currentSelectCount} / ${requiredCount} 人
                </p>
                <button onclick="execHacker()" ${canExec ? '' : 'disabled'} 
                style="background:${canExec ? '#a61f3a' : '#4f5966'}; color:#eff6ff; padding:10px 30px; font-weight:bold; border:1px solid rgba(143,176,214,0.4); border-radius:20px; transition:0.3s;">
                ウイルス送信
                </button>
             </div>`;

    openModal("ハッカー: 標的選択", html);
    document.getElementById("modal-footer").innerHTML = renderModalButton(getModalActionLabel("cancel"), "closeModal()", "ghost");
}

function selectHackerTarget(targetId, idx) {
    hackerTargets[targetId] = idx;
    renderHackerUI();
}

// 3. 実行処理 (手札からhackedHandsへ移動)
async function execHacker() {
    const blockedId = Object.keys(hackerTargets).find(pid => isPoliticianShieldActive(pid));
    if (blockedId) return;
    closeModal();
    let updates = {};
    
    // 現在の隔離リストを取得
    let currentHackedHands = deepCopy(gameState.hackedHands || {});

    Object.keys(hackerTargets).forEach(pid => {
        let idx = hackerTargets[pid];
        let hand = deepCopy(gameState.hands[pid] || []);
        
        if (hand[idx]) {
            // 1. 手札から抜く
            let targetCard = hand.splice(idx, 1)[0];
            
            // 2. IDを刻印
            targetCard.hackedBy = myId;
            
            // ★修正: 番号ではなく「時間」を記録する
            targetCard.hackedAt = Date.now();
            
            // 3. 隔離リストへ追加
            if (!currentHackedHands[pid]) currentHackedHands[pid] = [];
            currentHackedHands[pid].push(targetCard);
            
            // 4. DB更新準備
            updates[`rooms/${currentRoom}/hands/${pid}`] = hand;
        }
    });

    updates[`rooms/${currentRoom}/hackedHands`] = currentHackedHands;

    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    // 音は activatedList の変化をトリガーにカットイン側で再生する（重複再生防止）
    await pushLog(`${myName}が[ハッカー]を発動！システムをハッキングしました`, 'public');

    // ★削除: 以下の3行を削除（またはコメントアウト）してください！
    // ハッカーは能力使用後も自分のターンが続くルールです。
    /*
    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;
    */

    await db.ref().update(updates);
}

async function checkHackerCleanup() {
    if (!gameState || !gameState.hackedHands) return;
    
    // 自分のターンが来た時のみチェック
    if (isMyTurn()) {
        let updates = {};
        let needsUpdate = false;
        let currentHackedHands = deepCopy(gameState.hackedHands);

        // ★追加: 最後の「ゲームの動き(publicログ)」があった時間を取得
        let lastLogTime = 0;
        if (gameState.logs) {
            for (let i = gameState.logs.length - 1; i >= 0; i--) {
                if (gameState.logs[i].type === 'public') {
                    lastLogTime = gameState.logs[i].timestamp || 0;
                    break;
                }
            }
        }
        
        Object.keys(currentHackedHands).forEach(pid => {
            if (!gameState.players[pid]) {
                delete currentHackedHands[pid];
                needsUpdate = true;
                return;
            }

            let lockedCards = currentHackedHands[pid] || [];
            let remainingLocked = [];
            let returningCards = [];
            
            lockedCards.forEach(c => {
                // ハックした時間（なければ0）
                let hackTime = c.hackedAt || 0;
                
                // ★判定ロジック修正:
                // 1. 自分がかけたロックである (c.hackedBy === myId)
                // 2. 最後のログの時間より、ハックした時間が「2秒以上」古い
                //    (今ハックしたばかりなら、時間はほぼ同じなので解除されません)
                //    (一周回ってきたなら、ログの時間はもっと進んでいるので解除されます)
                if (c.hackedBy === myId && (lastLogTime - hackTime > 2000)) {
                    let newC = {...c};
                    delete newC.hackedBy;
                    delete newC.hackedAt; // 時間記録も消す
                    returningCards.push(newC);
                } else {
                    remainingLocked.push(c);
                }
            });
            
            if (returningCards.length > 0) {
                let hand = deepCopy(gameState.hands[pid] || []);
                hand = hand.concat(returningCards);
                hand = sortCards(hand);
                
                updates[`rooms/${currentRoom}/hands/${pid}`] = hand;
                currentHackedHands[pid] = remainingLocked;
                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            updates[`rooms/${currentRoom}/hackedHands`] = currentHackedHands;
            await pushLog(`${myName}のウイルス効果が切れ、ロックが解除されました。`, 'public');
            await db.ref().update(updates);
        }
    }
}

