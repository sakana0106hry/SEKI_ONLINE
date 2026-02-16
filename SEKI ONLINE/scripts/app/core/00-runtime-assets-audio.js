        // エラー抑制
        window.onerror = function(msg) { 
            // execPassResetのエラー無視行を削除しました
            showInfoModal("システムエラー", msg); 
        };

        const CARD_IMAGES = {
            "TRADE": "./images/trade.png",
            "DIG UP": "./images/dig up.png",
            "DISCARD": "./images/discard.png",
            "REVERSE": "./images/reverse.png",
        };

        // 役職画像の定義（ここに追加していく）
        const ROLE_IMAGES = {
        "ANGLER": "./images/angler.png",
        "FORTUNE TELLER": "./images/fortuneteller.png",
        "THIEF": "./images/thief.png",
        "HUNTER": "./images/hunter.png",
        "GAMBLER": "./images/gambler.png",
        "CROWN": "./images/crown.png",
        "MILLIONAIRE": "./images/billionaire.png",
        "EMPEROR": "./images/emperor.png",
        "HACKER": "./images/hacker.png",
        "POLITICIAN": "./images/politician.png",
        "POLICE OFFICER": "./images/policeofficer.png",
        "ALCHEMIST": "./images/alchemist.png",
        "NECROMANCER": "./images/priest.png",
        "AGENT": "./images/agent.png",
        "ASTRONOMER": "./images/astronomer.png",
        //他もあれば追加
        };

        const IMAGE_FILES = [
            "./images/agent.png",
            "./images/alchemist.png",
            "./images/angler.png",
            "./images/astronomer.png",
            "./images/crown.png",
            "./images/dig up.png",
            "./images/discard.png",
            "./images/emperor.png",
            "./images/fortuneteller.png",
            "./images/gambler.png",
            "./images/hacker.png",
            "./images/hunter.png",
            "./images/billionaire.png",
            "./images/new_logo.png",
            "./images/policeofficer.png",
            "./images/politician.png",
            "./images/priest.png",
            "./images/reverse.png",
            "./images/reverse_blue.jpg",
            "./images/reverse_red.jpg",
            "./images/thief.png",
            "./images/trade.png"
        ];

        /* --- 音声ファイルの登録 --- */
        const SOUND_FILES = {
            // 賭博師用
            'DRUM': './sounds/drum.mp3',         // ドラムロール
            'WIN_NORMAL': './sounds/win.mp3',    // 普通の当たり
            'WIN_BIG': './sounds/win_big.mp3',   // 大当たり！
            'LOSE': './sounds/lose.mp3',          // 負け...
            // BGM
            'BGM_LOBBY': './sounds/bgm_lobby.mp3',
            'BGM_BATTLE': './sounds/bgm_battle.mp3',
            'BGM_CHOICE': './sounds/bgm_choice.mp3',
            // システム通知
            'turn':    './sounds/turn.mp3',  // 自分の番
            'chat':    './sounds/chat.mp3',  // チャット受信
            'JOIN': './sounds/join.mp3',
            'BOOTING': './sounds/booting.mp3',
            'CONFIRM': './sounds/confirm.mp3',
            'SYSTEM_ONLINE': './sounds/systemonline.mp3',
            'GAME_START': './sounds/gamestart.mp3',
            'WARNING': './sounds/warning.mp3', // トレードの被害
            'DOS': './sounds/dos.mp3',
            'UNO': './sounds/uno.mp3',
            // 順位決定音
            'RANK_1':     './sounds/winner.mp3',  // 1位
            'RANK_2_3':   './sounds/normal.mp3',  // 2位・3位
            'RANK_4':     './sounds/loser.mp3',  // 4位（最下位）

            // カードアクション
            'PUT':     './sounds/put.mp3',
            'REVERSE': './sounds/reverse.mp3',
            'TRADE':   './sounds/trade.mp3',
            'DIG UP':  './sounds/digup.mp3',
            'DISCARD': './sounds/discard.mp3',
            'RESET': './sounds/reset.mp3',
            // 役職発動音
            'SKILL': './sounds/skill_default.mp3',
            'SKILL_ANGLER': "./sounds/skill_angler.mp3",
            'SKILL_FORTUNE TELLER': "./sounds/skill_fortuneteller.mp3",
            'SKILL_THIEF': "./sounds/skill_thief.mp3",
            'SKILL_HUNTER': "./sounds/skill_hunter.mp3",
            'SKILL_GAMBLER': "./sounds/skill_gambler.mp3",
            'SKILL_CROWN': "./sounds/skill_crown.mp3",
            'SKILL_MILLIONAIRE': "./sounds/skill_billionaire.mp3",
            'SKILL_EMPEROR': "./sounds/skill_emperor.mp3",
            'SKILL_HACKER': "./sounds/skill_hacker.mp3",
            'SKILL_POLITICIAN': "./sounds/skill_politician.mp3",
            'SKILL_POLICE OFFICER': "./sounds/skill_policeofficer.mp3",
            'SKILL_ALCHEMIST': "./sounds/skill_alchemist.mp3",
            'SKILL_NECROMANCER': "./sounds/skill_priest.mp3",
            'SKILL_AGENT': "./sounds/skill_agent.mp3",
            'SKILL_ASTRONOMER': "./sounds/skill_astronomer.mp3",
            // カットイン属性音
            'CUTIN_STRATEGY': "./sounds/strategy.mp3",
            'CUTIN_EFFICIENCY': "./sounds/efficiency.mp3",
            'CUTIN_KILLER': "./sounds/killer.mp3",
        };
        // 音量テーブル（0.0〜1.0）
        // ここにキーを追加すると個別調整できます
        const SOUND_VOLUMES = {
            defaultSfx: 0.6,
            defaultBgm: 0.08,
            // 例:
            SKILL_EMPEROR: 0.5,
            SKILL_AGENT: 0.8,
            SKILL_ASTRONOMER: 0.45,
            SKILL_POLICE_OFFICER: 0.4,
            SKILL_PRIEST: 0.2,
            SYSTEM_ONLINE: 0.2,
            // DRUM: 0.4,
            // BGM_BATTLE: 0.06,
        };

        function getSoundVolume(type, fallback) {
            const v = (SOUND_VOLUMES && SOUND_VOLUMES[type] !== undefined)
                ? SOUND_VOLUMES[type]
                : fallback;
            return Math.max(0, Math.min(1, Number(v)));
        }
        
        /* ===============================================
           iPhone対応版 音声システム (Web Audio API)
           =============================================== */
        
        // 1. オーディオシステムの本体
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        
        // 2. 読み込んだ音声データを貯めておく場所
        const audioBuffers = {};

        // 3. BGM管理用
        let bgmSource = null;
        let bgmGainNode = null;
        let isBgmMuted = false;
        let currentBgmType = null;
        const preloadedImageUrls = new Set();

        // 音声ファイルをロードしてデコードする関数
        async function loadSound(key) {
            // すでに読み込み済みなら何もしない
            if (audioBuffers[key]) return audioBuffers[key];

            const url = SOUND_FILES[key];
            if (!url) return null;

            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                audioBuffers[key] = decodedBuffer;
                return decodedBuffer;
            } catch (e) {
                console.warn(`音声読み込み失敗: ${key}`, e);
                return null;
            }
        }

        function preloadImage(url) {
            if (!url) return Promise.resolve();
            if (preloadedImageUrls.has(url)) return Promise.resolve();

            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    preloadedImageUrls.add(url);
                    resolve();
                };
                img.onerror = () => reject(new Error(`画像読み込み失敗: ${url}`));
                img.src = url;
            });
        }

        function buildPreloadTargets() {
            const soundTargets = Object.keys(SOUND_FILES).map(key => ({
                kind: "sound",
                key,
                url: SOUND_FILES[key],
                label: `sound:${key}`
            }));
            const imageTargets = IMAGE_FILES.map(url => ({
                kind: "image",
                key: url,
                url,
                label: `image:${url}`
            }));
            return soundTargets.concat(imageTargets);
        }

        async function preloadAllAssets(options = {}) {
            const onProgress = (typeof options.onProgress === "function")
                ? options.onProgress
                : () => {};

            const sourceTargets = (Array.isArray(options.targets) && options.targets.length > 0)
                ? options.targets
                : buildPreloadTargets();

            const targets = sourceTargets.map(t => ({
                kind: t.kind,
                key: t.key,
                url: t.url,
                label: t.label || (t.kind === "sound" ? `sound:${t.key}` : `image:${t.url}`)
            }));

            const total = targets.length;
            const concurrency = Math.max(1, Number(options.concurrency) || 4);
            const workerCount = Math.min(concurrency, Math.max(total, 1));

            let loaded = 0;
            let failedCount = 0;
            let cursor = 0;
            const failed = [];

            const emitProgress = (currentLabel) => {
                const percent = total > 0 ? Math.round((loaded / total) * 100) : 100;
                onProgress({
                    loaded,
                    total,
                    percent,
                    currentLabel: currentLabel || "",
                    failedCount
                });
            };

            emitProgress(total > 0 ? "開始準備中..." : "完了");

            async function runWorker() {
                while (true) {
                    const currentIndex = cursor;
                    cursor += 1;
                    if (currentIndex >= total) return;

                    const target = targets[currentIndex];
                    try {
                        if (target.kind === "sound") {
                            const buf = await loadSound(target.key);
                            if (!buf) throw new Error(`音声デコード失敗: ${target.key}`);
                        } else {
                            await preloadImage(target.url);
                        }
                    } catch (err) {
                        failedCount += 1;
                        failed.push({
                            kind: target.kind,
                            key: target.key,
                            url: target.url,
                            label: target.label,
                            reason: err && err.message ? err.message : String(err)
                        });
                    } finally {
                        loaded += 1;
                        emitProgress(target.label);
                    }
                }
            }

            const workers = [];
            for (let i = 0; i < workerCount; i++) workers.push(runWorker());
            await Promise.all(workers);

            emitProgress("完了");

            return { loaded, total, failed };
        }

        /* --- 再生関数 (効果音用) --- */
        async function playSoundEffect(type) {
            // 1. コンテキストが無効なら再開を試みる
            if (audioCtx.state === 'suspended') audioCtx.resume();

            // 2. データを取得 (なければ今ロードする)
            let buffer = audioBuffers[type];
            if (!buffer) {
                buffer = await loadSound(type);
                if (!buffer) return;
            }

            // 3. 音源作成
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;

            // 4. 音量調整 (iPhoneでも効きます)
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = getSoundVolume(type, SOUND_VOLUMES.defaultSfx); // 効果音の音量 (0.0〜1.0)

            // 5. 接続: Source -> Gain -> Speaker
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            // 6. 再生
            source.start(0);
        }

        /* --- BGM再生関数 (音量調整対応) --- */
        async function playBgm(type) {
            // 同じ曲なら何もしない
            if (currentBgmType === type && bgmSource) return;

            // 前の曲を止める
            stopBgm();

            if (isBgmMuted) {
                currentBgmType = type; // タイプだけ覚えておく（ミュート解除時に再生するため）
                return; 
            }

            // データを準備
            let buffer = audioBuffers[type];
            if (!buffer) {
                buffer = await loadSound(type);
                if (!buffer) return;
            }

            // BGM用ソース作成
            bgmSource = audioCtx.createBufferSource();
            bgmSource.buffer = buffer;
            bgmSource.loop = true;

            // BGM用音量ノード
            bgmGainNode = audioCtx.createGain();
            // キー別設定があればそれを使用、なければデフォルト
            bgmGainNode.gain.value = getSoundVolume(type, SOUND_VOLUMES.defaultBgm);

            // 接続
            bgmSource.connect(bgmGainNode);
            bgmGainNode.connect(audioCtx.destination);

            // 再生
            bgmSource.start(0);
            currentBgmType = type;
        }

        function stopBgm() {
            if (bgmSource) {
                try { bgmSource.stop(); } catch(e){}
                bgmSource = null;
            }
            bgmGainNode = null;
            currentBgmType = null;
        }

        function toggleBgmMute() {
            isBgmMuted = !isBgmMuted;
            const btn = document.getElementById('btn-bgm-toggle');
            
            if (isBgmMuted) {
                btn.innerText = "🔇";
                stopBgm(); // 停止
                // タイプは保持しておかないと再開できないので、stopBgmで消えた分を戻す工夫が必要ですが、
                // 簡易的に「今の状態(gameState)」を見て再判定するのが確実です。
            } else {
                btn.innerText = "🔊";
                // 再開処理
                if (gameState && gameState.status === 'playing') playBgm('BGM_BATTLE');
                else if (gameState && gameState.status === 'role_selecting') playBgm('BGM_CHOICE');
                else playBgm('BGM_LOBBY');
            }
        }

        /* --- iPhone用のロック解除 (サイレント版) --- */
        function unlockAudioContext() {
            // 1. システムが停止中なら再開
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            // 2. 「無音」のバッファを一瞬再生して、再生権限を獲得する
            // (実際の音声ファイルは使いません)
            const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
            const source = audioCtx.createBufferSource();
            source.buffer = emptyBuffer;
            source.connect(audioCtx.destination);
            source.start(0);

        }
                
