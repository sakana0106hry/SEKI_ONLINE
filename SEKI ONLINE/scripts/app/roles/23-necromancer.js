/* --- NECROMANCER (ネクロマンサー) の実装 --- */

// 1. 発動確認
function activateNecromancer() {
    let gn = gameState.graveNum || [];
    let gs = gameState.graveSym || [];

    // 墓地チェック
    if (gn.length === 0 && gs.length === 0) {
        return showInfoModal("発動不可", "数字墓地・記号墓地ともにカードがないため、除外できません。");
    }

    necromancerTargetType = null;
    necromancerTargetIdx = -1;

    let html = `
        <p>除外するカードを1枚選んでください。<br>
        <span style="font-size:12px; color:#ef5350;">※除外した後、あなたのターンが続きます。</span>
        </p>

        <div style="margin-top:10px; text-align:left;"><strong>数字墓地</strong></div>
        <div class="modal-list" style="justify-content:flex-start;">
    `;

    if (gn.length > 0) {
        for (let i = gn.length - 1; i >= 0; i--) {
            let c = gn[i];
            let style = "";
            let cImg = CARD_IMAGES[c.val];
            if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;

            if (i === gn.length - 1) {
                html += `
                    <div style="position:relative; display:inline-block;">
                        <div class="card num necromancer-item" data-card-val="${c.val}" style="${style}" onclick="selectNecromancerTarget('num', ${i}, this)">${c.val}</div>
                        <span style="position:absolute; top:-8px; right:-6px; background:#3b2b08; color:#ffd778; font-size:12px; font-weight:bold; padding:1px 5px; border-radius:10px; border:1px solid #7a6230;">TOP</span>
                    </div>
                `;
            } else {
                html += `<div class="card num necromancer-item" data-card-val="${c.val}" style="${style}" onclick="selectNecromancerTarget('num', ${i}, this)">${c.val}</div>`;
            }
        }
        html += `<div class="modal-note warn" style="width:100%; margin-top:2px;">※TOP が数字墓地の一番上です</div>`;
    } else {
        html += `<button class="modal-btn is-disabled" disabled>数字墓地は空です</button>`;
        html += `<span class="modal-note">※記号墓地から選んでください。</span>`;
    }
    html += `</div>`;

    html += `
        <div style="margin-top:10px; text-align:left;"><strong>記号墓地</strong></div>
        <div class="modal-list" style="justify-content:flex-start;">
    `;

    if (gs.length > 0) {
        for (let i = gs.length - 1; i >= 0; i--) {
            let c = gs[i];
            let style = "";
            let cImg = CARD_IMAGES[c.val];
            if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
            html += `<div class="card sym necromancer-item" data-card-val="${c.val}" style="${style}" onclick="selectNecromancerTarget('sym', ${i}, this)">${c.val}</div>`;
        }
    } else {
        html += `<button class="modal-btn is-disabled" disabled>記号墓地は空です</button>`;
        html += `<span class="modal-note">※数字墓地から選んでください。</span>`;
    }
    html += `</div>`;

    html += `
        <div style="margin-top:12px; text-align:center;">
            <p id="necromancer-msg" style="font-size:12px; color:#9cb3c9; margin:0 0 8px;">カードを1枚選択してください</p>
            <button id="btn-necromancer-exec" onclick="execNecromancer()" disabled style="background:#4f5966; color:#d9ebff; padding:10px 30px; font-weight:bold; border-radius:20px; border:1px solid rgba(143,176,214,0.45); cursor:not-allowed;">
                除外を実行
            </button>
        </div>
        <p style="font-size:12px; color:#9cb3c9; margin-top:10px;">※選択後に「除外を実行」を押してください。</p>
    `;

    openModal("牧師: 霊魂浄化", html);
}

function selectNecromancerTarget(targetType, targetIdx, el) {
    if (targetType !== 'num' && targetType !== 'sym') return;
    if (!Number.isInteger(targetIdx) || targetIdx < 0) return;

    let items = document.querySelectorAll('#modal-content .necromancer-item');
    items.forEach(item => item.classList.remove('selected'));
    if (el && el.classList) el.classList.add('selected');

    necromancerTargetType = targetType;
    necromancerTargetIdx = targetIdx;

    let msg = document.getElementById('necromancer-msg');
    if (msg) {
        let zone = (targetType === 'num') ? '数字墓地' : '記号墓地';
        let val = (el && el.dataset && el.dataset.cardVal !== undefined) ? el.dataset.cardVal : '?';
        msg.innerText = `選択中: ${zone} [${val}]`;
        msg.style.color = '#d9ebff';
    }

    let btn = document.getElementById('btn-necromancer-exec');
    if (btn) {
        btn.disabled = false;
        btn.style.background = '#4a148c';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #8dc8e9';
        btn.style.cursor = 'pointer';
    }
}

// 2. 実行処理
async function execNecromancer() {
    let targetType = necromancerTargetType;
    let targetIdx = necromancerTargetIdx;

    if (targetType !== 'num' && targetType !== 'sym') {
        return showInfoModal("エラー", "除外するカードを選択してください。");
    }
    if (!Number.isInteger(targetIdx) || targetIdx < 0) {
        return showInfoModal("エラー", "除外するカードを選択してください。");
    }

    closeModal();
    let updates = {};

    // 最新の墓地データを取得
    let gn = [...(gameState.graveNum || [])];
    let gs = [...(gameState.graveSym || [])];
    let excl = [...(gameState.exclusion || [])];
    let actList = {...(gameState.activatedList || {})};

    // 念のため再チェック（UIすり抜け防止）
    if (targetType !== 'num' && targetType !== 'sym') {
        return showInfoModal("エラー", "除外対象の種類が不正です。");
    }
    if (!Number.isInteger(targetIdx) || targetIdx < 0) {
        return showInfoModal("エラー", "除外対象の指定が不正です。");
    }

    let removedCard = null;
    let fromLabel = "";
    if (targetType === 'num') {
        if (targetIdx >= gn.length) return showInfoModal("エラー", "選択したカードが見つかりません。再度選択してください。");
        removedCard = gn.splice(targetIdx, 1)[0];
        updates[`rooms/${currentRoom}/graveNum`] = gn;
        fromLabel = "数字墓地";
    } else {
        if (targetIdx >= gs.length) return showInfoModal("エラー", "選択したカードが見つかりません。再度選択してください。");
        removedCard = gs.splice(targetIdx, 1)[0];
        updates[`rooms/${currentRoom}/graveSym`] = gs;
        fromLabel = "記号墓地";
    }

    // 除外場へ
    excl.push(removedCard);

    // データ更新
    updates[`rooms/${currentRoom}/exclusion`] = excl;

    // スキル使用済みにする
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    // ログ
    await pushLog(`${myName}が[牧師]を発動！${fromLabel}の [${removedCard.val}] を浄化して除外しました`, 'public');
    // 音は activatedList の変化をトリガーにカットイン側で再生する（重複再生防止）

    /* ★重要: ターンを進める処理（turnIdxの更新）は書きません。
       これにより、まだ自分のターン（playCardができる状態）が維持されます。
    */

    await db.ref().update(updates);
    necromancerTargetType = null;
    necromancerTargetIdx = -1;
}

