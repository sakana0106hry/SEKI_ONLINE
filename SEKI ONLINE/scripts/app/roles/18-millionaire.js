/* --- MILLIONAIRE (億万長者) の実装 --- */
function activateMillionaire() {
    let hand = gameState.hands[myId] || [];
    let deckSym = gameState.deckSym || [];
    let numTargets = [];

    hand.forEach((c, i) => {
        if (c && c.type === 'num') numTargets.push({ idx: i, card: c });
    });

    if (numTargets.length === 0) return showInfoModal("発動不可", "除外できる数字カードがありません。");
    if (deckSym.length === 0) return showInfoModal("発動不可", "記号山札が空のため、カードを引けません。");

    millionaireSelectedHandIdxs = [];
    millionaireMaxSelectable = Math.min(2, numTargets.length, deckSym.length);
    if (millionaireMaxSelectable <= 0) return showInfoModal("発動不可", "今回の条件では使用できません。");

    let html = `
        <p>
            除外する数字カードを <strong>1〜${millionaireMaxSelectable}枚</strong> 選んでください。<br>
            <span style="font-size:12px; color:#9cb3c9;">※除外した枚数だけ、記号山札からカードを引きます。</span>
        </p>
        <div class="modal-list" style="justify-content:flex-start;">
    `;

    numTargets.forEach(({ idx, card }) => {
        let style = '';
        let cImg = CARD_IMAGES[card.val];
        if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        html += `<div class="card num millionaire-item" data-hand-idx="${idx}" data-card-val="${card.val}" style="${style} cursor:pointer;" onclick="selectMillionaireTarget(${idx}, this)">${card.val}</div>`;
    });

    html += `
        </div>
        <div style="margin-top:12px; text-align:center;">
            <p id="millionaire-msg" style="font-size:12px; color:#9cb3c9; margin:0 0 8px;">
                数字カードを1枚以上選択してください（最大 ${millionaireMaxSelectable}枚）
            </p>
            <button id="btn-millionaire-exec" onclick="execMillionaire()" disabled style="background:#4f5966; color:#d9ebff; padding:10px 30px; font-weight:bold; border-radius:20px; border:1px solid rgba(143,176,214,0.45); cursor:not-allowed;">
                除外して引く
            </button>
        </div>
    `;

    openModal("億万長者: 資産運用", html);
    syncMillionaireSelectionUi();
}

function selectMillionaireTarget(handIdx, el) {
    if (!Number.isInteger(handIdx) || handIdx < 0) return;
    const hand = (gameState && gameState.hands && gameState.hands[myId]) ? gameState.hands[myId] : [];
    const card = hand[handIdx];
    if (!card || card.type !== 'num') return;

    const currentIdx = millionaireSelectedHandIdxs.indexOf(handIdx);
    if (currentIdx >= 0) {
        millionaireSelectedHandIdxs.splice(currentIdx, 1);
    } else {
        if (millionaireSelectedHandIdxs.length >= millionaireMaxSelectable) {
            syncMillionaireSelectionUi();
            return;
        }
        millionaireSelectedHandIdxs.push(handIdx);
    }

    if (el && el.classList) {
        if (millionaireSelectedHandIdxs.includes(handIdx)) el.classList.add('selected');
        else el.classList.remove('selected');
    }
    syncMillionaireSelectionUi();
}

function syncMillionaireSelectionUi() {
    const msgEl = document.getElementById('millionaire-msg');
    const btnEl = document.getElementById('btn-millionaire-exec');
    const selectedSet = new Set(millionaireSelectedHandIdxs);
    const hasReachedLimit = millionaireSelectedHandIdxs.length >= millionaireMaxSelectable;

    const items = document.querySelectorAll('#modal-content .millionaire-item');
    items.forEach(item => {
        const idx = Number(item.dataset.handIdx);
        const isSelected = selectedSet.has(idx);
        item.classList.toggle('selected', isSelected);

        if (!isSelected && hasReachedLimit) {
            item.style.opacity = '0.45';
            item.style.cursor = 'not-allowed';
            item.style.filter = 'grayscale(20%)';
        } else {
            item.style.opacity = '1';
            item.style.cursor = 'pointer';
            item.style.filter = '';
        }
    });

    if (msgEl) {
        if (millionaireSelectedHandIdxs.length === 0) {
            msgEl.innerText = `数字カードを1枚以上選択してください（最大 ${millionaireMaxSelectable}枚）`;
            msgEl.style.color = '#9cb3c9';
        } else {
            const selectedCards = millionaireSelectedHandIdxs
                .map(idx => {
                    const el = document.querySelector(`#modal-content .millionaire-item[data-hand-idx="${idx}"]`);
                    return el ? `[${el.dataset.cardVal}]` : '[?]';
                })
                .join(' ');
            msgEl.innerText = `選択中: ${selectedCards} (${millionaireSelectedHandIdxs.length}/${millionaireMaxSelectable})`;
            msgEl.style.color = '#d9ebff';
        }
    }

    if (btnEl) {
        const canExec = millionaireSelectedHandIdxs.length > 0;
        btnEl.disabled = !canExec;
        if (canExec) {
            btnEl.style.background = '#2e7d32';
            btnEl.style.color = '#fff';
            btnEl.style.border = '1px solid #8dc8e9';
            btnEl.style.cursor = 'pointer';
        } else {
            btnEl.style.background = '#4f5966';
            btnEl.style.color = '#d9ebff';
            btnEl.style.border = '1px solid rgba(143,176,214,0.45)';
            btnEl.style.cursor = 'not-allowed';
        }
    }
}

async function execMillionaire() {
    let selectedIdxs = Array.isArray(millionaireSelectedHandIdxs) ? [...millionaireSelectedHandIdxs] : [];
    if (selectedIdxs.length === 0) {
        return showInfoModal("エラー", "除外する数字カードを選択してください。");
    }

    closeModal();

    let updates = {};
    let hand = deepCopy(gameState.hands[myId] || []);
    let deckSym = [...(gameState.deckSym || [])];
    let excl = [...(gameState.exclusion || [])];
    let actList = {...(gameState.activatedList || {})};

    const numCount = hand.filter(c => c && c.type === 'num').length;
    const maxSelectable = Math.min(2, numCount, deckSym.length);
    if (selectedIdxs.length < 1 || selectedIdxs.length > maxSelectable) {
        return showInfoModal("エラー", "選択枚数が不正です。再度選択してください。");
    }

    let uniqIdxs = [...new Set(selectedIdxs)];
    if (uniqIdxs.length !== selectedIdxs.length) {
        return showInfoModal("エラー", "同じカードが重複して選択されています。再度選択してください。");
    }

    for (let i = 0; i < uniqIdxs.length; i++) {
        const idx = uniqIdxs[i];
        if (!Number.isInteger(idx) || idx < 0 || idx >= hand.length) {
            return showInfoModal("エラー", "選択されたカード位置が不正です。再度選択してください。");
        }
        if (!hand[idx] || hand[idx].type !== 'num') {
            return showInfoModal("エラー", "数字カード以外が選択されています。再度選択してください。");
        }
    }

    uniqIdxs.sort((a, b) => b - a);
    let excludedCards = [];
    uniqIdxs.forEach(idx => {
        let excluded = hand.splice(idx, 1)[0];
        if (excluded) {
            excl.push(excluded);
            excludedCards.unshift(excluded);
        }
    });

    let drawnCards = [];
    for (let i = 0; i < excludedCards.length; i++) {
        let drawn = deckSym.pop();
        if (!drawn) {
            return showInfoModal("エラー", "記号山札の枚数が不足しました。再度選択してください。");
        }
        hand.push(drawn);
        drawnCards.push(drawn);
    }
    hand = sortCards(hand);

    updates[`rooms/${currentRoom}/hands/${myId}`] = hand;
    updates[`rooms/${currentRoom}/deckSym`] = deckSym;
    updates[`rooms/${currentRoom}/exclusion`] = excl;
    updates[`rooms/${currentRoom}/lastSound`] = { type: 'PUT', id: Date.now() };

    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    const exclText = excludedCards.map(c => `[${c.val}]`).join(' ');
    const drawText = drawnCards.map(c => `[${c.val}]`).join(' ');
    await pushLog(`${myName}が[億万長者]を発動！数字カード ${exclText} を除外し、記号カードを${drawnCards.length}枚引きました`, 'public');
    await pushLog(`【億万長者の資産運用】引いたカード: ${drawText}`, 'private', myId);

    await db.ref().update(updates);
    millionaireSelectedHandIdxs = [];
    millionaireMaxSelectable = 1;
}

