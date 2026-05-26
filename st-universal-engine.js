(function() {
    'use strict';

    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ST API: Missing License");
        return; 
    }

    const API_HOST = "https://app.sitegeeky.com/football-api";
    const API_TOKEN = window.stSportsConfig.token;
    const CLIENT_DOMAIN = window.stSportsConfig.domain;

    let sseScheduleSource = null;

    // 1. هندسة النتيجة لمنع الانعكاس (وضع رقم الفريق الأيمن يميناً والأيسر يساراً)
    function formatScoreStrictRTL(scoreStr) {
        if (!scoreStr || scoreStr.trim() === '' || scoreStr === 'null') return null;
        const parts = scoreStr.split('-');
        if (parts.length === 2) {
            // القالب RTL، لذا الجزء الأول (الفريق 1) يظهر على اليمين تلقائياً
            return `<span class="sc-num">${parts[0].trim()}</span><span class="sc-dash">-</span><span class="sc-num">${parts[1].trim()}</span>`;
        }
        return scoreStr;
    }

    // 2. تحويل وقت الـ UTC إلى توقيت محلي 12 ساعة (ص/م)
    function getLocalTime12H(utcDateStr) {
        if (!utcDateStr) return "VS";
        const d = new Date(utcDateStr);
        let h = d.getHours();
        let m = String(d.getMinutes()).padStart(2, '0');
        let ampm = h >= 12 ? 'م' : 'ص';
        h = h % 12;
        h = h ? h : 12;
        return `${h}:${m} ${ampm}`;
    }

    // 3. المحرك الأساسي
    function initScheduleManager() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabButtons = scheduleApp.querySelectorAll('.st-sports-btn');

        function fetchMatches(dayOffset) {
            if (sseScheduleSource) sseScheduleSource.close();

            scheduleContent.innerHTML = '<div class="st-loading-skeleton"><div class="st-skel-line st-anim-pulse" style="width:200px; height:30px; margin:10px auto; border-radius:5px; background:var(--st-sp-border);"></div><div class="st-skel-card st-anim-pulse"></div><div class="st-skel-card st-anim-pulse"></div></div>';

            // حساب التاريخ المحلي المستهدف بدقة لفلترة المباريات المتداخلة
            const targetD = new Date();
            targetD.setDate(targetD.getDate() + parseInt(dayOffset));
            const targetDateStr = targetD.getFullYear() + '-' + String(targetD.getMonth()+1).padStart(2,'0') + '-' + String(targetD.getDate()).padStart(2,'0');

            let dateKeyword = 'today';
            if (dayOffset == -1) dateKeyword = 'yesterday';
            if (dayOffset == 1) dateKeyword = 'tomorrow';

            fetch(`${API_HOST}/matches?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${dateKeyword}`)
                .then(res => res.json())
                .then(response => {
                    let matches = (response.success && response.data) ? response.data : (Array.isArray(response) ? response : []);
                    
                    // الفلترة الجراحية: منع أي مباراة من الظهور في تبويب خاطئ بسبب التوقيت
                    matches = matches.filter(m => {
                        if (!m.date) return true;
                        const mDate = new Date(m.date); // تحويل التاريخ لوقت الزائر المحلي
                        const mLocalStr = mDate.getFullYear() + '-' + String(mDate.getMonth()+1).padStart(2,'0') + '-' + String(mDate.getDate()).padStart(2,'0');
                        return mLocalStr === targetDateStr;
                    });

                    if (matches.length === 0) {
                        scheduleContent.innerHTML = '<div style="padding:50px; text-align:center; font-weight:bold; color:var(--st-sp-muted);">لا توجد مباريات متاحة في هذا اليوم.</div>';
                        return;
                    }

                    buildMatchesDOM(matches, scheduleContent);

                    // تشغيل البث المباشر للأهداف فقط في تبويب "اليوم"
                    if (dayOffset == 0) {
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
                    scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:red; font-weight:bold;">تعذر الاتصال بخادم المباريات.</div>';
                });
        }

        tabButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.classList.contains('active')) return;
                tabButtons.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                fetchMatches(this.getAttribute('data-offset'));
            });
        });

        // تشغيل مباريات اليوم فوراً
        fetchMatches("0");
    }

    // 4. بناء هيكل الجدول
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
                <div class="st-league-group-wrapper">
                    <div class="st-league-group-title">
                        <img src="${leagueLogo}" onerror="this.style.display='none'">
                        <span>${leagueName}</span>
                    </div>`;

            leagueMatches.forEach(m => {
                // ضبط النتيجة أو التوقيت المحلي
                const formattedScore = formatScoreStrictRTL(m.score);
                const scoreDisplay = formattedScore ? formattedScore : getLocalTime12H(m.date);
                
                // تحديد الحالة والعداد
                let statusText = m.status || 'لم تبدأ';
                let statusClass = 'st-status-txt-lbl';
                let timerHtml = '';

                if (statusText.includes('مباشر') || statusText.includes('شوط') || statusText.includes('إضافي')) {
                    statusClass += ' st-live-active';
                    if (m.timer && m.timer !== 'null') {
                        timerHtml = `<span style="background:#fee2e2; color:#ef4444; padding:1px 5px; border-radius:4px; margin-right:4px;">${m.timer}'</span>`;
                    }
                } else if (statusText === 'انتهت') {
                    statusClass += ' ended-match';
                }

                DOMHtml += `
                    <a href="/p/match.html?match_id=${m.match_id}" class="st-match-item-row" id="match-row-${m.match_id}">
                        <div class="st-box-team st-team-home">
                            <span class="st-team-title-lbl">${m.team1}</span>
                            <img src="${m.team1_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                        </div>
                        
                        <div class="st-box-center-score">
                            <div class="st-score-box" id="score-${m.match_id}">${scoreDisplay}</div>
                            <div style="display:flex; align-items:center; margin-top:5px;" id="status-wrap-${m.match_id}">
                                <span class="${statusClass}" id="status-${m.match_id}">${statusText}</span>
                                <span id="timer-${m.match_id}">${timerHtml}</span>
                            </div>
                        </div>
                        
                        <div class="st-box-team st-team-away">
                            <img src="${m.team2_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T2'">
                            <span class="st-team-title-lbl">${m.team2}</span>
                        </div>
                    </a>`;
            });
            DOMHtml += `</div>`;
        }
        container.innerHTML = DOMHtml;
    }

    // 5. التحديث الحي
    function updateLiveScoresInDOM(liveMatches) {
        liveMatches.forEach(lm => {
            const scoreElement = document.getElementById(`score-${lm.match_id}`);
            const statusElement = document.getElementById(`status-${lm.match_id}`);
            const timerElement = document.getElementById(`timer-${lm.match_id}`);
            
            if (scoreElement && lm.score && lm.score.trim() !== '') {
                const newScore = formatScoreStrictRTL(lm.score);
                if(newScore) scoreElement.innerHTML = newScore;
            }
            
            if (statusElement && lm.status) {
                statusElement.innerText = lm.status;
                
                if (lm.status.includes('مباشر') || lm.status.includes('شوط') || lm.status.includes('إضافي')) {
                    statusElement.className = 'st-status-txt-lbl st-live-active';
                    if (lm.timer && lm.timer !== 'null' && timerElement) {
                        timerElement.innerHTML = `<span style="background:#fee2e2; color:#ef4444; padding:1px 5px; border-radius:4px; margin-right:4px;">${lm.timer}'</span>`;
                    }
                } else {
                    statusElement.className = 'st-status-txt-lbl';
                    if (lm.status === 'انتهت') statusElement.classList.add('ended-match');
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
