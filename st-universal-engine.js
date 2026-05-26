(function() {
    'use strict';

    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ScoreTank API: Missing Client License Config.");
        return; 
    }

    const API_HOST = "https://app.sitegeeky.com/football-api";
    const API_TOKEN = window.stSportsConfig.token;
    const CLIENT_DOMAIN = window.stSportsConfig.domain;

    let sseScheduleSource = null;

    // 1. دالة ذكية لتحويل الوقت إلى 12 ساعة (ص/م) محلياً
    function formatArabicTime12H(timeStr) {
        if (!timeStr) return "";
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        
        let hours = parseInt(parts[0], 10);
        let minutes = parts[1];
        let ampm = hours >= 12 ? 'م' : 'ص';
        
        hours = hours % 12;
        hours = hours ? hours : 12; // الساعة 0 تصبح 12
        
        return hours + ':' + minutes + ' ' + ampm;
    }

    // 2. المحرك الأساسي للجدول
    function initScheduleManager() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabButtons = scheduleApp.querySelectorAll('.st-sports-btn');

        // جلب البيانات بناءً على الكلمة (today, yesterday, tomorrow)
        function loadMatchesByDate(dateKeyword) {
            if (sseScheduleSource) sseScheduleSource.close();

            scheduleContent.innerHTML = `
                <div class="st-loading-skeleton">
                    <div class="st-skel-line st-anim-pulse" style="width:200px; height:30px; margin:10px auto; border-radius:5px;"></div>
                    <div class="st-skel-card st-anim-pulse"></div>
                    <div class="st-skel-card st-anim-pulse"></div>
                </div>`;

            // إرسال الكلمة الدقيقة كما تفعل إضافة الووردبريس (date=today)
            const httpFetchUrl = `${API_HOST}/matches?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${dateKeyword}`;
            
            fetch(httpFetchUrl)
                .then(res => res.json())
                .then(response => {
                    const matches = (response.success && response.data) ? response.data : (Array.isArray(response) ? response : []);
                    
                    if (matches.length === 0) {
                        scheduleContent.innerHTML = '<div style="padding:50px; text-align:center; font-weight:bold; color:var(--st-sp-muted);">لا توجد مباريات مجدولة لهذا اليوم.</div>';
                        return;
                    }

                    // بناء الجدول كاملاً
                    buildMatchesDOM(matches, scheduleContent);

                    // تفعيل البث الحي (SSE) فقط إذا كنا في تبويب "اليوم" (today)
                    // (لا داعي لفتح بث حي لمباريات الأمس أو الغد لتخفيف الضغط)
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
                    scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-sp-muted); font-weight:bold;">تعذر جلب البيانات. الرجاء المحاولة لاحقاً.</div>';
                });
        }

        // تفاعل التبويبات
        tabButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.classList.contains('active')) return;
                tabButtons.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // سحب التاريخ (yesterday, today, tomorrow)
                const targetDate = this.getAttribute('data-date');
                loadMatchesByDate(targetDate);
            });
        });

        // التشغيل التلقائي لمباريات اليوم
        loadMatchesByDate("today");
    }

    // 3. بناء هيكل الـ DOM
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
                <div class="st-league-group">
                    <div class="st-league-title">
                        <img src="${leagueLogo}" onerror="this.style.display='none'">
                        <span>${leagueName}</span>
                    </div>`;

            leagueMatches.forEach(m => {
                // 1. معالجة النتيجة والتوقيت (التوقيت 12 ساعة)
                const hasScore = (m.score && m.score.trim() !== '' && m.score !== 'null');
                const scoreDisplay = hasScore ? m.score : (m.time ? formatArabicTime12H(m.time) : 'VS');
                
                // 2. معالجة الحالة والعداد
                let statusText = m.status || 'لم تبدأ';
                let statusClass = '';
                let timerHtml = '';

                if (statusText.includes('مباشر') || statusText.includes('شوط') || statusText.includes('إضافي')) {
                    statusClass = 'live';
                    // جلب العداد إذا كان موجوداً
                    if (m.timer && m.timer !== 'null') {
                        timerHtml = `<span class="st-timer-badge">${m.timer}'</span>`;
                    }
                } else if (statusText === 'انتهت') {
                    statusClass = 'ended';
                }

                // 3. القناة الناقلة
                const channelDisplay = (m.channels && m.channels.length > 0) ? `<div class="st-channel-box">📺 ${m.channels[0]}</div>` : '';

                DOMHtml += `
                    <a href="/p/match.html?match_id=${m.match_id}" class="st-match-row" id="match-row-${m.match_id}">
                        <div class="st-team st-team-home">
                            <span class="st-team-name">${m.team1}</span>
                            <img src="${m.team1_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                        </div>
                        
                        <div class="st-match-center">
                            <div class="st-score-box" id="score-${m.match_id}" dir="ltr">${scoreDisplay}</div>
                            
                            <div class="st-status-box ${statusClass}" id="status-box-${m.match_id}">
                                <span id="status-text-${m.match_id}">${statusText}</span>
                                <span id="timer-box-${m.match_id}">${timerHtml}</span>
                            </div>
                            
                            ${channelDisplay}
                        </div>
                        
                        <div class="st-team st-team-away">
                            <img src="${m.team2_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T2'">
                            <span class="st-team-name">${m.team2}</span>
                        </div>
                    </a>`;
            });

            DOMHtml += `</div>`;
        }
        container.innerHTML = DOMHtml;
    }

    // 4. تحديث النتائج الحية (لتبويب اليوم فقط)
    function updateLiveScoresInDOM(liveMatches) {
        liveMatches.forEach(lm => {
            const scoreElement = document.getElementById(`score-${lm.match_id}`);
            const statusBox = document.getElementById(`status-box-${lm.match_id}`);
            const statusText = document.getElementById(`status-text-${lm.match_id}`);
            const timerBox = document.getElementById(`timer-box-${lm.match_id}`);
            
            // التأكد أن المباراة موجودة في الشاشة الحالية
            if (scoreElement && lm.score) {
                scoreElement.innerText = lm.score;
            }
            
            if (statusBox && lm.status) {
                statusText.innerText = lm.status;
                
                if (lm.status.includes('مباشر') || lm.status.includes('شوط') || lm.status.includes('إضافي')) {
                    statusBox.className = 'st-status-box live';
                    if (lm.timer && lm.timer !== 'null') {
                        timerBox.innerHTML = `<span class="st-timer-badge">${lm.timer}'</span>`;
                    }
                } else if (lm.status === 'انتهت') {
                    statusBox.className = 'st-status-box ended';
                    timerBox.innerHTML = '';
                } else {
                    statusBox.className = 'st-status-box';
                    timerBox.innerHTML = '';
                }
            }
        });
    }

    // المشغل الآمن
    function runSportsCoreEngine() {
        if (document.getElementById('st-schedule-app')) {
            initScheduleManager();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSportsCoreEngine);
    } else {
        runSportsCoreEngine();
    }

})();
