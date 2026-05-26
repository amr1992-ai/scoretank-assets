(function() {
    'use strict';

    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ScoreTank API: Missing License Config.");
        return; 
    }

    const API_HOST = "https://app.sitegeeky.com/football-api";
    const API_TOKEN = window.stSportsConfig.token;
    const CLIENT_DOMAIN = window.stSportsConfig.domain;

    let sseScheduleSource = null;

    // 1. دالة ذكية لتحويل وقت الـ UTC إلى 12 ساعة محلي (ص/م)
    function getLocalTime12H(utcDateStr) {
        if (!utcDateStr) return "VS";
        const d = new Date(utcDateStr);
        return d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // 2. المحرك الأساسي
    function initScheduleManager() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabButtons = scheduleApp.querySelectorAll('.st-tab-btn');

        function fetchMatches(dateKeyword) { // dateKeyword = 'yesterday', 'today', 'tomorrow'
            if (sseScheduleSource) sseScheduleSource.close();

            scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-muted);"><i class="fas fa-circle-notch fa-spin fa-2x" style="color:var(--st-primary);"></i><p style="margin-top:10px; font-weight:bold;">جاري جلب المباريات...</p></div>';

            // إرسال الكلمة مباشرة للسيرفر (كما تفعل إضافة الووردبريس تماماً)
            const fetchUrl = `${API_HOST}/matches?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${dateKeyword}`;

            fetch(fetchUrl, { cache: "no-store" })
                .then(res => res.json())
                .then(response => {
                    // الاعتماد الكلي على السيرفر بدون فلترة محلية تسبب أخطاء
                    let matches = (response.success && response.data) ? response.data : (Array.isArray(response) ? response : []);
                    
                    if (matches.length === 0) {
                        scheduleContent.innerHTML = '<div style="padding:50px; text-align:center; font-weight:bold; color:var(--st-muted);">لا توجد مباريات متاحة في هذا اليوم.</div>';
                        return;
                    }

                    buildMatchesDOM(matches, scheduleContent);

                    // تفعيل التحديث الحي (SSE) لمباريات اليوم فقط
                    if (dateKeyword === 'today') {
                        const sseUrl = `${API_HOST}/sse?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}`;
                        sseScheduleSource = new EventSource(sseUrl);

                        sseScheduleSource.addEventListener('update', function(event) {
                            try {
                                const liveData = JSON.parse(event.data);
                                const liveMatches = Array.isArray(liveData) ? liveData : (liveData.data ? liveData.data : []);
                                updateLiveScoresInDOM(liveMatches);
                            } catch(e) {}
                        });
                    }
                })
                .catch(err => {
                    scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-ended); font-weight:bold;">تعذر الاتصال بخادم المباريات.</div>';
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

        // التشغيل فوراً
        fetchMatches("today");
    }

    // 3. بناء الجدول وتوزيع الكروت
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
                    <div class="st-league-header">
                        <img src="${leagueLogo}" onerror="this.style.display='none'">
                        <span>${leagueName}</span>
                    </div>`;

            leagueMatches.forEach(m => {
                const hasScore = (m.score && m.score.trim() !== '' && m.score !== 'null');
                const scoreDisplay = hasScore ? m.score : getLocalTime12H(m.date);
                
                let statusText = m.status || 'لم تبدأ';
                let statusClass = 'st-match-status';
                let timerHtml = '';

                if (statusText.includes('مباشر') || statusText.includes('شوط') || statusText.includes('إضافي')) {
                    statusClass += ' live';
                    if (m.timer && m.timer !== 'null') {
                        timerHtml = `<span class="st-match-timer">${m.timer}'</span>`;
                    }
                } else if (statusText === 'انتهت') {
                    statusClass += ' ended';
                }

                const stadiumDisplay = m.stadium ? `🏟️ ${m.stadium}` : '';
                const channelDisplay = (m.channels && m.channels.length > 0) ? `📺 ${m.channels[0]}` : '';

                const bridgePayload = encodeURIComponent(JSON.stringify({ t1: m.team1, t2: m.team2, l1: m.team1_logo, l2: m.team2_logo, lg: leagueName, st: m.stadium }));

                DOMHtml += `
                    <a href="/p/match.html?match_id=${m.match_id}" class="st-match-card" id="match-row-${m.match_id}" onclick="localStorage.setItem('st_match_bridge', decodeURIComponent('${bridgePayload}'))">
                        
                        <div class="st-team-block home">
                            <span class="st-team-name">${m.team1}</span>
                            <img src="${m.team1_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                        </div>
                        
                        <div class="st-match-center">
                            <div class="st-score-badge" id="score-${m.match_id}" dir="ltr">${scoreDisplay}</div>
                            
                            <div class="${statusClass}" id="status-wrap-${m.match_id}">
                                <span id="timer-${m.match_id}">${timerHtml}</span>
                                <span id="status-${m.match_id}">${statusText}</span>
                            </div>
                            
                            <div class="st-match-channel">
                                ${stadiumDisplay} <br> ${channelDisplay}
                            </div>
                        </div>
                        
                        <div class="st-team-block away">
                            <img src="${m.team2_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T2'">
                            <span class="st-team-name">${m.team2}</span>
                        </div>
                    </a>`;
            });
            DOMHtml += `</div>`;
        }
        container.innerHTML = DOMHtml;
    }

    // 4. تحديث الأهداف
    function updateLiveScoresInDOM(liveMatches) {
        liveMatches.forEach(lm => {
            const scoreElement = document.getElementById(`score-${lm.match_id}`);
            const statusWrap = document.getElementById(`status-wrap-${lm.match_id}`);
            const statusText = document.getElementById(`status-${lm.match_id}`);
            const timerElement = document.getElementById(`timer-${lm.match_id}`);
            
            if (scoreElement && lm.score && lm.score.trim() !== '') {
                scoreElement.innerHTML = lm.score;
            }
            
            if (statusWrap && lm.status) {
                statusText.innerText = lm.status;
                
                if (lm.status.includes('مباشر') || lm.status.includes('شوط') || lm.status.includes('إضافي')) {
                    statusWrap.className = 'st-match-status live';
                    if (lm.timer && lm.timer !== 'null' && timerElement) {
                        timerElement.innerHTML = `<span class="st-match-timer">${lm.timer}'</span>`;
                    }
                } else {
                    statusWrap.className = 'st-match-status';
                    if (lm.status === 'انتهت') statusWrap.classList.add('ended');
                    if (timerElement) timerElement.innerHTML = '';
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScheduleManager);
    } else {
        initScheduleManager();
    }

})();
