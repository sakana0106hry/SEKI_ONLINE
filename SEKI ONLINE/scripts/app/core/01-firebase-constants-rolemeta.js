        const firebaseConfig = {
            apiKey: "AIzaSyBvdLTIWWv_7UCucT_i0Xiy7CgbGoBWUyo",
            authDomain: "seki-online.firebaseapp.com",
            projectId: "seki-online",
            storageBucket: "seki-online.firebasestorage.app",
            messagingSenderId: "196888255072",
            appId: "1:196888255072:web:0aad0ac1ec1d82485d8105",
            measurementId: "G-NV0Q9LB87B"
        };
        
        let db;
        try {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            db = firebase.database();
        } catch(e) { alert("Firebase読込エラー: " + e.message); }

        const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const ASTRONOMER_CHOICES = [2, 3, 4, 5, 6, 7, 8];
        const SYMBOLS = ["REVERSE", "TRADE", "DIG UP", "DISCARD"];
        const SYMBOL_COUNTS = {"REVERSE":4, "TRADE":4, "DIG UP":4, "DISCARD":1};
        // 役職の属性グループ定義
        const ROLE_GROUPS = {
            STRATEGY: ["HACKER", "FORTUNE TELLER", "NECROMANCER", "ASTRONOMER", "POLITICIAN"],
            EFFICIENCY: ["ALCHEMIST", "GAMBLER", "MILLIONAIRE", "HUNTER", "ANGLER"],
            KILLER: ["EMPEROR", "POLICE OFFICER", "THIEF", "CROWN", "AGENT"]
        };
        const ROLE_GROUP_META = {
            STRATEGY: { label: "STRATEGY", cssClass: "role-attr-strategy", colorVar: "var(--seki-s)" },
            EFFICIENCY: { label: "EFFICIENCY", cssClass: "role-attr-efficiency", colorVar: "var(--seki-e)" },
            KILLER: { label: "KILLER", cssClass: "role-attr-killer", colorVar: "var(--seki-k)" }
        };
        const ROLE_TO_GROUP = Object.entries(ROLE_GROUPS).reduce((acc, [groupKey, roleKeys]) => {
            roleKeys.forEach(roleKey => { acc[roleKey] = groupKey; });
            return acc;
        }, {});
        const ROLES = Object.values(ROLE_GROUPS).flat();

        // 【追加】役職の日本語名と簡易説明（表示用）
        // 【修正】役職情報（簡易説明 + 詳細説明）
        const ROLE_INFO = {
            "ALCHEMIST": { 
                jp: "錬金術師", 
                "s-eng": "CON-BERT",
                "s-jp": "非等価交換",
                summary: "数字山札を引き、手札と四則演算して出す",
                desc: `<ol>
<li>数字山札から、1枚カードを引く。</li>
<li>そのカードと、手札の好きな<span style="color: #3598db;"><strong>数字カード</strong></span>で、いずれかの四則演算をする。</li>
<li>その和差積商の下一桁を、数字墓地に出せるとき、出すことができる。</li>
<li>もし出せない場合は、引いたカードは除外され、効果は終了する。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul style="list-style-type: circle;">
<li>差が負の数の場合は絶対値を取る</li>
<li>割り算では、大きい方&divide;小さい方になり、0除算は不可能</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "ASTRONOMER": {
                jp: "天文学者",
                "s-eng": "RE-ORDER",
                "s-jp": "軌道観測",
                summary: "2〜8の1枚を観測し、最強として扱う",
                desc: `<ol>
<li>順行なら「9より強い数字」を、逆行なら「1より強い数字」を、<strong>2〜8</strong>から1つ選び、観測する。</li>
<li>観測中の数字は、全プレイヤーにとって、その時点の強弱階層（順行 or 逆行）で<strong>最強</strong>として扱われる。</li>
<li>観測後、この時点でターン終了。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul style="list-style-type: circle;">
<li>観測中にREVERSEで強弱が逆転すると、当該の数字は観測不可になり<strong>最弱</strong>になる。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "ANGLER": { 
                jp: "釣り師",   
                "s-eng": "PHISH-ING",
                "s-jp": "偽装釣果",
                summary: "手札1枚を除外、墓地から1枚回収",
                desc: `<ol>
<li>自分の手札から好きな<strong>カード</strong>1枚を除外する。</li>
<li>数字墓地もしくは記号墓地から、好きな<strong>カード</strong>1枚を手札に加える。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            },
            "EMPEROR": { 
                jp: "皇帝",     
                "s-eng": "TRICKLE-DOWN",
                "s-jp": "絶対分配",
                summary: "全員の手札を回収し、好きな1枚奪って残りを再配布",
                desc: `<ul style="list-style-type: square;">
<li>ゲーム開始時に自分が「皇帝」であることが他プレイヤー全員に通知される。</li>
</ul>
<ol>
<li>他プレイヤー全員の手札を回収し、見ることができる。</li>
<li>回収した手札から好きな<strong>カード</strong>を1枚選ぶ。</li>
<li>余ったカードが皇帝を含む全員に再配布される（手札の枚数は変わらない）。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            },
            "FORTUNE TELLER": { 
                jp: "占い師",   
                "s-eng": "LCD-IVINE",
                "s-jp": "液晶水晶",
                summary: "全員の手札と役職を見る",
                desc: `<ol>
<li>他プレイヤー全員の手札および役職を自分だけ確認することができる。</li>
<li>このとき確認した結果はログに記録され、いつでも確認することができる。</li>
<li>自分のターンを行う。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            },
            "GAMBLER": { 
                jp: "賭博師",   
                "s-eng": "JACK-POD",
                "s-jp": "天賦之賽",
                summary: "山札の数字を予想し、当たりで最大2枚の手札破棄",
                desc: `<ol>
<li>数字山札の一番上のカードについて、A: 小さい【1, 2, 3, 4】、B: 大きい【6, 7, 8, 9】、C: 命知らず【0, 5】の3つの組から予想する。</li>
<li>演出が入り、数字山札の1番上のカードが明らかになる。</li>
<li>結果により、手札の好きな<strong>カード</strong>を1枚or2枚捨てる、もしくは見た<strong><span style="color: #3598db;">数字カード</span></strong>を手札に加える。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul>
<li>AおよびBを予想した場合、当たったとき自分の手札から好きな<strong>カード</strong>を<strong>1枚</strong>捨てる。</li>
<li>Cを予想した場合、 当たったときは自分の手札から好きな<strong>カード</strong>を<strong>2枚</strong>捨て，外れたときは見た<strong><span style="color: #3598db;">数字カード</span></strong>を手札に加える。</li>
<li>Cの外れ以外では、見たカードは除外される。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "HACKER": { 
                jp: "ハッカー", 
                "s-eng": "LOG-DOWN",
                "s-jp": "記録凍結",
                summary: "全員のカードを1枚だけロックする",
                desc: `<ol>
<li>ハッカーを除く他プレイヤー全員に対し、手札の<strong>カード</strong>1枚を完全にロックする。</li>
<li>自分のターンを行う。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul>
<li>ロックされたカードは、<span style="color: #e03e2d;"><strong>記号カード</strong></span>や<span style="color: #843fa1;"><strong>役職能力</strong></span>などあらゆる効果の対象にならない。</li>
<li>次のハッカーのターンが来たとき、ロックの効果は解除される。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "HUNTER": { 
                jp: "狩人",     
                "s-eng": "LOC-ON",
                "s-jp": "標的補足",
                summary: "記号山札を見て、手札と交換する",
                desc: `<ol>
<li>記号山札を見ることができる。</li>
<li>望むなら、自分の手札から好きな<span style="color: #e03e2d;"><strong>記号カード</strong></span>を、好きな枚数だけ、記号山札から同じ枚数を交換する。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul>
<li>どのような交換を行ったかは、他のプレイヤーからは見えない。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "CROWN": {
                jp: "ピエロ",
                "s-eng": "COPY-RIGHT",
                "s-jp": "模倣特権",
                summary: "DISCARD以外の記号カードの効果を即座に使用",
                desc: `<ol>
<li>DISCARD以外の<span style="color: #e03e2d;"><strong>記号カード</strong></span>の効果を1つだけ即座に使用する。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            },
            "MILLIONAIRE": {
                jp: "億万長者",
                en: "BILLIONAIRE",
                "s-eng": "CASH-FLOW",
                "s-jp": "資産運用",
                summary: "数字カードを2枚まで除外し、その枚数だけ記号カードを引く",
                desc: `<ol>
<li>手札の<span style="color: #3598db;"><strong>数字カード</strong></span>を2枚まで除外する。</li>
<li>除外した枚数だけ、記号山札の一番上の<strong><span style="color: #e03e2d;">記号カード</span></strong>を手札に加える。</li>
<li>自分のターンを行う。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            },
            "POLICE OFFICER": { 
                jp: "警察官",   
                "s-eng": "CONFIS-GATE",
                "s-jp": "一斉検挙",
                summary: "全員の手札を1枚公開し、望むならトレード",
                desc: `<ol>
<li>他のプレイヤー全員に対し、手札の1枚を選んで永続的に表にする。</li>
<li>望むなら、<span style="color: #e03e2d;"><strong>記号カード</strong></span>のTRADEと同じトレードを行うことができる。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul>
<li>プレイヤーの手札間を移動したときも表のまま。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "THIEF": { 
                jp: "盗賊",     
                "s-eng": "STEAL-TH",
                "s-jp": "連続強盗",
                summary: "トレードを2回まで行う",
                desc: `<ol>
<li><strong><span style="color: #e03e2d;">記号カード</span></strong>のTRADEと同じトレードを2回まで行うことができる（1回で終了しても良い）。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul>
<li>同じ相手を対象に行っても良い。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "NECROMANCER": {
                jp: "牧師",
                en: "PRIEST",
                "s-eng": "PURGE-PRAY",
                "s-jp": "霊魂情報化",
                summary: "数字墓地/記号墓地から1枚除外",
                desc: `<ol>
<li>数字墓地もしくは記号墓地の、好きなカード1枚を除外する。</li>
<li>自分のターンを行う。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            },
            "POLITICIAN": {
                jp: "政治家",
                "s-eng": "WHITE-HOUSE",
                "s-jp": "白色防火壁",
                summary: "手札干渉の対象外（記号カード使用で解除）",
                desc: `<ol>
<li>発動すると、手札干渉効果（<span style="color: #e03e2d;"><strong>TRADE</strong></span>、<span style="color: #843fa1;"><strong>ハッカー</strong></span>、<span style="color: #843fa1;"><strong>占い師</strong></span>、<span style="color: #843fa1;"><strong>皇帝</strong></span>、<span style="color: #843fa1;"><strong>警察官</strong><span style="color: #d9ebff;">、</span><strong>盗賊</strong><span style="color: #d9ebff;">、</span><strong>ピエロ</strong><span style="color: #d9ebff;">、</span><strong>工作員</strong></span>）に選択されなくなる。</li>
<li>自分のターンを行う。</li>
</ol>
<ul>
<li style="list-style-type: none;">
<ul style="list-style-type: circle;">
<li>保護効果を受けている間に、自分自身で<span style="color: #e03e2d;"><strong>記号カード</strong></span>（&nbsp;<strong>DISCARD</strong> / <strong>REVERSE</strong> / <strong>TRADE</strong> / <strong>DIG UP）</strong>を使うと、保護は即時解除される。</li>
</ul>
</li>
</ul>
<div><strong>ターン終了！</strong></div>`
            },
            "AGENT": {
                jp: "工作員",
                "s-eng": "T-RAID",
                "s-jp": "攪乱工作",
                summary: "任意の2人の手札をランダムに1枚交換",
                desc: `<ol>
<li>自分を含む任意のプレイヤーから対象を2人を選ぶ。</li>
<li>対象の2人の手札から、ランダムに1枚ずつ交換される。</li>
<li>自分のターンを行う。</li>
</ol>
<div><strong>ターン終了！</strong></div>`
            }
        };

        function getRoleGroup(roleKey) {
            return ROLE_TO_GROUP[roleKey] || null;
        }

        function getRoleAttrClass(roleKey) {
            const groupKey = getRoleGroup(roleKey);
            return (groupKey && ROLE_GROUP_META[groupKey]) ? ROLE_GROUP_META[groupKey].cssClass : "";
        }

        function getRoleChoiceCandidates(groupKey, count = 3, excludes = []) {
            const base = Array.isArray(ROLE_GROUPS[groupKey]) ? [...ROLE_GROUPS[groupKey]] : [];
            const excludedSet = new Set(Array.isArray(excludes) ? excludes : []);
            const pool = base.filter(roleKey => !excludedSet.has(roleKey));
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            const safeCount = Math.max(0, Number(count) || 0);
            return pool.slice(0, safeCount);
        }
        const ROLE_DRAFT_GROUP_ORDER = ["STRATEGY", "EFFICIENCY", "KILLER"];
        const ROLE_DRAFT_PHASE_MS = {
            booting: 2200,
            resolving: 1200,
            reveal_unused: 10000,
            system_online: 2000,
            noise_out: 2000
        };

        function getRoleGroupLabel(groupKey) {
            return (ROLE_GROUP_META[groupKey] && ROLE_GROUP_META[groupKey].label) ? ROLE_GROUP_META[groupKey].label : groupKey;
        }

        function getRoleDisplayName(roleKey) {
            if (!roleKey) return "";
            const info = ROLE_INFO[roleKey];
            return info ? info.jp : roleKey;
        }

        function getRoleDisplayCode(roleKey) {
            if (!roleKey) return "";
            const info = ROLE_INFO[roleKey];
            return (info && info.en) ? info.en : roleKey;
        }

        function sortRoleKeysForDisplay(roleKeys = []) {
            const safe = Array.isArray(roleKeys) ? roleKeys.filter(Boolean) : [];
            return safe.sort((a, b) => {
                const gA = getRoleGroup(a);
                const gB = getRoleGroup(b);
                const groupIdxA = ROLE_DRAFT_GROUP_ORDER.indexOf(gA);
                const groupIdxB = ROLE_DRAFT_GROUP_ORDER.indexOf(gB);
                if (groupIdxA !== groupIdxB) return groupIdxA - groupIdxB;

                const groupRolesA = ROLE_GROUPS[gA] || [];
                const groupRolesB = ROLE_GROUPS[gB] || [];
                const idxA = groupRolesA.indexOf(a);
                const idxB = groupRolesB.indexOf(b);
                if (idxA !== idxB) return idxA - idxB;
                return String(a).localeCompare(String(b));
            });
        }

        function collectPublicUnusedRoles(unusedByPlayer = {}) {
            const uniq = [];
            const seen = new Set();
            Object.values(unusedByPlayer || {}).forEach(list => {
                if (!Array.isArray(list)) return;
                list.forEach(roleKey => {
                    if (!roleKey || seen.has(roleKey)) return;
                    seen.add(roleKey);
                    uniq.push(roleKey);
                });
            });
            return sortRoleKeysForDisplay(uniq);
        }

        function buildRoleDraftChoices(playerIds) {
            const groupPools = {};
            ROLE_DRAFT_GROUP_ORDER.forEach(groupKey => {
                const pool = [...(ROLE_GROUPS[groupKey] || [])];
                shuffle(pool);
                groupPools[groupKey] = pool;
            });

            const choicesByPlayer = {};
            playerIds.forEach(pid => {
                const oneSet = {};
                ROLE_DRAFT_GROUP_ORDER.forEach(groupKey => {
                    const pool = groupPools[groupKey] || [];
                    oneSet[groupKey] = pool.length > 0 ? pool.pop() : null;
                });
                choicesByPlayer[pid] = oneSet;
            });

            return choicesByPlayer;
        }

        function getRoleDraftHostId(data = gameState) {
            if (!data) return null;
            const rd = data.roleDraft || {};
            if (Array.isArray(rd.order) && rd.order.length > 0) return rd.order[0];
            if (Array.isArray(data.playerOrder) && data.playerOrder.length > 0) return data.playerOrder[0];
            const players = data.players || {};
            const sorted = getSortedPlayerIds(players);
            return sorted.length > 0 ? sorted[0] : null;
        }

        function getRoleDraftActivePlayerId(data = gameState) {
            const rd = (data && data.roleDraft) ? data.roleDraft : null;
            if (!rd || !Array.isArray(rd.order) || rd.order.length === 0) return null;
            const idx = Math.max(0, Number(rd.currentIdx) || 0);
            return rd.order[idx] || null;
        }

        function appendLogEntryToState(state, text, type = "public", targetId = null) {
            if (!state) return;
            const logs = Array.isArray(state.logs) ? [...state.logs] : [];
            logs.push({ text, type, targetId, timestamp: Date.now() });
            if (logs.length > 50) logs.splice(0, logs.length - 50);
            state.logs = logs;
        }

