/* --- HUNTER (狩人) の実装 (UI改善版) --- */

function activateHunter() {
    let deckSym = gameState.deckSym || [];
    let hand = gameState.hands[myId] || [];
    
    if (deckSym.length === 0) return showInfoModal("エラー", "記号山札が空です。");

    let html = `
        <p style="font-size:12px;">
            記号山札の中身をすべて確認できます。<br>
            交換したいカードをタップして、<strong>「手札」と「山札」を同じ枚数</strong>にしてください。<br>
            <span style="color:#d32f2f;">※この画面を開いた時点でスキル使用済みとなります。</span>
        </p>
        
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="width:48%; background:rgba(8,26,48,0.45); border:1px solid rgba(143,176,214,0.3); border-radius:8px; padding:5px;">
                <div style="font-weight:bold; border-bottom:1px solid rgba(143,176,214,0.38); color:#d9ebff; margin-bottom:5px; font-size:12px;">自分の手札 (除外)</div>
                <div id="hunter-hand-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:5px;"></div>
            </div>

            <div style="width:48%; background:rgba(8,26,48,0.45); border:1px solid rgba(143,176,214,0.3); border-radius:8px; padding:5px;">
                <div style="font-weight:bold; border-bottom:1px solid rgba(143,176,214,0.38); color:#d9ebff; margin-bottom:5px; font-size:12px;">記号山札 (入手)</div>
                <div id="hunter-deck-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:5px;"></div>
            </div>
        </div>

        <div style="margin-top:15px; text-align:center;">
            <p id="hunter-msg" style="color:#d32f2f; font-size:12px; font-weight:bold;">枚数が一致していません</p>
            
            <button onclick="execHunterSwap()" id="btn-hunter-exec" disabled 
                style="background:#4f5966; color:#d9ebff; padding:10px 30px; font-weight:bold; border-radius:20px; border:1px solid rgba(143,176,214,0.45);">交換して終了</button>
            <br>
            <button onclick="execHunterSwap(true)" style="background:#546e7a; color:#fff; margin-top:10px; padding:8px 20px; font-size:12px; border-radius:20px;">
                交換せずに終了
            </button>
        </div>
    `;

    openModal("狩人: 武器の選定", html);
    document.getElementById("modal-footer").innerHTML = ""; // 閉じるボタン削除

    // --- カードリスト生成関数 ---
    const createCardDiv = (c, i, type) => {
        let imgUrl = CARD_IMAGES[c.val];
        // 基本スタイル
        let style = "width:40px; height:60px; font-size:12px; cursor:pointer; transition:transform 0.1s; border:1px solid #999;";
        if (imgUrl) style += `background-image:url('${imgUrl}'); color:transparent; border:none;`;
        
        // クリックイベント: toggleHunterSelect(要素, タイプ, インデックス)
        return `<div class="card ${c.type} hunter-item" id="hunter-${type}-${i}" 
                    data-idx="${i}" data-type="${type}"
                    style="${style}" 
                    onclick="toggleHunterSelect(this)">
                    ${c.val}
                </div>`;
    };

    // 1. 手札リスト (記号のみ)
    let handHtml = "";
    hand.forEach((c, i) => {
        if (c.type === 'sym') handHtml += createCardDiv(c, i, 'hand');
    });
    document.getElementById("hunter-hand-list").innerHTML = handHtml;

    // 2. 山札リスト (すべて)
    let deckHtml = "";
    deckSym.forEach((c, i) => {
        deckHtml += createCardDiv(c, i, 'deck');
    });
    document.getElementById("hunter-deck-list").innerHTML = deckHtml;
}

// カード選択の切り替え & チェック
function toggleHunterSelect(el) {
    // クラス "selected-hunter" をつけ外しする
    if (el.classList.contains('selected-hunter')) {
        el.classList.remove('selected-hunter');
        el.style.border = el.style.backgroundImage ? "none" : "1px solid #999";
        el.style.transform = "scale(1)";
        el.style.boxShadow = "none";
    } else {
        el.classList.add('selected-hunter');
        // 選択時の見た目 (オレンジ色の太枠 + 少し拡大)
        el.style.border = "3px solid #ff9800";
        el.style.transform = "scale(1.1)";
        el.style.boxShadow = "0 0 5px rgba(255, 152, 0, 0.8)";
    }
    
    checkHunterCount(); // ボタン状態更新
}

// 枚数チェック関数
function checkHunterCount() {
    // クラス名で選択されている要素を数える
    let handSel = document.querySelectorAll('#hunter-hand-list .selected-hunter').length;
    let deckSel = document.querySelectorAll('#hunter-deck-list .selected-hunter').length;
    
    let btn = document.getElementById('btn-hunter-exec');
    let msg = document.getElementById('hunter-msg');

    if (handSel > 0 && handSel === deckSel) {
        btn.disabled = false;
        btn.style.background = "#2c684f";
        btn.style.color = "#eff6ff";
        msg.innerText = `OK! (${handSel}枚交換)`;
        msg.style.color = "#7dffc0";
    } else {
        btn.disabled = true;
        btn.style.background = "#4f5966";
        btn.style.color = "#d9ebff";
        if (handSel === 0 && deckSel === 0) {
            msg.innerText = "交換するカードを選んでください";
        } else {
            msg.innerText = `枚数が一致していません (手札:${handSel} vs 山札:${deckSel})`;
        }
        msg.style.color = "#d32f2f";
    }
}

// 実行処理（山札循環・シャッフル追加版）
async function execHunterSwap(isSkip = false) {
    closeModal();
    
    let updates = {};
    let actList = {...(gameState.activatedList || {})};

    if (!isSkip) {
        // 選択された要素を取得
        let handEls = document.querySelectorAll('#hunter-hand-list .selected-hunter');
        let deckEls = document.querySelectorAll('#hunter-deck-list .selected-hunter');

        // インデックスを取り出して降順ソート
        let handIndices = Array.from(handEls).map(el => parseInt(el.dataset.idx)).sort((a,b)=>b-a);
        let deckIndices = Array.from(deckEls).map(el => parseInt(el.dataset.idx)).sort((a,b)=>b-a);

        let hand = sortCards(deepCopy(gameState.hands[myId]));
        let deckSym = [...(gameState.deckSym || [])];
        let excl = [...(gameState.exclusion || [])]; // 今回は使いませんが念のため

        let outNames = [];
        let inNames = [];

        // 1. 手札から出す（山札に戻す）
        handIndices.forEach(idx => {
            let c = hand.splice(idx, 1)[0];
            // excl.push(c); // ← 元の「除外」処理
            deckSym.push(c); // ★変更: 記号山札に追加！
            outNames.push(c.val);
        });

        // 2. 山札から取る
        deckIndices.forEach(idx => {
            let c = deckSym.splice(idx, 1)[0];
            hand.push(c);
            inNames.push(c.val);
        });
        
        // ★追加: 山札の中身が変わったのでシャッフルする
        // (これをしないと、戻したカードが一番下や上に固まってしまうため)
        shuffle(deckSym);

        // 手札を整理
        hand = sortCards(hand);

        updates[`rooms/${currentRoom}/hands/${myId}`] = hand;
        updates[`rooms/${currentRoom}/deckSym`] = deckSym; 
        // updates[`rooms/${currentRoom}/exclusion`] = excl; // 除外場は変わらないので更新不要（またはそのまま更新してもOK）
        
        await pushLog(`${myName}が[狩人]を発動！手札 ${handIndices.length} 枚を記号山札と交換しました。`, 'public');
        await pushLog(`【狩りの成果】<br>使用武器(山札へ): ${outNames.join(', ')}<br>獲物: ${inNames.join(', ')}`, 'private', myId);

    } else {
        await pushLog(`${myName}が[狩人]を発動！交換せずに終了しました。`, 'public');
        await pushLog(`【狩りの成果】<br>なし`, 'private', myId);
    }

    // 共通処理
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    //playSoundEffect('SKILL');
    await db.ref().update(updates);
}

