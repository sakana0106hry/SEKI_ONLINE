/* --- ALCHEMIST (錬金術師) 修正版 [UI改善 & 判定強化] --- */

let alchemyDrawnCard = null; 
let alchemyHandIdx = -1;     

// 発動
async function activateAlchemist() {
    let deck = gameState.deckNum || [];
    if (deck.length === 0) return showInfoModal("錬金失敗", "数字山札が尽きているため、素材を調達できません。");

    let hand = gameState.hands[myId] || [];
    let hasNum = hand.some(c => c.type === 'num');
    if (!hasNum) return showInfoModal("錬金失敗", "手札に触媒となる数字カードがありません。");

    // 仮引き
    let tempDeck = [...deck];
    alchemyDrawnCard = tempDeck.pop();
    
    alchemyHandIdx = -1;
    renderAlchemistUI();
}

// UI表示
/* --- 修正版: 場の確認機能 & ボタン改善 --- */
/* --- ALCHEMIST (錬金術師) UI修正版 --- */
function renderAlchemistUI() {
    let hand = sortCards(deepCopy(gameState.hands[myId] || []));
    
    // 判定用に場のトップは保持（表示はしない）
    let top = getTop(gameState.graveNum);

    // 引いたカードの表示スタイル
    let drawImg = CARD_IMAGES[alchemyDrawnCard.val];
    let drawStyle = "border:3px solid #42b6ff; box-shadow:0 0 10px #72ccff; transform:scale(1.1);";
    if (drawImg) drawStyle += `background-image:url('${drawImg}'); color:transparent;`;

    // HTML組み立て
    let html = `
        <div style="display:flex; justify-content:space-around; align-items:center; margin-bottom:10px; background:rgba(8,26,48,0.55); padding:10px; border-radius:8px; border:1px solid rgba(0,216,255,0.24);">
            <div style="text-align:center;">
                <div style="font-size:12px; color:#d9ebff; font-weight:bold; margin-bottom:5px;">素材A (ドロー)</div>
                <div class="card num" style="${drawStyle} margin:0 auto;">${alchemyDrawnCard.val}</div>
            </div>
            <div style="font-size:20px; color:#aaa;">+</div>
            <div style="text-align:center;">
                <div style="font-size:12px; color:#d9ebff; font-weight:bold; margin-bottom:5px;">素材B (手札)</div>
                <div id="alchemy-hand-preview" style="width:54px; height:86px; border:2px dashed #9ec9e5; border-radius:6px; line-height:86px; color:#7ea5bf;">?</div>
            </div>
        </div>

        <p>手札から<strong>素材にする数字カード</strong>を選んでください。</p>
        <div class="modal-list">`;

    // 手札リスト (変更なし)
    hand.forEach((c, i) => {
        let isNum = (c.type === 'num');
        let isSelected = (alchemyHandIdx === i);
        let style = "transition: transform 0.2s; ";
        let onClick = "";

        if (isNum) {
            style += "cursor:pointer; ";
            if (isSelected) style += "border:3px solid #42b6ff; transform:scale(1.1); box-shadow:0 0 10px #72ccff;";
            
            if (c.isHacked) {
                style += "cursor:not-allowed; filter:grayscale(100%); border:1px solid #5f6f82; background:#2a3440; color:#cfd8dc;";
                onClick = `onclick="showInfoModal('ロック', 'ハッキングされているカードは素材にできません')"`;
            } else {
                onClick = `onclick="selectAlchemistHand(${i})"`;
            }
        } else {
            style += "opacity:0.4; cursor:default; border:1px dashed #999;";
        }
        
        let cImg = CARD_IMAGES[c.val];
        if (cImg) style += `background-image:url('${cImg}'); color:transparent;`;

        html += `<div class="card ${c.type}" style="${style}" ${onClick}>${c.val}</div>`;
    });
    html += `</div>`;

    // 錬金実行ボタンエリア (ロジック変更なし)
    if (alchemyHandIdx !== -1) {
        let val1 = Number(alchemyDrawnCard.val);
        let val2 = Number(hand[alchemyHandIdx].val);

        let sumVal = (val1 + val2) % 10;
        let diffVal = Math.abs(val1 - val2);

        // 3. 積 (×)
        let prodVal = val1 * val2 % 10; // そのまま掛ける

        // 4. 商 (÷)
        // 大きい方を小さい方で割る
        let big = Math.max(val1, val2);
        let small = Math.min(val1, val2);
        let divVal = null;
        let divValid = false;

        // 0除算防止のみ (割り切れなくても切り捨てて商とする)
        if (small !== 0) {
            divVal = Math.floor(big / small); // ★ Math.floor() で切り捨て
            divValid = true;
        }

        // 判定
        let canSum = canPlay({type:'num', val:sumVal}, top, gameState.isReverse);
        let canDiff = canPlay({type:'num', val:diffVal}, top, gameState.isReverse);
        let canProd = canPlay({type:'num', val:prodVal}, top, gameState.isReverse);
        
        let canDiv = false;
        if (divValid) {
            canDiv = canPlay({type:'num', val:divVal}, top, gameState.isReverse);
        }

        const makeBtn = (label, val, can, isInvalidCalc) => {
            let bg = can ? "#4a148c" : "#4f5966"; 
            let color = can ? "#f7e8ff" : "#b8c7d6";
            let cursor = can ? "pointer" : "not-allowed"; // カーソルを禁止マークに
            
            // 出せる時だけクリックイベントを設定
            let onClick = can ? `onclick="execAlchemist(${val})"` : "";
            // 出せない時は disabled 属性をつける
            let disabledAttr = can ? "" : "disabled";
            
            // 計算不能(0除算など)の場合の注記
            let note = "";
            if (!can) {
                if (isInvalidCalc) {
                    note = "<br><span style='font-size:12px; opacity:0.85;'>(不可)</span>";
                } else {
                    note = "<br><span style='font-size:12px; opacity:0.85;'>(ルール違反)</span>";
                }
            }

            // 表示値がnullの場合は "?" と表示
            let dispVal = (val !== null) ? val : "?";

            return `<button ${onClick} ${disabledAttr} style="background:${bg}; color:${color}; padding:10px 5px; border-radius:8px; cursor:${cursor}; width:48%; font-weight:bold; border:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                        ${label} <span style="font-size:18px;">[${dispVal}]</span>${note}
                    </button>`;
        };

        html += `
            <div style="margin-top:15px; padding:10px; background:rgba(8,26,48,0.58); border:1px solid rgba(143,176,214,0.45); border-radius:8px;">
                <p style="margin:0 0 10px 0; font-weight:bold; color:#d9ebff; font-size:12px;">錬成結果 (場の強弱に従う)</p>
                <div style="display:flex; justify-content:space-between; gap:5px;">
                    ${makeBtn("和 (+)", sumVal, canSum)}
                    ${makeBtn("差 (-)", diffVal, canDiff)}
                    ${makeBtn("積 (×)", prodVal, canProd, false)}
                    ${makeBtn("商 (÷)", divVal, canDiv, !divValid)}
                </div>
            </div>
        `;
    }

    // 中止ボタン
    let footerHtml = `<button onclick="execAlchemistKeep()" class="modal-btn" style="background:#78909c; margin-top:10px; width:100%;">
                        錬金失敗 (ドロー素材を除外する)
                      </button>`;

    openModal("錬金術師: 素材融合", html);
    document.getElementById("modal-footer").innerHTML = footerHtml;
    
    // プレビュー更新
    if (alchemyHandIdx !== -1) {
        let c = hand[alchemyHandIdx];
        let prev = document.getElementById("alchemy-hand-preview");
        if(prev) {
            prev.innerText = c.val;
            prev.style.border = "2px solid #42b6ff";
            prev.style.color = "#9ce8ff";
            prev.style.fontWeight = "bold";
            prev.style.fontSize = "22px";
        }
    }
}

function selectAlchemistHand(idx) {
    alchemyHandIdx = idx;
    renderAlchemistUI();
}

// 実行: 成功（場に出す）
// ↓↓↓ execAlchemist関数を丸ごとこれに置き換えてください ↓↓↓
async function execAlchemist(resultVal) {
    closeModal();
    let updates = {};
    
    // 整合性チェック
    let hand = sortCards(deepCopy(gameState.hands[myId]));
    let deck = [...(gameState.deckNum || [])];
    let gn = [...(gameState.graveNum || [])];
    let excl = [...(gameState.exclusion || [])];
    
    // 山札チェック
    let realDrawn = deck[deck.length - 1]; 
    if (!realDrawn || Number(realDrawn.val) !== Number(alchemyDrawnCard.val)) {
        return showInfoModal("錬金失敗", "詠唱中に山札が変動しました。やり直してください。");
    }
    
    // 手札チェック
    if (!hand[alchemyHandIdx] || hand[alchemyHandIdx].isHacked) {
        return showInfoModal("錬金失敗", "選択した手札がロックされたか、失われました。");
    }

    // 処理実行
    deck.pop(); 
    let realHandCard = hand.splice(alchemyHandIdx, 1)[0];
    
    excl.push(realDrawn);
    excl.push(realHandCard);

    // 生成カードを場に出す
    let createdCard = { type: 'num', val: Number(resultVal), owner: myId, isAlchemy: true };
    gn.push(createdCard);
    
    hand = sortCards(hand);
    updates[`rooms/${currentRoom}/hands/${myId}`] = hand;
    updates[`rooms/${currentRoom}/deckNum`] = deck;
    updates[`rooms/${currentRoom}/exclusion`] = excl;
    updates[`rooms/${currentRoom}/graveNum`] = gn;
    updates[`rooms/${currentRoom}/lastGraveActorId`] = myId;

    await pushLog(`${myName}が錬金成功！ [${realDrawn.val}] (ドロー)と [${realHandCard.val}] (手札)を融合し [${resultVal}] を出しました。`, 'public');
    
    // ★1. ハッキング枚数と合計枚数の計算
    let myHackedCount = (gameState.hackedHands && gameState.hackedHands[myId]) ? gameState.hackedHands[myId].length : 0;
    let nextTotal = hand.length + myHackedCount;

    // ★2. 音の決定（重複防止のため、役職音はカットイン側に一本化）
    let soundList = [];

    if (nextTotal === 1) soundList.push('UNO');
    else if (nextTotal === 2) soundList.push('DOS');

    // 音情報を送信
    updates[`rooms/${currentRoom}/lastSound`] = { type: soundList, id: Date.now() };

    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    // ★3. あがり判定（計算済みの myHackedCount を使う）
    if (hand.length === 0 && myHackedCount === 0) {
        let currentRank = Object.keys(gameState.rankings || {}).length + 1;
        updates[`rooms/${currentRoom}/rankings/${myId}`] = currentRank;
        updates[`rooms/${currentRoom}/finishMethods/${myId}`] = "ALCHEMIST";
        await pushLog(`${myName}が ${currentRank}位 であがりました！`, 'public');
        
        // ▼▼▼ 追加: 勝利者IDと、あがった時刻を記録 ▼▼▼
        updates[`rooms/${currentRoom}/lastWinnerId`] = myId;
        updates[`rooms/${currentRoom}/lastWinnerTime`] = Date.now();
        // ▲▲▲ 追加ここまで ▲▲▲
        
        let totalPlayers = gameState.playerOrder.length;
        appendRankSound(soundList, currentRank, totalPlayers);
        if (currentRank >= totalPlayers - 1) {
             updates[`rooms/${currentRoom}/status`] = "finished";

            // 敗者（最後の一人）を特定
            let loserId = gameState.playerOrder.find(pid => !gameState.rankings?.[pid] && pid !== myId);
                     
                        if(loserId) {
                            // 敗者の順位を確定
                            updates[`rooms/${currentRoom}/rankings/${loserId}`] = totalPlayers;
                            appendRankSound(soundList, totalPlayers, totalPlayers);
                            
                            // 敗者の手札（通常手札 + ハッキング中の手札）を取得
                            let lHand = gameState.hands[loserId] || [];
                            let lHacked = (gameState.hackedHands && gameState.hackedHands[loserId]) ? gameState.hackedHands[loserId] : [];
                            let allL = [...lHand, ...lHacked];
                            
                            // カード名を文字列化
                            let lText = allL.map(c => c.val).join(", ") || "なし";
                            let lName = gameState.players[loserId].name;
                            
                            // 全員に見えるログとして送信
                            await pushLog(`全順位確定！！最下位 ${lName} の残りの手札: [${lText}]`, 'public');
                        } else {
                            await pushLog(`全順位が確定しました！！`, 'public');
                        }
                        // スコア更新を実行 (finalRankingsを組み立てて渡す)
                        let finalRankings = {...(gameState.rankings || {})};
                        finalRankings[myId] = currentRank; // 自分の順位
                        loserId = gameState.playerOrder.find(pid => !finalRankings[pid]);
                        if(loserId) finalRankings[loserId] = totalPlayers; // 敗者の順位

                        const mergedFinishMethods = {
                            ...(gameState.finishMethods || {}),
                            [myId]: "ALCHEMIST"
                        };
                        await updateFinalScores(finalRankings, gameState.playerOrder, {
                            sourceState: {
                                ...gameState,
                                rankings: finalRankings,
                                finishMethods: mergedFinishMethods
                            },
                            finishedAt: Date.now()
                        });
                    }           
    }
    
    let tempRankings = {...(gameState.rankings || {})};
    if (hand.length === 0) tempRankings[myId] = 99;

    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, tempRankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
    
    alchemyDrawnCard = null;
    alchemyHandIdx = -1;
}

// 実行: 中止（ドロー素材を除外）
async function execAlchemistKeep() {
    closeModal();
    let updates = {};
    
    let deck = [...(gameState.deckNum || [])];
    let excl = [...(gameState.exclusion || [])];
    
    // 山札チェック
    let realDrawn = deck[deck.length - 1]; 
    if (!realDrawn || Number(realDrawn.val) !== Number(alchemyDrawnCard.val)) {
        return showInfoModal("エラー", "山札の不整合が発生しました。");
    }
    
    // 除外する
    deck.pop(); 
    excl.push(realDrawn);
    
    updates[`rooms/${currentRoom}/deckNum`] = deck;
    updates[`rooms/${currentRoom}/exclusion`] = excl;

    await pushLog(`${myName}の錬金は失敗し、ドロー素材 [${realDrawn.val}] を除外しました。`, 'public');

    // スキル使用済み & パスカウントリセット
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    updates[`rooms/${currentRoom}/passCount`] = 0;

    let tempRankings = {...(gameState.rankings || {})};
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, tempRankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    await db.ref().update(updates);
    
    alchemyDrawnCard = null;
    alchemyHandIdx = -1;
}

