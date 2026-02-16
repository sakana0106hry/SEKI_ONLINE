/* --- ANGLER (釣り師) の実装 --- */

// ステップ1: 手札から除外するカードを選ぶ
function activateAngler() {
    let hand = gameState.hands[myId] || [];
    if(hand.length === 0) return showInfoModal("エラー", "手札がないため発動できません");
    
    // 墓地が空っぽか確認（拾うものがないと損するだけなので警告、でもルール上は発動できそうだが一応チェック）
    let gn = gameState.graveNum || [];
    let gs = gameState.graveSym || [];
    if(gn.length === 0 && gs.length === 0) return showInfoModal("エラー", "墓地にカードがないため釣れません");

    let html = `<p>エサとして除外する手札を選んでください。</p><div class="modal-list">`;
    hand.forEach((c, i) => {
        // カード表示用の共通処理（画像など）
        let style = '';
        let cImg = CARD_IMAGES[c.val];
        if(cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        // クリックでステップ2へ
        html += `<div class="card ${c.type}" style="${style}" onclick="anglerStep2(${i})">${c.val}</div>`;
    });
    html += `</div>`;
    openModal("釣り師: エサ選択", html);
}

// ステップ2: 墓地から拾うカードを選ぶ
function anglerStep2(excludeIdx) {
    let gn = gameState.graveNum || [];
    let gs = gameState.graveSym || [];
    
    let html = `<p>墓地から釣り上げるカードを選んでください。</p><div class="modal-list" style="justify-content:flex-start;">`;
    
    // 数字墓地
    gn.forEach((c, i) => {
        let style = '';
        html += `<div class="card num" style="${style}" onclick="execAngler(${excludeIdx}, 'num', ${i})">${c.val}<span style="font-size:12px; display:block;"></span></div>`;
    });
    // 記号墓地
    gs.forEach((c, i) => {
        let cImg = CARD_IMAGES[c.val];
        let style = cImg ? `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;` : '';
        html += `<div class="card sym" style="${style}" onclick="execAngler(${excludeIdx}, 'sym', ${i})">${c.val}</div>`;
    });
    
    html += `</div>`;
    openModal("釣り師: 釣魚選択", html);
}

// ステップ3: 実行
async function execAngler(excludeIdx, targetType, targetGraveIdx) {
    closeModal();
    let updates = {};
    
    // データのコピー
    let hand = sortCards(deepCopy(gameState.hands[myId]));
    let gn = [...(gameState.graveNum || [])];
    let gs = [...(gameState.graveSym || [])];
    let excl = [...(gameState.exclusion || [])];
    let actList = {...(gameState.activatedList || {})};

    // 1. 手札を除外
    let excludedCard = hand.splice(excludeIdx, 1)[0];
    excl.push(excludedCard);

    // 2. 墓地から回収
    let pickedCard;
    if (targetType === 'num') {
        pickedCard = gn.splice(targetGraveIdx, 1)[0];
    } else {
        pickedCard = gs.splice(targetGraveIdx, 1)[0];
    }
    hand.push(pickedCard);
    hand = sortCards(hand); // 手札整理

    // 3. データ更新準備
    updates[`rooms/${currentRoom}/hands/${myId}`] = hand;
    updates[`rooms/${currentRoom}/exclusion`] = excl;
    updates[`rooms/${currentRoom}/graveNum`] = gn;
    updates[`rooms/${currentRoom}/graveSym`] = gs;
    
    // 使用済みフラグON
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    // ログ
    await pushLog(`${myName}が[釣り師]を発動！手札を除外して墓地の [${pickedCard.val}] を釣り上げました`, 'public');
    //playSoundEffect('SKILL'); 

    // 4. ターン終了処理
    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
}

