/* --- CROWN (ピエロ) の実装 --- */
// 概要: パネル自体を「REVERSE」「TRADE」「DIG UP」のいずれかとして使う

// 1. 発動：効果を選択する
function activateMagician() {
    let html = `
        <p>どのサプライズを行いますか？<br>
        <span style="font-size:12px; color:#9cb3c9;">※手札のカードは消費しません（コストとして必要な場合を除く）</span>
        </p>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
            <button onclick="execMagicianReverse()" style="padding:15px; background:#e91e63; color:white; font-weight:bold; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <span style="font-size:18px;">🔄 REVERSE</span>
                <span style="font-size:12px; margin-top:4px;">強弱をひっくり返す！</span>
            </button>
            <button onclick="activateMagicianTrade()" style="padding:15px; background:#5a3312; color:#ffe2b7; font-weight:bold; border:1px solid #ffb86b; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <span style="font-size:18px;">🤝 TRADE</span>
                <span style="font-size:12px; margin-top:4px;">こっそりカードを交換する！</span>
            </button>
            <button onclick="activateMagicianDigUp()" style="padding:15px; background:#8d6e63; color:white; font-weight:bold; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <span style="font-size:18px;">⛏ DIG UP</span>
                <span style="font-size:12px; margin-top:4px;">カードを拾ってすり替える！</span>
            </button>
        </div>
    `;
    openModal("ピエロ: サプライズ選択", html);
}

// --- A: REVERSE (革命) ---
async function execMagicianReverse() {
    closeModal();
    let updates = {};
    
    // 革命フラグ反転
    updates[`rooms/${currentRoom}/isReverse`] = !gameState.isReverse;
    
    // ★ポイント: 使用済みリストに「何を使ったか」を書き込む
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = "REVERSE"; 
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    // ログなど
    await pushLog(`${myName}が[ピエロ]で[REVERSE] を使用して強弱を逆転させました`, 'public');
    //playSoundEffect('SKILL');
    //playSoundEffect('REVERSE');
    
    updates[`rooms/${currentRoom}/lastSound`] = { type: 'REVERSE', id: Date.now() };
    // ターン進行
    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
}

// --- B: TRADE (交換) ---
/* --- 修正版: ピエロ (ハッカー & 公開対応) --- */

// B: TRADE (交換) - 相手選択
function activateMagicianTrade() {
    let hand = gameState.hands[myId] || [];
    // 自分の手札が全てハッキングされていたら交換に出せるカードがない
    let availableHand = hand.filter(c => !c.isHacked);
    let canUseTarget = false;
    
    if (hand.length === 0) return showInfoModal("エラー", "手札がありません");
    if (availableHand.length === 0) return showInfoModal("ロック中", "ハッキングされていない手札がありません");

    let html = `<p>トレード相手を選んでください。</p>`;
    gameState.playerOrder.forEach(pid => {
        if (pid === myId || (gameState.rankings && gameState.rankings[pid])) return;
        let p = gameState.players[pid];
        let count = gameState.hands[pid] ? gameState.hands[pid].length : 0;
        
        // ★変更: 次は「奪うカード選択 (magicianSelectTake)」へ
        if (count > 0) {
            if (isPoliticianShieldActive(pid)) {
                html += `<button class="modal-btn is-disabled" disabled>${p.name} (政治家で対象外)</button>`;
            } else {
                canUseTarget = true;
                html += `<button class="modal-btn" onclick="magicianSelectTake('${pid}')">${p.name} (手札${count})</button>`;
            }
        }
    });
    if (!canUseTarget) html += `<p class="modal-note">対象にできるプレイヤーがいません。</p>`;
    openModal("ピエロ(TRADE): 相手選択", html);
}

// ★新設: 奪うカード選択 (ハッカー & 公開対応)
function magicianSelectTake(targetId) {
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
        let onClick = `onclick="magicianSelectGive('${targetId}', ${c.originalIndex})"`;

        // ★ハッカー対応
        if (c.isHacked) {
            cssClass += " hacked";
            style = "cursor:not-allowed; border:1px solid #5f6f82; background:#2a3440; color:#cfd8dc;";
            content = "🔒"; 
            onClick = "";
        }
        // ★公開対応
        else if (c.isOpen) {
            cssClass = `card ${c.type}`;
            content = c.val;
            style = "cursor:pointer; ";
            let cImg = CARD_IMAGES[c.val];
            if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        }

        html += `<div class="${cssClass}" style="${style}" ${onClick}>${content}</div>`;
    });

    html += `</div>`;
    openModal("ピエロ(TRADE): 略奪選択", html);
}

// 渡すカード選択 (名前変更: SelectTradeCard -> SelectGive)
function magicianSelectGive(targetId, takeIdx) {
    if (!canTargetByHandInterference(targetId)) return;
    let hand = sortCards(deepCopy(gameState.hands[myId]));
    let html = `<p>相手に渡すカードを選んでください。<br><span style="font-size:12px;">(ピエロの効果なのでTRADEカード自体は不要です)</span></p><div class="modal-list">`;
    
    hand.forEach((c, i) => {
        let style = '';
        let cImg = CARD_IMAGES[c.val];
        if(cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        let cssClass = `card ${c.type}`;
        let onClick = `onclick="execMagicianTrade('${targetId}', ${i}, ${takeIdx})"`;

        // ★ハッカー対応
        if (c.isHacked) {
            cssClass += " hacked";
            onClick = "";
        }
        
        html += `<div class="${cssClass}" style="${style}" ${onClick}>${c.val}</div>`;
    });
    html += `</div>`;
    openModal("ピエロ(TRADE): 譲渡選択", html);
}

// 実行処理 (引数 takeIdx を追加)
async function execMagicianTrade(targetId, giveIdx, takeIdx) {
    closeModal();
    if (!canTargetByHandInterference(targetId)) return;
    let updates = {};
    let myHand = sortCards(deepCopy(gameState.hands[myId]));
    let targetHand = sortCards(deepCopy(gameState.hands[targetId]));

    // 交換処理
    let giveCard = myHand.splice(giveIdx, 1)[0]; // 自分のカード
    // ★変更: 指定したカードを奪う
    let receiveCard = targetHand.splice(takeIdx, 1)[0]; // 相手のカード
    
    myHand.push(receiveCard);
    targetHand.push(giveCard);
    
    updates[`rooms/${currentRoom}/hands/${myId}`] = sortCards(myHand);
    updates[`rooms/${currentRoom}/hands/${targetId}`] = sortCards(targetHand);

    // 使用済み記録: TRADE
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = "TRADE"; 
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    updates[`rooms/${currentRoom}/lastSound`] = { type: 'TRADE', id: Date.now() };

    const targetName = gameState.players[targetId].name;

    await pushLog(`${myName}が[ピエロ]で[TRADE]を使用して${targetName} とカードを交換しました`, 'public');
    await pushLog(`[ピエロ]で${targetName}から [${receiveCard.val}] を奪い、[${giveCard.val}] を渡しました。`, 'private', myId);
    await pushLog(`[ピエロ]の${gameState.players[myId].name}に [${receiveCard.val}] を奪われ、 [${giveCard.val}] を渡されました。`, 'private', targetId);

    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    updates[`rooms/${currentRoom}/players/${targetId}/notification`] = {
        fromName: myName + "(ピエロ)",
        lostVal: receiveCard.val,
        gotVal: giveCard.val
    };
    
    await db.ref().update(updates);
}

// --- C: DIG UP (発掘) ---
function activateMagicianDigUp() {
    let gn = gameState.graveNum || [];
    if (gn.length === 0) return showInfoModal("エラー", "数字墓地がないため拾えません");

    let hand = gameState.hands[myId] || [];
    let hasNum = hand.some(c => c.type === 'num');
    if (!hasNum) return showInfoModal("エラー", "埋めるための数字カードが手札にありません");

    // 埋めるカードを選ぶ
    let html = `<p>墓地の一番上を拾います。<br>代わりに埋めるカード(数字)を選んでください。</p><div class="modal-list">`;
    hand.forEach((c, i) => {
        if (c.type !== 'num') return; // 数字以外は埋められないルール
        let style = '';
        html += `<div class="card ${c.type}" style="${style}" onclick="execMagicianDigUp(${i})">${c.val}</div>`;
    });
    html += `</div>`;
    openModal("ピエロ(DIG UP): 埋葬選択", html);
}

async function execMagicianDigUp(buryIdx) {
    closeModal();
    let updates = {};
    let hand = sortCards(deepCopy(gameState.hands[myId]));
    let gn = [...(gameState.graveNum || [])];
    
    // 処理: 墓地トップ取得 → 手札埋め → 手札入れ替え
    let top = gn.pop(); 
    let buryCard = hand.splice(buryIdx, 1)[0];
    hand.push(top);
    gn.push({...buryCard, owner:myId});

    updates[`rooms/${currentRoom}/hands/${myId}`] = sortCards(hand);
    updates[`rooms/${currentRoom}/graveNum`] = gn;
    updates[`rooms/${currentRoom}/lastGraveActorId`] = myId;

    // ★使用済み記録: DIG UP
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = "DIG UP"; 
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    updates[`rooms/${currentRoom}/lastSound`] = { type: 'DIG UP', id: Date.now() };

    await pushLog(`${myName}が[ピエロ]の[DIG UP] を使用して [${top.val}] を回収し、[${buryCard.val}] を埋めました。`, 'public');
    //playSoundEffect('SKILL');
    //playSoundEffect('DIG UP');

    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
}

