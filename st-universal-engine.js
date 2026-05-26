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

    // 1. الدالة النهائية لمنع انعكاس النتيجة (تمزيق الأرقام وتثبيتها)
    function fixScoreDirection(scoreStr) {
        if (!scoreStr || scoreStr.trim() === '' || scoreStr === 'null') return null;
        const parts = scoreStr.split('-');
        if (parts.length === 2) {
            // تثبيت رقم الفريق الأيمن في اليمين، والأيسر في اليسار باستخدام Flex
            return `
            <div style="display:flex; justify-content:center; align-items:center; gap:6px; direction:rtl; width:100%;">
                <span>${parts[0].trim()}</span>
                <span style="color:rgba(255,255,255,0.6); font-weight:normal;">-</span>
                <span>${parts[1].trim()}</span>
            </div>`;
        }
        return scoreStr;
    }

    // 2. تحويل وقت المباراة من UTC إلى توقيت الزائر المحلي (12 ساعة ص/م)
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

    // 3. المحرك الأساسي الدقيق
    function initScheduleManager() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabButtons = scheduleApp.querySelectorAll('.st-sports-btn');

        function fetchMatches(dayOffset) {
            if (sseScheduleSource) sseScheduleSource.close();

            scheduleContent.innerHTML = '<div class="st-loading-skeleton"><div class="st-skel-line st-anim-pulse" style="width:200px; height:30px; margin:10px auto; border-radius:5px; background:var(--st-sp-border);"></div><div class="st-skel-card st-anim-pulse"></div><div class="st-skel-card st-anim-pulse"></div></div>';

            // حساب التاريخ الفعلي للزائر (مثلاً 2026-05-26)
            const targetD = new Date();
            targetD.setDate(targetD.getDate() + parseInt(dayOffset));
            const targetDateStr = targetD.getFullYear() + '-' + String(targetD.getMonth() + 1).padStart(2, '0') + '-' + String(targetD.getDate()).padStart(2, '0');

            // إرسال التاريخ الفعلي الدقيق للسيرفر لمنع جلب بيانات يوم 22
            const fetchUrl = `${API_HOST}/matches?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${targetDateStr}`;

            // استخدام cache: 'no-store' لتدمير أي كاش قديم
            fetch(fetchUrl, { cache: "no-store" })
                .then(res => res.json())
                .then(response => {
                    let matches = (response.success && response.data) ? response.data : (Array.isArray(response) ? response : []);
                    
                    // الفلترة الصارمة (Strict Filter): نتأكد أن تاريخ المباراة يطابق تاريخ التبويب
                    matches = matches.filter(m => {
                        if (!m.date) return false;
                        const mDate = new Date(m.date);
                        const mLocalStr = mDate.getFullYear() + '-' + String(mDate.getMonth() + 1).padStart(2, '0') + '-' + String(mDate.getDate()).padStart(2, '0');
                        return mLocalStr === targetDateStr;
                    });

                    if (matches.length === 0) {
                        scheduleContent.innerHTML = '<div style="padding:50px; text-align:center; font-weight:bold; color:var(--st-sp-muted);">لا توجد مباريات في هذا اليوم.</div>';
                        return;
                    }

                    buildMatchesDOM(matches, scheduleContent);

                    // تفعيل البث المباشر (SSE) لمباريات اليوم الجارية فقط
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
                fetchMatches(this.getAttribute('data-offset')); // data-offset: -1, 0, 1
            });
        });

        // تشغيل تبويب اليوم فوراً
        fetchMatches("0");
    }

    // 4. بناء الهيكل بدقة عالية وتوزيع الملعب
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
                    <div class="st-league-title">
                        <img src="${leagueLogo}" onerror="this.style.display='none'">
                        <span>${leagueName}</span>
                    </div>`;

            leagueMatches.forEach(m => {
                const fixedScore = fixScoreDirection(m.score);
                const scoreDisplay = fixedScore ? fixedScore : getLocalTime12H(m.date);
                
                let statusText = m.status || 'لم تبدأ';
                let statusClass = 'st-status-txt-lbl';
                let timerHtml = '';

                // معالجة حالة المباراة والعداد
                if (statusText.includes('مباشر') || statusText.includes('شوط') || statusText.includes('إضافي')) {
                    statusClass += ' st-live-active';
                    if (m.timer && m.timer !== 'null') {
                        timerHtml = `<span style="background:#fee2e2; color:#ef4444; padding:2px 6px; border-radius:4px; margin-right:4px;">${m.timer}'</span>`;
                    }
                } else if (statusText === 'انتهت') {
                    statusClass += ' ended-match';
                    statusText = 'انتهت';
                }

                // عرض الملعب والقناة
                const channelDisplay = (m.channels && m.channels.length > 0) ? `📺 ${m.channels[0]}` : '';
                const stadiumDisplay = m.stadium ? `🏟️ ${m.stadium}` : '';

                // تخزين البيانات للانتقال لصفحة التفاصيل لاحقاً
                const bridgePayload = encodeURIComponent(JSON.stringify({ t1: m.team1, t2: m.team2, l1: m.team1_logo, l2: m.team2_logo, lg: leagueName, st: m.stadium }));

                DOMHtml += `
                    <a href="/p/match.html?match_id=${m.match_id}" class="st-match-row" id="match-row-${m.match_id}" onclick="localStorage.setItem('st_match_bridge', decodeURIComponent('${bridgePayload}'))">
                        <div class="st-team st-team-home">
                            <span class="st-team-name">${m.team1}</span>
                            <img src="${m.team1_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                        </div>
                        
                        <div class="st-match-center">
                            <div class="st-score-box" id="score-${m.match_id}">${scoreDisplay}</div>
                            
                            <div style="display:flex; align-items:center; margin-top:5px;" id="status-wrap-${m.match_id}">
                                <span class="${statusClass}" id="status-${m.match_id}">${statusText}</span>
                                <span id="timer-${m.match_id}">${timerHtml}</span>
                            </div>
                            
                            <div class="st-channel-box" style="margin-top:3px;">
                                <span style="display:block;">${stadiumDisplay}</span>
                                <span style="display:block;">${channelDisplay}</span>
                            </div>
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

    // 5. تحديث الأهداف الحية
    function updateLiveScoresInDOM(liveMatches) {
        liveMatches.forEach(lm => {
            const scoreElement = document.getElementById(`score-${lm.match_id}`);
            const statusElement = document.getElementById(`status-${lm.match_id}`);
            const timerElement = document.getElementById(`timer-${lm.match_id}`);
            
            if (scoreElement && lm.score && lm.score.trim() !== '') {
                const newScore = fixScoreDirection(lm.score);
                if(newScore) scoreElement.innerHTML = newScore;
            }
            
            if (statusElement && lm.status) {
                statusElement.innerText = lm.status;
                if (lm.status.includes('مباشر') || lm.status.includes('شوط') || lm.status.includes('إضافي')) {
                    statusElement.className = 'st-status-txt-lbl st-live-active';
                    if (lm.timer && lm.timer !== 'null' && timerElement) {
                        timerElement.innerHTML = `<span style="background:#fee2e2; color:#ef4444; padding:2px 6px; border-radius:4px; margin-right:4px;">${lm.timer}'</span>`;
                    }
                } else {
                    statusElement.className = 'st-status-txt-lbl';
                    if (lm.status === 'انتهت') statusElement.classList.add('ended-match');
                    if (timerElement) timerElement.innerHTML = '';
                }
            }
        });
    }

    function runSportsCoreEngine() {
        if (document.getElementById('st-schedule-app')) initScheduleManager();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSportsCoreEngine);
    } else {
        runSportsCoreEngine();
    }

})();
