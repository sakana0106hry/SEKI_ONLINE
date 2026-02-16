/* --- EMPEROR (皇帝) の実装 --- */

// 1. スキル発動：全カード回収＆選択画面
function activateEmperor() {
    // 全員の手札を回収して、ソートして表示する
    let allCards = [];
    let pIds = gameState.playerOrder;
    const protectedPids = pIds.filter(pid => isPoliticianShieldActive(pid));
    const targetPids = pIds.filter(pid => !isPoliticianShieldActive(pid));
    
    // 全回収（政治家の保護対象は除外）
    targetPids.forEach(pid => {
        let h = gameState.hands[pid] || [];
        allCards = allCards.concat(h);
    });

    if (allCards.length === 0) return showInfoModal("使用不可", "政治家の保護により対象にできる手札がありません。");

    // ★ご希望のソート処理
    // 数字は小さい順、記号は名前順
    allCards.sort((a, b) => {
        // タイプが違うなら数字が先
        if (a.type !== b.type) return a.type === 'num' ? -1 : 1;
        
        // 数字同士なら値の小さい順
        if (a.type === 'num') return a.val - b.val;
        
        // 記号同士なら名前順 (DIG UP, DISCARD, REVERSE, TRADE)
        return a.val.localeCompare(b.val);
    });

    // モーダル表示
    let html = `
        <p style="font-size:14px;">
            市民の手札をすべて回収しました。<br>
            <strong>あなたが望む「1枚」を選んでください。</strong><br>
            <span style="font-size:12px; color:#9cb3c9;">残りは自動的に再分配されます。</span>
        </p>
        <div class="modal-list">
    `;

    if (protectedPids.length > 0) {
        const protectedNames = protectedPids.map(pid => gameState.players[pid]?.name || pid).join("、");
        html += `<p style="font-size:12px; color:#d32f2f; width:100%;">※ ${protectedNames} は[政治家]の効果で対象外です</p>`;
    }

    allCards.forEach((c, i) => {
        // 通常のカードスタイル生成
        let style = "";
        
        // 画像があるなら背景にセット
        let cImg = CARD_IMAGES[c.val];
        if (cImg) {
            style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        }
        
        // クリックで実行（インデックスを渡す）
        html += `<div class="card ${c.type}" style="${style} cursor:pointer;" 
                      onclick="execEmperorSelect(${i})">
                      ${c.val}
                 </div>`;
    });

    html += `</div>`;
    openModal("皇帝: 徴収と選定", html);
    document.getElementById("modal-footer").innerHTML = ""; // 戻るボタンなし
}

// 2. 選択実行＆再分配
async function execEmperorSelect(selectedIdx) {
    closeModal();
    let updates = {};

    // 1. もう一度全カードを回収・ソート（選択されたカードを特定するため）
    let pIds = gameState.playerOrder;
    const protectedPids = pIds.filter(pid => isPoliticianShieldActive(pid));
    const targetPids = pIds.filter(pid => !isPoliticianShieldActive(pid));
    let handCounts = {}; // 元の枚数を記録
    let allCards = [];
    
    targetPids.forEach(pid => {
        let h = gameState.hands[pid] || [];
        handCounts[pid] = h.length;
        allCards = allCards.concat(h);
    });

    if (allCards.length === 0) return showInfoModal("使用不可", "政治家の保護により対象にできる手札がありません。");
    if (selectedIdx < 0 || selectedIdx >= allCards.length) return showInfoModal("エラー", "選択カードが不正です。");

    // ソート（activateと同じロジック）
    allCards.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'num' ? -1 : 1;
        if (a.type === 'num') return a.val - b.val;
        return a.val.localeCompare(b.val);
    });

    // 2. 皇帝が選んだカードを確保
    let emperorCard = allCards.splice(selectedIdx, 1)[0];

    // 3. 残りをシャッフル
    shuffle(allCards);

    // 4. 再分配 (皇帝の次の人から配る)
    // まず皇帝に選んだ1枚を持たせる
    let newHands = {};
    pIds.forEach(pid => {
        if (isPoliticianShieldActive(pid)) newHands[pid] = sortCards(deepCopy(gameState.hands[pid] || []));
        else newHands[pid] = [];
    });
    newHands[myId].push(emperorCard);
    
    // 現在の皇帝のインデックス（保護対象を除いた並び）
    let myTurnIdx = targetPids.indexOf(myId);
    if (myTurnIdx === -1) return showInfoModal("エラー", "皇帝の配布対象が不正です。");
    let totalPlayers = targetPids.length;
    
    // カードを配るポインタ
    let cardPtr = 0;
    
    // 「皇帝の次の人」から順に、元の枚数になるまで配る
    // ループは最大でも (人数 * 最大手札枚数) 回程度なので安全
    for (let i = 1; i <= totalPlayers; i++) {
        let targetIdx = (myTurnIdx + i) % totalPlayers;
        let targetPid = targetPids[targetIdx];
        
        // その人が本来持つべき枚数になるまで山から補充
        while (newHands[targetPid].length < handCounts[targetPid] && cardPtr < allCards.length) {
            newHands[targetPid].push(allCards[cardPtr]);
            cardPtr++;
        }
    }

    // 5. 手札をソートしてセット
    pIds.forEach(pid => {
        newHands[pid] = sortCards(newHands[pid]);
        updates[`rooms/${currentRoom}/hands/${pid}`] = newHands[pid];
    });

    // 6. ログと演出
    await pushLog(`${myName}が[皇帝]を発動！市民の手札を全て回収し、再分配しました。`, 'public');
    if (protectedPids.length > 0) {
        const protectedNames = protectedPids.map(pid => gameState.players[pid]?.name || pid).join("、");
        await pushLog(`[政治家]保護により ${protectedNames} の手札は[皇帝]の対象外でした。`, 'public');
    }


    // 7. ターン終了
    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    // 使用済みにする
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    await db.ref().update(updates);
}

