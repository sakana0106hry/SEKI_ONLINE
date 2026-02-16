        function viewGrave(type) {
            let list;
            let title;
            if (type === 'num') { list = gameState.graveNum; title = "数字墓地"; }
            else if (type === 'sym') { list = gameState.graveSym; title = "記号墓地"; }
            else if (type === 'excl') { list = gameState.exclusion; title = "除外場"; }

            if (!list || list.length === 0) return showInfoModal(title, "空です");
            
            let html = '<div class="modal-list">';
            list.slice().reverse().forEach(c => {
                html += renderCardView(c);
            });
            html += '</div>';
            openModal(title, html);
        }

        // --- Action Logic ---
