(function() {
    'use strict';

    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ScoreTank API: Missing Client License.");
        return; 
    }

    const API_BASE_URL = "https://app.sitegeeky.com/football-api/sse";
    const API_TOKEN = window.stSportsConfig.token; 
    const CLIENT_DOMAIN = window.stSportsConfig.domain;

    let scheduleSource = null;
    let matchSource = null;

    // ==========================================
    // محرك جدول المباريات (الرئيسية)
    // ==========================================
    function initSchedule() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabs = scheduleApp.querySelectorAll('.st-m-tab');

        function fetchMatches(dayOffset) {
            if (scheduleSource) scheduleSource.close();
            
            scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-sport-muted);"><i class="fas fa-circle-notch fa-spin fa-2x" style="color:var(--st-sport-primary);"></i><p style="margin-top:10px; font-weight:bold;">جاري مزامنة المباريات...</p></div>';
            
            const d = new Date();
            d.setDate(d.getDate() + parseInt(dayOffset));
            const dateStr = d.toISOString().split('T')[0];

            const sseUrl = `${API_BASE_URL}?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${dateStr}`;
            
            scheduleSource = new EventSource(sseUrl);

            scheduleSource.addEventListener('update', function(e) {
                try {
                    const data = JSON.parse(e.data);
                    if (data.success && data.data && data.data.length > 0) {
                        renderSchedule(data.data, scheduleContent);
                    } else if (Array.isArray(data) && data.length > 0) {
                        renderSchedule(data, scheduleContent);
                    } else {
                        scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; font-weight:bold; color:var(--st-sport-muted);">لا توجد مباريات متاحة في هذا اليوم.</div>';
                    }
                } catch(err) { console.error(err); }
            });

            scheduleSource.onerror = function() {
                scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-sport-red); font-weight:bold;">تعذر الاتصال بخادم المباريات.</div>';
                scheduleSource.close();
            };
        }

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                fetchMatches(this.getAttribute('data-date'));
            });
        });

        // تشغيل الجلب فوراً
        fetchMatches("0");
    }

    function renderSchedule(matches, container) {
        const leagues = {};
        matches.forEach(m => {
            const league = m.league || 'بطولات أخرى';
            if(!leagues[league]) leagues[league] = [];
            leagues[league].push(m);
        });

        let html = '';
        for (const [leagueName, leagueMatches] of Object.entries(leagues)) {
            html += `<div class="st-league-title"><img src="https://img.btolat.com/teamslogo/default.png" onerror="this.style.display='none'"><span>${leagueName}</span></div>`;
            leagueMatches.forEach(m => {
                const score = (m.score && m.score.trim() !== '') ? m.score : (m.time ? m.time.substring(0,5) : 'VS');
                const statusClass = (m.status && (m.status.includes('مباشر') || m.status.includes('شوط'))) ? 'live' : '';
                const channelsHtml = (m.channels && m.channels.length > 0) ? `<div class="st-match-channels" title="${m.channels.join(', ')}">📺 ${m.channels[0]}</div>` : '';
                
                html += `
                <a href="/p/match.html?match_id=${m.match_id}" class="st-match-row">
                    <div class="st-team" style="justify-content: flex-end;">
                        <span class="st-team-name" style="text-align:left;">${m.team1}</span>
                        <img src="${m.team1_logo}" alt="T1" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T1'">
                    </div>
                    <div class="st-score-box">
                        <div class="st-score-num">${score}</div>
                        <span class="st-match-status ${statusClass}">${m.status || ''}</span>
                        ${channelsHtml}
                    </div>
                    <div class="st-team" style="justify-content: flex-start;">
                        <img src="${m.team2_logo}" alt="T2" onerror="this.src='https://dummyimage.com/35/1e293b/fff&text=T2'">
                        <span class="st-team-name" style="text-align:right;">${m.team2}</span>
                    </div>
                </a>`;
            });
        }
        container.innerHTML = html;
    }

    // ==========================================
    // محرك تفاصيل المباراة
    // ==========================================
    function initMatchDetails() {
        const detailsApp = document.getElementById('st-match-details-app');
        if (!detailsApp) return;

        const urlParams = new URLSearchParams(window.location.search);
        const matchId = urlParams.get('match_id');
        if (!matchId) { detailsApp.innerHTML = "<h3 style='text-align:center; padding:50px;'>لم يتم تحديد مباراة.</h3>"; return; }

        const tabs = detailsApp.querySelectorAll('.st-d-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                tabs.forEach(t => t.classList.remove('active'));
                detailsApp.querySelectorAll('.st-tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.getAttribute('data-target')).classList.add('active');
            });
        });

        const sseUrl = `${API_BASE_URL}?match_id=${matchId}&token=${API_TOKEN}&domain=${CLIENT_DOMAIN}`;
        
        if(matchSource) matchSource.close();
        matchSource = new EventSource(sseUrl);

        matchSource.addEventListener('update', function(e) {
            try {
                const data = JSON.parse(e.data);
                const match = Array.isArray(data) ? data[0] : data; 
                renderMatchDetails(match);
            } catch(err) { console.error("Parse Error"); }
        });
    }

    function renderMatchDetails(m) {
        // تحديث لوحة النتيجة
        const sb = document.getElementById('st-match-scoreboard');
        if(sb) {
            const score = (m.score && m.score.trim() !== '') ? m.score : 'VS';
            const timeStr = m.time || m.status;
            const statusClass = (m.status && (m.status.includes('مباشر') || m.status.includes('شوط'))) ? 'live' : '';
            sb.innerHTML = `
                <div class="st-sb-team">
                    <img src="${m.team1_logo || 'https://dummyimage.com/80/1e293b/fff'}" alt="T1">
                    <div class="st-sb-name">${m.team1 || 'الفريق 1'}</div>
                </div>
                <div class="st-sb-center">
                    <div class="st-sb-time ${statusClass}">${timeStr}</div>
                    <div class="st-sb-score">${score}</div>
                    <div class="st-sb-stadium">${m.stadium || 'يحدد لاحقاً'}</div>
                </div>
                <div class="st-sb-team">
                    <img src="${m.team2_logo || 'https://dummyimage.com/80/1e293b/fff'}" alt="T2">
                    <div class="st-sb-name">${m.team2 || 'الفريق 2'}</div>
                </div>
            `;
        }

        // تحديث المقال
        const articleTab = document.getElementById('st-article-content');
        if(articleTab) {
            articleTab.innerHTML = `
                <h3 style="color:var(--st-sport-primary); margin-bottom:15px; font-weight:900;">تقرير المباراة المباشر</h3>
                <p>تتجه أنظار عشاق كرة القدم إلى المواجهة المرتقبة التي تجمع بين فريقي <b>${m.team1 || 'المضيف'}</b> و <b>${m.team2 || 'الضيف'}</b>. 
                تقام هذه المباراة الحماسية على أرضية ملعب <b>${m.stadium || 'الرئيسي'}</b>.</p>
                <p>حالة المباراة حالياً: <b>${m.status || 'غير محدد'}</b>، والنتيجة المسجلة حتى اللحظة هي (<b>${m.score || 'تعادل سلبي'}</b>).</p>
            `;
        }
    }

    // ==========================================
    // المشغل الآمن (ضمان اكتمال تحميل عناصر الصفحة)
    // ==========================================
    function runSportsEngine() {
        if (document.getElementById('st-schedule-app')) initSchedule();
        if (document.getElementById('st-match-details-app')) initMatchDetails();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runSportsEngine);
    } else {
        runSportsEngine();
    }

})();
