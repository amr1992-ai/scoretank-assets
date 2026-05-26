(function() {
    'use strict';

    // 1. التحقق من سلامة وجود رخصة العميل
    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ScoreTank API: Missing Client License Config.");
        return; 
    }

    // بناء الرابط الأساسي ليتوافق مع بروتوكول العميل بدقة
    const API_HOST = "https://app.sitegeeky.com/football-api";
    const API_TOKEN = window.stSportsConfig.token;
    const CLIENT_DOMAIN = window.stSportsConfig.domain;

    let sseScheduleSource = null;

    // دالة تهيئة مشغل المزامنة والجدول في الرئيسية
    function initLiveScheduleManager() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabButtons = scheduleApp.querySelectorAll('.st-sports-btn');

        // دالة جلب البيانات المدمجة (Fetch + SSE)
        function loadTargetDayMatches(dayOffset) {
            // إغلاق أي اتصال حي مفتوح منعاً لتكدس الأداء
            if (sseScheduleSource) sseScheduleSource.close();

            // عرض لودر التحميل النبضي
            scheduleContent.innerHTML = `
                <div class="st-loading-skeleton">
                    <div class="st-skel-line st-anim-pulse" style="width: 200px; height: 30px; margin: 10px auto; border-radius: 5px; background:var(--st-sp-border);"></div>
                    <div class="st-skel-card st-anim-pulse"></div>
                    <div class="st-skel-card st-anim-pulse"></div>
                </div>`;

            // حساب صيغة التاريخ المطلوبة للسيرفر YYYY-MM-DD
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + parseInt(dayOffset));
            const targetDateStr = targetDate.toISOString().split('T')[0];

            // [المرحلة 1]: جلب البيانات الكاملة لبناء الهيكل والشعارات والأسماء والبطولات
            const httpFetchUrl = `${API_HOST}/matches?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${targetDateStr}`;
            
            fetch(httpFetchUrl)
                .then(res => {
                    if (!res.ok) throw new Error("Network Response Error");
                    return res.json();
                })
                .then(response => {
                    const matches = (response.success && response.data) ? response.data : (Array.isArray(response) ? response : []);
                    
                    if (matches.length === 0) {
                        scheduleContent.innerHTML = '<div style="padding:50px; text-align:center; font-weight:bold; color:var(--st-sp-muted);">لا توجد مباريات مجدولة لهذا اليوم.</div>';
                        return;
                    }

                    // رسم وتوزيع الجدول وبناء كروت البطولات بنجاح
                    buildMatchesDOM(matches, scheduleContent);

                    // [المرحلة 2]: تشغيل البث الحي (SSE) لتحديث الأهداف والعدادات فوق الهيكل المبني
                    const sseUrl = `${API_HOST}/sse?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}`;
                    sseScheduleSource = new EventSource(sseUrl);

                    sseScheduleSource.addEventListener('update', function(event) {
                        try {
                            const liveData = JSON.parse(event.data);
                            const liveMatches = Array.isArray(liveData) ? liveData : (liveData.data ? liveData.data : []);
                            
                            // تحديث العناصر الحية فقط بالـ ID دون إعادة مسح الصفحة
                            updateLiveScoresAndStatus(liveMatches);
                        } catch(e) { console.error("SSE Parse Error"); }
                    });

                    sseScheduleSource.onerror = function() {
                        console.warn("SSE disconnected. Retrying...");
                        sseScheduleSource.close();
                    };

                })
                .catch(err => {
                    console.error(err);
                    scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-sp-muted); font-weight:bold;">خطأ في جلب البيانات من الخادم، تأكد من إعدادات الدومين والتوكن.</div>';
                });
        }

        // ربط أزرار التبويبات الثلاثة هندسياً وتغيير الحالات
        tabButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.classList.contains('active')) return;
                tabButtons.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                loadTargetDayMatches(this.getAttribute('data-offset'));
            });
        });

        // تشغيل جلب مباريات اليوم تلقائياً
        loadTargetDayMatches("0");
    }

    // دالة معالجة الجيسون وتقسيم الجدول حسب اسم وشعارات البطولة
    function buildMatchesDOM(matches, container) {
        const leaguesGroup = {};
        
        matches.forEach(match => {
            const leagueName = match.league || "بطولات متنوعة";
            if (!leaguesGroup[leagueName]) leaguesGroup[leagueName] = [];
            leaguesGroup[leagueName].push(match);
        });

        let DOMHtml = '';
        for (const [leagueName, leagueMatches] of Object.entries(leaguesGroup)) {
            // جلب شعار أول بطولة متوفرة في المجموعة للتقسيم الاحترافي
            const leagueLogo = leagueMatches[0].league_logo || "https://img.btolat.com/teamslogo/default.png";
            
            DOMHtml += `
                <div class="st-league-group-wrapper">
                    <div class="st-league-group-title">
                        <img src="${leagueLogo}" onerror="this.style.display='none'">
                        <span>${leagueName}</span>
                    </div>`;

            leagueMatches.forEach(m => {
                // ضبط النتيجة والوقت لعرض التوقيت بدلاً من النتيجة الفاضية للمباراة التي لم تبدأ
                const scoreDisplay = (m.score && m.score.trim() !== '') ? m.score : (m.time ? m.time.substring(0, 5) : 'VS');
                const isLive = (m.status && (m.status.includes('مباشر') || m.status.includes('الشوط') || m.status.includes('وقت إضافي')));
                const statusClass = isLive ? 'st-status-txt-lbl st-live-active' : 'st-status-txt-lbl';
                const channelDisplay = (m.channels && m.channels.length > 0) ? `<div class="st-match-extra-info">📺 ${m.channels[0]}</div>` : '';

                // تخزين بيانات المباراة في الجسر المؤقت لسرعة استجابة صفحة التفاصيل الفردية لاحقاً
                const matchBridgePayload = encodeURIComponent(JSON.stringify({
                    t1: m.team1, t2: m.team2, l1: m.team1_logo, l2: m.team2_logo, lg: leagueName, st: m.stadium
                }));

                DOMHtml += `
                    <a href="/p/match.html?match_id=${m.match_id}" class="st-match-item-row" data-id="${m.match_id}" onclick="localStorage.setItem('st_match_bridge', decodeURIComponent('${matchBridgePayload}'))">
                        <div class="st-box-team st-team-home">
                            <span class="st-team-title-lbl">${m.team1}</span>
                            <img src="${m.team1_logo}" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                        </div>
                        <div class="st-box-center-score">
                            <div class="st-score-display-badge" id="score-${m.match_id}">${scoreDisplay}</div>
                            <span class="${statusClass}" id="status-${m.match_id}">${m.status || 'لم تبدأ'}</span>
                            ${channelDisplay}
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

    // دالة تحديث الأهداف والحالات الحية عبر دفقات الـ SSE دون إتلاف الـ DOM أو الأسماء
    function updateLiveScoresAndStatus(liveMatches) {
        liveMatches.forEach(lm => {
            const scoreElement = document.getElementById(`score-${lm.match_id}`);
            const statusElement = document.getElementById(`status-${lm.match_id}`);
            
            if (scoreElement && lm.score && lm.score.trim() !== '') {
                scoreElement.innerText = lm.score;
            }
            if (statusElement && lm.status) {
                statusElement.innerText = lm.status;
                const isLive = (lm.status.includes('مباشر') || lm.status.includes('الشوط') || lm.status.includes('وقت إضافي'));
                if (isLive) {
                    statusElement.className = 'st-status-txt-lbl st-live-active';
                } else {
                    statusElement.className = 'st-status-txt-lbl';
                }
            }
        });
    }

    // تأمين نقطة الانطلاق البرمجية بعد التأكد التام من تحميل الصفحة
    function runSportsCoreEngine() {
        if (document.getElementById('st-schedule-app')) {
            initLiveScheduleManager();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSportsCoreEngine);
    } else {
        runSportsCoreEngine();
    }

})();
