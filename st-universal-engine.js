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

    // دالة لحفظ بيانات المباراة الأساسية كجسر بين الرئيسية وصفحة التفاصيل
    window.stSaveMatchBridge = function(matchDataStr) {
        try { localStorage.setItem('st_match_bridge', decodeURIComponent(matchDataStr)); } catch(e) {}
    };

    // ==========================================
    // 1. محرك جدول المباريات (الرئيسية)
    // ==========================================
    function initSchedule() {
        const scheduleApp = document.getElementById('st-schedule-app');
        const scheduleContent = document.getElementById('st-schedule-content');
        if (!scheduleApp || !scheduleContent) return;

        const tabs = scheduleApp.querySelectorAll('.st-m-tab');

        function fetchMatches(dayOffset) {
            if (scheduleSource) scheduleSource.close();
            scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; color:var(--st-sport-muted);"><i class="fas fa-circle-notch fa-spin fa-2x" style="color:var(--st-sport-primary);"></i><p style="margin-top:10px; font-weight:bold;">جاري جلب البطولات والمباريات...</p></div>';
            
            const d = new Date();
            d.setDate(d.getDate() + parseInt(dayOffset));
            const dateStr = d.toISOString().split('T')[0];

            const sseUrl = `${API_BASE_URL}?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}&date=${dateStr}`;
            scheduleSource = new EventSource(sseUrl);

            scheduleSource.addEventListener('update', function(e) {
                try {
                    const data = JSON.parse(e.data);
                    const matchesArray = (data.success && data.data) ? data.data : (Array.isArray(data) ? data : []);
                    if (matchesArray.length > 0) renderSchedule(matchesArray, scheduleContent);
                    else scheduleContent.innerHTML = '<div style="padding:40px; text-align:center; font-weight:bold; color:var(--st-sport-muted);">لا توجد مباريات متاحة في هذا اليوم.</div>';
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
            // جلب لوجو البطولة إذا كان موجوداً في الـ API، وإلا وضع لوجو افتراضي
            const lgLogo = leagueMatches[0].league_logo || "https://img.btolat.com/teamslogo/default.png";
            html += `<div class="st-league-title"><img src="${lgLogo}" onerror="this.style.display='none'"><span>${leagueName}</span></div>`;
            
            leagueMatches.forEach(m => {
                const score = (m.score && m.score.trim() !== '') ? m.score : (m.time ? m.time.substring(0,5) : 'VS');
                const statusClass = (m.status && (m.status.includes('مباشر') || m.status.includes('شوط'))) ? 'live' : '';
                const channelsHtml = (m.channels && m.channels.length > 0) ? `<div class="st-match-channels">📺 ${m.channels[0]}</div>` : '';
                
                // تجهيز جسر البيانات للصفحة الفردية
                const bridgeData = encodeURIComponent(JSON.stringify({
                    t1: m.team1, t2: m.team2, l1: m.team1_logo, l2: m.team2_logo, lg: leagueName, st: m.stadium
                }));

                html += `
                <a href="/p/match.html?match_id=${m.match_id}" class="st-match-row" onclick="window.stSaveMatchBridge('${bridgeData}')">
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
    // 2. محرك تفاصيل المباراة الفردية
    // ==========================================
    function initMatchDetails() {
        const detailsApp = document.getElementById('st-match-details-app');
        if (!detailsApp) return;

        const urlParams = new URLSearchParams(window.location.search);
        const matchId = urlParams.get('match_id');
        if (!matchId) { detailsApp.innerHTML = "<h3 style='text-align:center; padding:50px;'>لم يتم تحديد مباراة.</h3>"; return; }

        // استعادة جسر البيانات (الأسماء والشعارات) التي لا يرسلها SSE
        let bridgeData = { t1: 'الفريق الأول', t2: 'الفريق الثاني', l1: '', l2: '', lg: '', st: 'يحدد لاحقاً' };
        try {
            const saved = localStorage.getItem('st_match_bridge');
            if (saved) bridgeData = JSON.parse(saved);
        } catch(e) {}

        // رسم مبدئي سريع للوحة النتيجة لكسر الملل
        renderScoreboard(bridgeData, {score: '- - -', status: 'جاري الاتصال...'});

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
                
                // دمج بيانات الجسر الثابتة مع بيانات الـ SSE الحية
                const fullMatchData = { ...bridgeData, ...match };
                
                renderScoreboard(bridgeData, match);
                renderArticle(fullMatchData);
                renderEvents(match.events);
                renderStats(match.statistics);
                renderLineups(match.lineups, bridgeData);
                
            } catch(err) { console.error("Parse Error"); }
        });
    }

    function renderScoreboard(bridge, live) {
        const sb = document.getElementById('st-match-scoreboard');
        if(!sb) return;
        const score = (live.score && live.score.trim() !== '') ? live.score : (live.time || 'VS');
        const statusClass = (live.status && (live.status.includes('مباشر') || live.status.includes('شوط'))) ? 'live' : '';
        sb.innerHTML = `
            <div class="st-sb-team">
                <img src="${bridge.l1 || 'https://dummyimage.com/80/1e293b/fff'}" onerror="this.src='https://dummyimage.com/80/1e293b/fff'">
                <div class="st-sb-name">${bridge.t1}</div>
            </div>
            <div class="st-sb-center">
                <div class="st-sb-time ${statusClass}">${live.status || 'انتظار'}</div>
                <div class="st-sb-score">${score}</div>
                <div class="st-sb-stadium">${live.stadium || bridge.st}</div>
            </div>
            <div class="st-sb-team">
                <img src="${bridge.l2 || 'https://dummyimage.com/80/1e293b/fff'}" onerror="this.src='https://dummyimage.com/80/1e293b/fff'">
                <div class="st-sb-name">${bridge.t2}</div>
            </div>
        `;
    }

    function renderArticle(m) {
        const articleTab = document.getElementById('st-article-content');
        if(!articleTab) return;
        articleTab.innerHTML = `
            <h3 style="color:var(--st-sport-primary); margin-bottom:15px; font-weight:900;">ملخص المواجهة</h3>
            <p>تتجه أنظار عشاق كرة القدم إلى المواجهة المرتقبة التي تجمع بين فريقي <b>${m.t1}</b> و <b>${m.t2}</b> 
            ${m.lg ? `ضمن منافسات <b>${m.lg}</b>` : ''}. تقام هذه المباراة الحماسية على أرضية ملعب <b>${m.stadium || m.st}</b>.</p>
            <p>حالة المباراة حالياً: <b>${m.status || 'غير محدد'}</b>، والنتيجة المسجلة حتى اللحظة هي (<b>${m.score || 'تعادل سلبي'}</b>).</p>
        `;
    }

    function renderEvents(events) {
        const eventsTab = document.getElementById('st-tab-events');
        if (!eventsTab) return;
        if (events && events.length > 0) {
            let evHtml = '<div class="st-timeline">';
            events.forEach(ev => {
                // تحديد الفريق (1 أو 2) لتوجيه الحدث يمين أو يسار
                const alignClass = (ev.team == 1 || ev.team === "team1") ? 'st-event-t1' : 'st-event-t2';
                
                // خوارزمية استخراج الأيقونات حسب الكلمة
                let icon = '⏱️';
                if(ev.type.includes('هدف') || ev.type.includes('Goal')) icon = '⚽';
                else if(ev.type.includes('صفراء') || ev.type.includes('Yellow')) icon = '🟨';
                else if(ev.type.includes('حمراء') || ev.type.includes('Red')) icon = '🟥';
                else if(ev.type.includes('تبديل') || ev.type.includes('Sub')) icon = '🔄';

                evHtml += `
                <div class="st-event-item ${alignClass}">
                    <div class="st-event-time">${ev.time}'</div>
                    <div class="st-event-box">
                        <div class="st-event-desc">${icon} ${ev.player || ev.player_name || 'حدث'}</div>
                        ${ev.assist ? `<div class="st-event-sub">صناعة/خروج: ${ev.assist}</div>` : ''}
                    </div>
                </div>`;
            });
            evHtml += '</div>';
            eventsTab.innerHTML = evHtml;
        } else {
            eventsTab.innerHTML = "<p style='text-align:center; padding:30px; font-weight:bold; color:var(--st-sport-muted);'>لم يتم تسجيل أحداث بعد.</p>";
        }
    }

    function renderStats(stats) {
        const statsTab = document.getElementById('st-tab-stats');
        if (!statsTab) return;
        
        if (stats && (stats.team1 || Object.keys(stats).length > 0)) {
            let statsHtml = '';
            // قاموس ترجمة مفاتيح الإحصائيات الإنجليزية إلى عربية (حسب إضافة Btolat)
            const statsMap = {
                "ball_possession": "الاستحواذ %", "goal_attempts": "تسديدات", "shots_on_goal": "على المرمى",
                "corner_kicks": "ركلات ركنية", "fouls": "الأخطاء", "yellow_cards": "بطاقات صفراء",
                "red_cards": "بطاقات حمراء", "offsides": "تسلل", "saves": "تصديات الحارس"
            };

            for (const [key, arName] of Object.entries(statsMap)) {
                if (stats.team1 && stats.team1[key] && stats.team2 && stats.team2[key]) {
                    const val1Str = stats.team1[key].toString();
                    const val2Str = stats.team2[key].toString();
                    const val1 = parseInt(val1Str.replace(/[^0-9]/g, '')) || 0;
                    const val2 = parseInt(val2Str.replace(/[^0-9]/g, '')) || 0;
                    const total = val1 + val2 === 0 ? 1 : val1 + val2;
                    const pct1 = (val1 / total) * 100;
                    const pct2 = (val2 / total) * 100;

                    statsHtml += `
                    <div class="st-stat-row">
                        <div class="st-stat-labels">
                            <span>${val1Str}</span>
                            <span style="color:var(--st-sport-primary);">${arName}</span>
                            <span>${val2Str}</span>
                        </div>
                        <div class="st-stat-bar-bg">
                            <div class="st-stat-bar-t1" style="width: ${pct1}%"></div>
                            <div class="st-stat-bar-t2" style="width: ${pct2}%"></div>
                        </div>
                    </div>`;
                }
            }
            statsTab.innerHTML = statsHtml || "<p style='text-align:center; padding:30px; font-weight:bold; color:var(--st-sport-muted);'>جاري معالجة الإحصائيات.</p>";
        } else {
            statsTab.innerHTML = "<p style='text-align:center; padding:30px; font-weight:bold; color:var(--st-sport-muted);'>الإحصائيات غير متوفرة حالياً.</p>";
        }
    }

    function renderLineups(lineups, bridge) {
        const lineupTab = document.getElementById('st-tab-lineup');
        if (!lineupTab) return;
        
        if (lineups && lineups.team1 && lineups.team2) {
            
            // خوارزمية ذكية لترتيب اللاعبين حسب (formation_pos) كما في ملف Btolat الأصلي
            const categorizePlayers = (playersArray) => {
                let rows = [[], [], [], []]; // [حارس، دفاع، وسط، هجوم]
                playersArray.forEach(p => {
                    let pos = parseInt(p.formation_pos || p.pos || 0);
                    if (pos === 1) rows[0].push(p);
                    else if (pos >= 2 && pos <= 5) rows[1].push(p);
                    else if (pos >= 6 && pos <= 9) rows[2].push(p);
                    else if (pos >= 10) rows[3].push(p);
                    else rows[3].push(p); // احتياطي لو لم يجد المركز
                });
                return rows.filter(r => r.length > 0);
            };

            const renderRows = (playersData) => {
                if(!playersData || playersData.length === 0) return '';
                const rows = categorizePlayers(playersData);
                let rHtml = '';
                rows.forEach(r => {
                    rHtml += `<div class="st-formation-row">`;
                    r.forEach(p => {
                        const pImg = (p.image && p.image !== "") ? p.image : p.Player_Image;
                        const pName = p.name || p.Name || "لاعب";
                        const pNum = p.number || p.Number || "-";
                        
                        rHtml += `
                        <div class="st-player">
                            <img src="${pImg}" class="st-player-img" onerror="this.src='https://dummyimage.com/40/1e293b/fff&text=${pNum}'">
                            <div class="st-player-info"><span style="color:#facc15;">${pNum}</span> ${pName.split(' ').pop()}</div>
                        </div>`;
                    });
                    rHtml += `</div>`;
                });
                return rHtml;
            };

            lineupTab.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:15px; font-weight:bold;">
                    <span style="color:var(--st-sport-primary);">${bridge.t1}</span>
                    <span style="color:var(--st-sport-red);">${bridge.t2}</span>
                </div>
                <div class="st-pitch">
                    <div class="st-pitch-lines"></div>
                    <div style="height:50%; display:flex; flex-direction:column; justify-content:space-between; padding-bottom:10px; z-index:5;">
                        ${renderRows(lineups.team1.starting || lineups.team1.lineup)}
                    </div>
                    <div style="height:50%; display:flex; flex-direction:column-reverse; justify-content:space-between; padding-top:10px; z-index:5;">
                        ${renderRows(lineups.team2.starting || lineups.team2.lineup)}
                    </div>
                </div>
            `;
        } else {
            lineupTab.innerHTML = "<p style='text-align:center; padding:30px; font-weight:bold; color:var(--st-sport-muted);'>التشكيلات لم تصدر بعد.</p>";
        }
    }

    // ==========================================
    // المشغل الآمن
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
