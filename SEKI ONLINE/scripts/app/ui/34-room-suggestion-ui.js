        function setRoomSuggestionVisible(visible) {
            if (!els.roomSuggestion) return;
            if (visible) els.roomSuggestion.classList.remove("hidden");
            else els.roomSuggestion.classList.add("hidden");
        }

        function stopRoomSuggestionPolling() {
            if (roomSuggestionTimer !== null) {
                clearInterval(roomSuggestionTimer);
                roomSuggestionTimer = null;
            }
        }

        function renderRoomSuggestions(list) {
            if (!els.roomSuggestion || !els.roomName) return;

            const filterText = els.roomName.value.trim().toLowerCase();
            const filtered = list.filter(item =>
                !filterText || item.name.toLowerCase().includes(filterText)
            );

            els.roomSuggestion.innerHTML = "";

            const title = document.createElement("div");
            title.className = "room-suggestion-title";
            title.innerText = "Current Rooms";
            els.roomSuggestion.appendChild(title);

            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.className = "room-suggestion-empty";
                empty.innerText = "No matching rooms";
                els.roomSuggestion.appendChild(empty);
                return;
            }

            filtered.slice(0, 20).forEach((item) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "room-suggestion-item";
                btn.innerText = `${item.name} (${item.count}/${ROOM_CAPACITY})`;
                btn.addEventListener("mousedown", (ev) => {
                    ev.preventDefault();
                    els.roomName.value = item.name;
                    setRoomSuggestionVisible(false);
                    stopRoomSuggestionPolling();
                    if (els.playerName) els.playerName.focus();
                });
                els.roomSuggestion.appendChild(btn);
            });
        }

        async function refreshRoomSuggestions() {
            if (!db || !els.roomSuggestion || !els.roomName || currentRoom) return;
            try {
                const snapshot = await db.ref("rooms").get();
                const rooms = snapshot.val() || {};

                roomSuggestionCache = Object.entries(rooms)
                    .map(([name, data]) => {
                        const players = (data && data.players) ? data.players : {};
                        return { name, count: Object.keys(players).length };
                    })
                    .filter(item => !!item.name)
                    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, "ja"));

                renderRoomSuggestions(roomSuggestionCache);
            } catch (e) {
                els.roomSuggestion.innerHTML = `
                    <div class="room-suggestion-title">Current Rooms</div>
                    <div class="room-suggestion-empty">Failed to load room list</div>
                `;
            }
        }

        function startRoomSuggestionPolling() {
            if (roomSuggestionTimer !== null || currentRoom) return;
            refreshRoomSuggestions();
            roomSuggestionTimer = setInterval(refreshRoomSuggestions, 5000);
        }

        function setupRoomSuggestionEvents() {
            if (!els.roomName || !els.roomSuggestion) return;

            els.roomName.addEventListener("focus", () => {
                setRoomSuggestionVisible(true);
                if (roomSuggestionCache.length > 0) renderRoomSuggestions(roomSuggestionCache);
                startRoomSuggestionPolling();
            });

            els.roomName.addEventListener("click", () => {
                setRoomSuggestionVisible(true);
                if (roomSuggestionCache.length > 0) renderRoomSuggestions(roomSuggestionCache);
                startRoomSuggestionPolling();
            });

            els.roomName.addEventListener("input", () => {
                setRoomSuggestionVisible(true);
                if (roomSuggestionCache.length > 0) renderRoomSuggestions(roomSuggestionCache);
                else refreshRoomSuggestions();
            });

            els.roomName.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") {
                    setRoomSuggestionVisible(false);
                    stopRoomSuggestionPolling();
                }
            });

            document.addEventListener("mousedown", (ev) => {
                if (!els.roomSuggestion || els.roomSuggestion.classList.contains("hidden")) return;
                if (ev.target === els.roomName || els.roomSuggestion.contains(ev.target)) return;
                setRoomSuggestionVisible(false);
                stopRoomSuggestionPolling();
            });
        }

        setupRoomSuggestionEvents();

