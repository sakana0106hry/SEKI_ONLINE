/* --- 修正版: 盗賊 (ハッカー対応) --- */

// 奪うカード選択
function thiefSelectTake(targetId, count) {
    if (!canTargetByHandInterference(targetId)) return;
    let targetHand = deepCopy(gameState.hands[targetId] || []);
    targetHand.forEach((c, i) => c.originalIndex = i);
    shuffle(targetHand);

    let html = `<p>相手の手札から<strong>奪うカード</strong>を選んでください。<br>
                <span style="font-size:12px;">(公開カードは見えます)</span></p>
                <div class="modal-list">`;

    targetHand.forEach(c => {
        let content = "?";
        let style = "cursor:pointer; background:#455a64; color:#cfd8dc; border:1px solid #78909c;";
        let cssClass = "card"; 
        let onClick = `onclick="thiefSelectGive('${targetId}', ${c.originalIndex}, ${count})"`;

        // ★ハッカー対応
        if (c.isHacked) {
            cssClass += " hacked";
            style = "cursor:not-allowed; border:1px solid #5f6f82; background:#2a3440; color:#cfd8dc;";
            content = "🔒"; 
            onClick = "";
        }
        else if (c.isOpen) {
            cssClass = `card ${c.type}`;
            content = c.val;
            style = "cursor:pointer; "; 
            let cImg = CARD_IMAGES[c.val];
            if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        }

        html += `<div class="${cssClass}" style="${style}" ${onClick}>${content}</div>`;
    });
    
    openModal(`盗賊: 略奪選択 (${count}回目)`, html);
    if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
}

// 渡すカード選択
function thiefSelectGive(targetId, takeIdx, count) {
    if (!canTargetByHandInterference(targetId)) return;
    const myHand = sortCards(deepCopy(gameState.hands[myId] || []));

    let html = `<p>相手に押し付けるカードを選んでください。</p><div class="modal-list">`;
    
    myHand.forEach((c, idx) => {
        let style = "";
        let cImg = CARD_IMAGES[c.val];
        if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        let cssClass = `card ${c.type}`;
        let onClick = `onclick="execThiefTrade('${targetId}', ${idx}, ${takeIdx}, ${count})"`;

        // ★ハッカー対応
        if (c.isHacked) {
            cssClass += " hacked";
            onClick = "";
        }

        html += `<div class="${cssClass}" style="${style} cursor:pointer;" ${onClick}>${c.val}</div>`;
    });

    openModal(`盗賊: 譲渡選択 (${count}回目)`, html);

    if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
}

// 3. 自分の手札から「押し付けるカード」を選ぶ
function thiefSelectGive(targetId, takeIdx, count) {
    if (!canTargetByHandInterference(targetId)) return;
    const myHand = sortCards(deepCopy(gameState.hands[myId] || []));

    let html = `<p>相手に押し付けるカードを選んでください。</p><div class="modal-list">`;
    
    myHand.forEach((c, idx) => {
        let style = "";
        
        let cImg = CARD_IMAGES[c.val];
        if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        // 実行関数へ (takeIdx も渡す)
        html += `<div class="card ${c.type}" style="${style} cursor:pointer;" 
                      onclick="execThiefTrade('${targetId}', ${idx}, ${takeIdx}, ${count})">
                      ${c.val}
                 </div>`;
    });
    

    openModal(`盗賊: 譲渡選択 (${count}回目)`, html);

    if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
}

// 4. トレード実行処理 (ランダムではなく指定インデックスで)
async function execThiefTrade(targetId, giveIdx, takeIdx, count) {
    closeModal();
    if (!canTargetByHandInterference(targetId)) return;
    const updates = {};
    
    let myHand = [...(gameState.hands[myId] || [])];
    let targetHand = [...(gameState.hands[targetId] || [])]; // 相手の手札(ソート済み)
    
    if (targetHand.length === 0) {
        showInfoModal("エラー", "相手の手札がありません！");
        return;
    }

    // --- トレード実行 ---
    // 自分が出すカード
    const giveCard = myHand.splice(giveIdx, 1)[0]; 
    // 相手から奪うカード (指定したインデックス)
    const receiveCard = targetHand.splice(takeIdx, 1)[0]; 
    
    myHand.push(receiveCard); 
    targetHand.push(giveCard); 

    // カード移動後の整理
    updates[`rooms/${currentRoom}/hands/${myId}`] = sortCards(myHand);
    updates[`rooms/${currentRoom}/hands/${targetId}`] = sortCards(targetHand);
    
    const targetName = gameState.players[targetId].name;
    
    // ログ出力
    await pushLog(`${myName}が[盗賊]で${targetName}とトレードしました！(${count}回目)`, 'public');
    await pushLog(`${targetName}から [${receiveCard.val}] を盗み、 [${giveCard.val}] を奪いました。`, 'private', myId);
    await pushLog(`${myName}に [${receiveCard.val}] を盗まれ、 [${giveCard.val}] を渡されました。`, 'private', targetId);

    // 通知
    updates[`rooms/${currentRoom}/players/${targetId}/notification`] = {
        fromName: myName + "(盗賊)",
        lostVal: receiveCard.val,
        gotVal: giveCard.val
    };

    // 音（2回目は専用音）
    if (count === 2) {
         const skillSound = (typeof SOUND_FILES !== 'undefined' && SOUND_FILES['SKILL_THIEF']) ? 'SKILL_THIEF' : 'SKILL';
         updates[`rooms/${currentRoom}/lastSound`] = { type: skillSound, id: Date.now() };
    }

    // 1回目なら使用済みフラグを立てる
    if (count === 1) {
        let actList = {...(gameState.activatedList || {})};
        actList[myId] = true; 
        updates[`rooms/${currentRoom}/activatedList`] = actList;
    }

    await db.ref().update(updates);

    // 次の行動確認
    if (count === 1) {
        let confirmHtml = `
            <p>1回目のトレードが完了しました。<br>
            <strong>奪ったカード: ${receiveCard.val}</strong><br>
            続けて2回目のトレードを行いますか？
            </p>
            <button onclick="activateThief(2)" style="width:100%; padding:15px; background:#d32f2f; color:white; font-weight:bold; margin-bottom:10px;">
                はい (もう一度盗む)
            </button>
            <button onclick="endThiefTurn()" style="width:100%; padding:15px; background:#444; color:white;">
                いいえ (ターンを終了する)
            </button>
        `;
        openModal("盗賊: 追撃の選択", confirmHtml);
        
        if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
    } else {
        endThiefTurn();
    }
}
// 4. ターン終了処理
async function endThiefTurn() {
    closeModal();
    
    // ★修正: gameState.turnIdx を使うように変更（念のため）
    let currentTurnIdx = (typeof turnIdx !== 'undefined') ? turnIdx : gameState.turnIdx;
    let nextIdx = (currentTurnIdx + 1) % gameState.playerOrder.length;
    
    let updates = {};
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;
    updates[`rooms/${currentRoom}/passCount`] = 0; 
    updates[`rooms/${currentRoom}/lastAction`] = "THIEF_END";

    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true; 
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    await db.ref().update(updates);
    await pushLog(`${myName}の[盗賊]が終了しました。`, 'public');
}

