/* --- POLICE OFFICER (警察官) 完成版 --- */
// 1. 全員の手札を1枚ずつ公開 (即座にカットイン) -> 3秒待機 -> 2. 強制トレード

// ステップ1: 一斉捜査
async function activatePoliceOfficer() {
    let updates = {};
    let logs = [];
    let protectedNames = [];
    
    // ★修正1: 発動した瞬間に「使用済み」にする
    // これにより、render関数が反応して「カットイン」と「音」が自動で流れます
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    // 全員の手札をチェックして公開フラグを立てる
    gameState.playerOrder.forEach(pid => {
        if (pid === myId) return; 
        if (gameState.rankings && gameState.rankings[pid]) return; 
        if (isPoliticianShieldActive(pid)) {
            protectedNames.push(gameState.players[pid].name);
            return;
        }

        let hand = deepCopy(gameState.hands[pid] || []);
        let hiddenIndices = [];
        hand.forEach((c, i) => { if (!c.isOpen) hiddenIndices.push(i); });

        if (hiddenIndices.length > 0) {
            let rand = Math.floor(Math.random() * hiddenIndices.length);
            let targetIdx = hiddenIndices[rand];
            
            hand[targetIdx].isOpen = true; // 公開！
            updates[`rooms/${currentRoom}/hands/${pid}`] = hand;
            
            let pName = gameState.players[pid].name;
            logs.push(`${pName}の[${hand[targetIdx].val}]`);
        }
    });

    if (logs.length > 0) {
        await pushLog(`${myName}が[警察官]で一斉捜査！ ${logs.join('、')} を公開させました！`, 'public');
        // 音はrender関数が「activatedList」の変化を検知して鳴らすので、ここでは鳴らしません（二重再生防止）
    } else {
        await pushLog(`${myName}が[警察官]を発動しましたが、新たな証拠は見つかりませんでした。`, 'public');
    }
    if (protectedNames.length > 0) {
        await pushLog(`[政治家]保護により ${protectedNames.join("、")} は[警察官]の公開対象外でした。`, 'public');
    }

    await db.ref().update(updates);

    // ★修正2: カットイン演出の余韻（3秒）を待ってから、強制的にトレード画面へ
    setTimeout(() => {
        policeTradeStart();
    }, 3000); 
}

/* --- 警察官のトレード改修 (狙い撃ち対応) --- */

// ステップ2: トレード相手選択
function policeTradeStart() {
    let html = `
        <p><strong>【捜査協力の要請】</strong><br>続けてトレード(交換)を行いますか？<br>
        <span style="font-size:12px; color:#9cb3c9;">(任意: 行わない場合は下のボタンで終了)</span>
        </p>

        <p style="margin-top:10px;">相手を選んでください</p>
    `;
    let canUseTarget = false;

    // 相手リスト生成
    gameState.playerOrder.forEach(pid => {
        if (pid === myId || (gameState.rankings && gameState.rankings[pid])) return;
        let p = gameState.players[pid];
        let hand = gameState.hands[pid] || [];
        let count = hand.length;
        
        // 公開情報の表示
        let revealed = hand.filter(c => c.isOpen).map(c => c.val).join(", ");
        let revealedInfo = revealed ? `<br><span style="font-size:12px; color:#d9ebff;">(公開: ${revealed})</span>` : "";

        if (count > 0) {
            if (isPoliticianShieldActive(pid)) {
                html += `<button class="modal-btn is-disabled" disabled>
                            ${p.name} (政治家で対象外)
                         </button>`;
            } else {
                canUseTarget = true;
                html += `<button class="modal-btn" onclick="policeSelectTake('${pid}')">
                            ${p.name} (手札${count})${revealedInfo}
                         </button>`;
            }
        }
    });
    if (!canUseTarget) html += `<p class="modal-note">対象にできるプレイヤーがいません。</p>`;
    
    // ▼▼▼ キャンセルボタン（トレードしない）を追加 ▼▼▼
    html += `
        <div style="margin-top:20px; border-top:1px solid #9ec9e5; padding-top:10px;">
            <button onclick="endPoliceTurn()" style="background:#78909c; color:white; padding:10px 20px; border-radius:20px;">
                捜査を終了する (トレードしない)
            </button>
        </div>
    `;

    openModal("警察官: 捜査対象の選択", html);
    document.getElementById("modal-footer").innerHTML = ""; // 標準の閉じるボタンは消し、自前の終了ボタンを使わせる
}

// ★追加: トレードせずに終了する関数
async function endPoliceTurn() {
    closeModal();
    let updates = {};

    // ログ
    await pushLog(`${myName}がトレードなしで[警察官]の捜査を終了しました。`, 'public');

    // ターン終了処理
    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
}

/* --- 修正版: policeSelectTake (フォントバレ防止) --- */
/* --- 修正版: 警察官 (ハッカー対応) --- */

// 奪うカード選択
function policeSelectTake(targetId) {
    if (!canTargetByHandInterference(targetId)) return;
    let targetHand = deepCopy(gameState.hands[targetId] || []);
    targetHand.forEach((c, i) => c.originalIndex = i);
    shuffle(targetHand);

    let html = `<p><strong>押収するカード</strong>を選んでください。<br>
                <span style="font-size:12px;">(公開カードは見えます)</span></p>
                <div class="modal-list">`;

    targetHand.forEach(c => {
        let content = "";
        let style = "cursor:pointer; ";
        let cssClass = "card"; 
        let onClick = `onclick="policeSelectGive('${targetId}', ${c.originalIndex})"`;

        if (c.isOpen) {
            cssClass = `card ${c.type}`; 
            content = c.val;
            let cImg = CARD_IMAGES[c.val];
            if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        } else {
            content = "?";
            style += "background:#455a64; color:#cfd8dc; border:1px solid #78909c;";
        }

        html += `<div class="${cssClass}" style="${style}" ${onClick}>${content}</div>`;
    });

    html += `</div>`;
    openModal("警察官: 押収品選択", html);
    document.getElementById("modal-footer").innerHTML = "";
}

// 渡すカード選択
function policeSelectGive(targetId, takeIdx) {
    if (!canTargetByHandInterference(targetId)) return;
    let hand = sortCards(deepCopy(gameState.hands[myId]));
    let html = `<p>相手に渡すカードを選んでください。</p><div class="modal-list">`;
    
    hand.forEach((c, i) => {
        let style = '';
        let cImg = CARD_IMAGES[c.val];
        if(cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        let cssClass = `card ${c.type}`;
        let onClick = `onclick="execPoliceTrade('${targetId}', ${i}, ${takeIdx})"`;

        html += `<div class="${cssClass}" style="${style} cursor:pointer;" ${onClick}>${c.val}</div>`;
    });
    html += `</div>`;
    openModal("警察官: 提出", html);
    document.getElementById("modal-footer").innerHTML = "";
}

// ステップ3: 自分のカード選択 (引数に takeIdx を追加)
function policeSelectGive(targetId, takeIdx) {
    if (!canTargetByHandInterference(targetId)) return;
    let hand = sortCards(deepCopy(gameState.hands[myId]));
    let html = `<p>相手に渡すカードを選んでください。</p><div class="modal-list">`;
    
    hand.forEach((c, i) => {
        let style = '';
        let cImg = CARD_IMAGES[c.val];
        if(cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        // execPoliceTrade に takeIdx も渡す
        html += `<div class="card ${c.type}" style="${style} cursor:pointer;" 
                  onclick="execPoliceTrade('${targetId}', ${i}, ${takeIdx})">${c.val}</div>`;
    });
    html += `</div>`;
    openModal("警察官: 提出", html);
    document.getElementById("modal-footer").innerHTML = "";
}

// ステップ4: トレード実行 (ランダムではなく指定インデックスで交換)
async function execPoliceTrade(targetId, giveIdx, takeIdx) {
    closeModal();
    if (!canTargetByHandInterference(targetId)) return;
    let updates = {};
    let myHand = sortCards(deepCopy(gameState.hands[myId]));
    let targetHand = sortCards(deepCopy(gameState.hands[targetId])); // 相手の手札はソート済みの状態から取る

    // 交換実行
    let giveCard = myHand.splice(giveIdx, 1)[0];
    // ★変更: ランダムではなく、指定された takeIdx のカードを奪う
    let receiveCard = targetHand.splice(takeIdx, 1)[0];
    const targetName = gameState.players[targetId].name;
    
    myHand.push(receiveCard);
    targetHand.push(giveCard);
    
    updates[`rooms/${currentRoom}/hands/${myId}`] = sortCards(myHand);
    updates[`rooms/${currentRoom}/hands/${targetId}`] = sortCards(targetHand);

    updates[`rooms/${currentRoom}/lastSound`] = { type: 'TRADE', id: Date.now() };
    await pushLog(`${myName}が[警察官]として${targetName}とトレードを実行しました。`, 'public');
    await pushLog(`${targetName}から [${receiveCard.val}] を押収し、[${giveCard.val}] を渡しました。`, 'private', myId);
    await pushLog(`${myName}に [${receiveCard.val}] を押収され、[${giveCard.val}] を渡されました。`, 'private', targetId);
    
    updates[`rooms/${currentRoom}/players/${targetId}/notification`] = {
        fromName: myName + "(警察官)",
        lostVal: receiveCard.val,
        gotVal: giveCard.val
    };

    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
}

