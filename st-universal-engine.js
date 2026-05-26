(function() {
    'use strict';

    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ST API: Missing Config");
        return; 
    }

    const API_HOST = "https://app.sitegeeky.com/football-api";
    const API_TOKEN = window.stSportsConfig.token;
    const CLIENT_DOMAIN = window.stSportsConfig.domain;

    let sseScheduleSource = null;

    // تمزيق النتيجة وضبطها LTR (الفريق 1 يمين، الفريق 2 يسار)
    function formatScore(scoreStr) {
        if (!scoreStr || scoreStr.trim() === '' || scoreStr === 'null') return null;
        const parts = scoreStr.split('-');
        if (parts.length === 2) {
            return `<span>${parts[0].trim()}</span> <span style="font-weight:normal; opacity:0.7;">-</span> <span>${parts[1].trim()}</span>`;
        }
        return scoreStr;
    }

    // تحويل الوقت إلى 12 ساعة محلي
    function getLocalTime12H(utcDateStr) {
        if (!utcDateStr) return "VS";
        const d = new Date(utcDateStr);
        return d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    function initSchedule() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        // استهداف الأزرار بالكلاس الموحد الجديد
        const tabButtons = scheduleApp.querySelectorAll('.stk-tab-btn');

        function fetchMatches(dateKeyword) { 
            if (sseScheduleSource) sseScheduleSource.close();

            scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--stk-muted);"><i class="fas fa-circle-notch fa-spin fa-2x" style="color:var(--stk-primary);"></i><p style="margin-top:10px; font-weight:bold;">جاري جلب المباريات...</p></div>';

            const fetchUrl = `${API_HOST}/matches?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${dateKeyword}`;

            fetch(fetchUrl, { cache: "no-store" })
                .then(res => res.json())
                .then(response => {
                    let matches = (response.success && response.data) ? response.data : (Array.isArray(response) ? response : []);
                    
                    if (matches.length === 0) {
                        scheduleContent.innerHTML = '<div style="padding:50px; text-align:center; font-weight:bold; color:var(--stk-muted);">لا توجد مباريات متاحة في هذا اليوم.</div>';
                        return;
                    }

                    buildMatchesDOM(matches, scheduleContent);

                    // التحديث الحي فقط لتبويب اليوم
                    if (dateKeyword === 'today') {
                        const sseUrl = `${API_HOST}/sse?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}`;
                        sseScheduleSource = new EventSource(sseUrl);

                        sseScheduleSource.addEventListener('update', function(event) {
                            try {
                                const liveData = JSON.parse(event.data);
                                const liveMatches = Array.isArray(liveData) ? liveData : (liveData.data ? liveData.data : []);
                                updateLiveScores(liveMatches);
                            } catch(e) {}
                        });
                    }
                })
                .catch(err => {
                    scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--stk-ended); font-weight:bold;">تعذر الاتصال بخادم المباريات.</div>';
                });
        }

        tabButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.classList.contains('active')) return;
                tabButtons.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                fetchMatches(this.getAttribute('data-date'));
            });
        });

        // تشغيل مباريات اليوم
        fetchMatches("today");
    }

    function buildMatchesDOM(matches, container) {
        const leaguesGroup = {};
        matches.forEach(match => {
            const leagueName = match.league || "بطولات متنوعة";
            if (!leaguesGroup[leagueName]) leaguesGroup[leagueName] = [];
            leaguesGroup[leagueName].push(match);
        });

        let DOMHtml = '';
        for (const [leagueName, leagueMatches] of Object.entries(leaguesGroup)) {
            const leagueLogo = leagueMatches[0].league_logo || "https://img.btolat.com/teamslogo/default.png";
            
            DOMHtml += `
                <div>
                    <div class="stk-league">
                        <img src="${leagueLogo}" onerror="this.style.display='none'">
                        <span>${leagueName}</span>
                    </div>`;

            leagueMatches.forEach(m => {
                const hasScore = (m.score && m.score.trim() !== '' && m.score !== 'null');
                const scoreDisplay = hasScore ? formatScore(m.score) : getLocalTime12H(m.date);
                
                let statusText = m.status || 'لم تبدأ';
                let statusClass = 'stk-status';
                let timerHtml = '';

                if (statusText.includes('مباشر') || statusText.includes('شوط') || statusText.includes('إضافي')) {
                    statusClass += ' live';
                    if (m.timer && m.timer !== 'null') {
                        timerHtml = `<span class="stk-timer">${m.timer}'</span>`;
                    }
                } else if (statusText === 'انتهت') {
                    statusClass += ' ended';
                }

                const stadiumDisplay = m.stadium ? `🏟️ ${m.stadium}` : '';
                const channelDisplay = (m.channels && m.channels.length > 0) ? `📺 ${m.channels[0]}` : '';

                const bridgePayload = encodeURIComponent(JSON.stringify({ t1: m.team1, t2: m.team2, l1: m.team1_logo, l2: m.team2_logo, lg: leagueName, st: m.stadium }));

                DOMHtml += `
                    <a href="/p/match.html?match_id=${m.match_id}" class="stk-match" id="match-row-${m.match_id}" onclick="localStorage.setItem('st_match_bridge', decodeURIComponent('${bridgePayload}'))">
                        
                        <div class="stk-team home">
                            <span>${m.team1}</span>
                            <img src="${m.team1_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                        </div>
                        
                        <div class="stk-center">
                            <div class="stk-score" id="score-${m.match_id}" dir="ltr">${scoreDisplay}</div>
                            
                            <div class="${statusClass}" id="status-wrap-${m.match_id}">
                                <span id="timer-${m.match_id}">${timerHtml}</span>
                                <span id="status-${m.match_id}">${statusText}</span>
                            </div>
                            
                            <div class="stk-extra">
                                <span style="display:block;">${stadiumDisplay}</span>
                                <span style="display:block;">${channelDisplay}</span>
                            </div>
                        </div>
                        
                        <div class="stk-team away">
                            <img src="${m.team2_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T2'">
                            <span>${m.team2}</span>
                        </div>
                    </a>`;
            });
            DOMHtml += `</div>`;
        }
        container.innerHTML = DOMHtml;
    }

    function updateLiveScores(liveMatches) {
        liveMatches.forEach(lm => {
            const scoreElement = document.getElementById(`score-${lm.match_id}`);
            const statusWrap = document.getElementById(`status-wrap-${lm.match_id}`);
            const statusText = document.getElementById(`status-${lm.match_id}`);
            const timerElement = document.getElementById(`timer-${lm.match_id}`);
            
            if (scoreElement && lm.score && lm.score.trim() !== '') {
                scoreElement.innerHTML = formatScore(lm.score);
            }
            
            if (statusWrap && lm.status) {
                statusText.innerText = lm.status;
                
                if (lm.status.includes('مباشر') || lm.status.includes('شوط') || lm.status.includes('إضافي')) {
                    statusWrap.className = 'stk-status live';
                    if (lm.timer && lm.timer !== 'null' && timerElement) {
                        timerElement.innerHTML = `<span class="stk-timer">${lm.timer}'</span>`;
                    }
                } else {
                    statusWrap.className = 'stk-status';
                    if (lm.status === 'انتهت') statusWrap.classList.add('ended');
                    if (timerElement) timerElement.innerHTML = '';
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSchedule);
    } else {
        initSchedule();
    }

})();
