(function() {
    'use strict';

    // 1. التحقق من وجود رخصة العميل في القالب
    if (!window.stSportsConfig || !window.stSportsConfig.token || !window.stSportsConfig.domain) {
        console.error("ST Engine: Missing Client License.");
        return; 
    }

    const API_BASE_URL = "https://app.sitegeeky.com/football-api/sse";
    const API_TOKEN = window.stSportsConfig.token; 
    const CLIENT_DOMAIN = window.stSportsConfig.domain;
    
    let eventSource = null;

    // ==========================================
    // محرك جدول المباريات (الصفحة الرئيسية)
    // ==========================================
    function initSchedule() {
        const scheduleApp = document.getElementById('st-matches-content');
        if (!scheduleApp) return;

        // الاتصال بالـ SSE لجلب جدول المباريات
        const sseUrl = `${API_BASE_URL}?token=${API_TOKEN}&domain=${CLIENT_DOMAIN}`;
        
        eventSource = new EventSource(sseUrl);

        eventSource.addEventListener('update', function(e) {
            try {
                const data = JSON.parse(e.data);
                if(data.success && data.data) {
                    renderSchedule(data.data, scheduleApp);
                }
            } catch(err) {}
        });

        eventSource.onerror = function() {
            scheduleApp.innerHTML = '<div style="padding:20px; text-align:center; color:red;">تعذر الاتصال بخادم المباريات أو الترخيص غير صالح.</div>';
            eventSource.close();
        };
    }

    function renderSchedule(matches, container) {
        // [نفس كود توزيع الجدول الذي برمجناه سابقاً ليتوافق مع الـ CSS النقي]
        const leagues = {};
        matches.forEach(m => {
            if(!leagues[m.league]) leagues[m.league] = [];
            leagues[m.league].push(m);
        });

        let html = '';
        for (const [leagueName, leagueMatches] of Object.entries(leagues)) {
            html += `<div class="st-league-header"><img src="https://img.btolat.com/teamslogo/default.png" alt="League"><span>${leagueName}</span></div>`;
            leagueMatches.forEach(m => {
                const score = m.score ? m.score : 'VS';
                const statusClass = (m.status.includes('مباشر') || m.status.includes('الشوط')) ? 'live' : '';
                
                html += `
                <a href="/p/match.html?match_id=${m.match_id}" class="st-match-row">
                    <div class="st-team st-team-right">
                        <span class="st-team-name">${m.team1}</span>
                        <img src="${m.team1_logo}" alt="Team 1">
                    </div>
                    <div class="st-match-center">
                        <div class="st-match-score">${score}</div>
                        <span class="st-match-status ${statusClass}">${m.status}</span>
                    </div>
                    <div class="st-team st-team-left">
                        <img src="${m.team2_logo}" alt="Team 2">
                        <span class="st-team-name">${m.team2}</span>
                    </div>
                </a>`;
            });
        }
        container.innerHTML = html;
    }

    // ==========================================
    // محرك تفاصيل المباراة (الصفحة الفردية)
    // ==========================================
    function initMatchDetails() {
        const detailsApp = document.getElementById('st-match-details-app');
        if (!detailsApp) return;

        // التقاط الـ ID من الرابط
        const urlParams = new URLSearchParams(window.location.search);
        const matchId = urlParams.get('match_id');
        if (!matchId) { detailsApp.innerHTML = "<h3 style='text-align:center; padding:50px;'>لم يتم تحديد مباراة.</h3>"; return; }

        // تفعيل أزرار التبويبات
        document.querySelectorAll('.st-d-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.st-d-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.st-tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.getAttribute('data-target')).classList.add('active');
            });
        });

        // الاتصال بالـ SSE لجلب تفاصيل المباراة المباشرة
        const sseUrl = `${API_BASE_URL}?match_id=${matchId}&token=${API_TOKEN}&domain=${CLIENT_DOMAIN}`;
        
        eventSource = new EventSource(sseUrl);

        eventSource.addEventListener('update', function(e) {
            try {
                const data = JSON.parse(e.data);
                const match = Array.isArray(data) ? data[0] : data; 
                renderMatchDetails(match);
            } catch(err) { console.error("JSON Error"); }
        });
    }

    function renderMatchDetails(m) {
        // 1. تحديث لوحة النتيجة
        const sb = document.getElementById('st-match-scoreboard');
        if(sb) {
            const score = m.score ? m.score : 'VS';
            const timeStr = m.time || m.timer || m.status;
            const statusClass = m.status.includes('مباشر') ? 'live' : '';
            sb.innerHTML = `
                <div class="st-sb-team">
                    <img src="${m.team1_logo || 'https://dummyimage.com/80'}" alt="T1">
                    <div class="st-sb-name">${m.team1 || 'الفريق 1'}</div>
                </div>
                <div class="st-sb-center">
                    <div class="st-sb-time ${statusClass}">${timeStr}</div>
                    <div class="st-sb-score">${score}</div>
                    <div class="st-sb-stadium">${m.stadium || 'يحدد لاحقاً'}</div>
                </div>
                <div class="st-sb-team">
                    <img src="${m.team2_logo || 'https://dummyimage.com/80'}" alt="T2">
                    <div class="st-sb-name">${m.team2 || 'الفريق 2'}</div>
                </div>
            `;
        }

        // 2. تحديث المقال التلقائي
        const articleTab = document.getElementById('st-tab-article');
        if(articleTab) {
            articleTab.innerHTML = `
                <h3 style="color:var(--st-primary); margin-bottom:15px; font-weight:900;">تقرير وملخص المواجهة</h3>
                <p style="font-size:15px; line-height:1.8;">
                في مواجهة نارية ضمن المنافسات، يتقابل <b>${m.team1}</b> مع نظيره <b>${m.team2}</b> على أرضية ملعب <b>${m.stadium || 'الرئيسي'}</b>. 
                المباراة حالياً في حالة (<b>${m.status}</b>) والنتيجة المسجلة حتى الآن هي <b>${m.score || 'التعادل السلبي'}</b>.
                سنوافيكم بكافة التحديثات والأحداث المباشرة من خلال التبويبات المرفقة.
                </p>
            `;
        }

        // 3. بناء الإحصائيات (Progress Bars)
        const statsTab = document.getElementById('st-tab-stats');
        if (statsTab && m.statistics && m.statistics.length > 0) {
            let statsHtml = '';
            m.statistics.forEach(stat => {
                // استخراج الأرقام فقط لحساب النسبة المئوية للبار
                const val1 = parseInt(stat.team1.replace(/[^0-9]/g, '')) || 0;
                const val2 = parseInt(stat.team2.replace(/[^0-9]/g, '')) || 0;
                const total = val1 + val2 === 0 ? 1 : val1 + val2;
                const pct1 = (val1 / total) * 100;
                const pct2 = (val2 / total) * 100;

                statsHtml += `
                <div class="st-stat-row">
                    <div class="st-stat-labels">
                        <span>${stat.team1}</span>
                        <span style="color:var(--st-primary);">${stat.name}</span>
                        <span>${stat.team2}</span>
                    </div>
                    <div class="st-stat-bar-bg">
                        <div class="st-stat-bar-t1" style="width: ${pct1}%"></div>
                        <div class="st-stat-bar-t2" style="width: ${pct2}%"></div>
                    </div>
                </div>`;
            });
            statsTab.innerHTML = statsHtml;
        } else if (statsTab) {
            statsTab.innerHTML = "<p style='text-align:center;'>الإحصائيات غير متوفرة حالياً.</p>";
        }

        // 4. بناء الأحداث المباشرة (Timeline)
        const eventsTab = document.getElementById('st-tab-events');
        if (eventsTab && m.events && m.events.length > 0) {
            let evHtml = '<div class="st-timeline">';
            m.events.forEach(ev => {
                // تحديد موقع الحدث بناءً على الفريق (1 يمين، 2 يسار)
                const alignClass = ev.team === 1 ? 'st-event-t1' : 'st-event-t2';
                
                // تحديد أيقونة الحدث
                let icon = '⏱️';
                if(ev.type.includes('هدف')) icon = '⚽';
                else if(ev.type.includes('صفراء')) icon = '🟨';
                else if(ev.type.includes('حمراء')) icon = '🟥';
                else if(ev.type.includes('تبديل')) icon = '🔄';

                evHtml += `
                <div class="st-event-item ${alignClass}">
                    <div class="st-event-time">${ev.time}'</div>
                    <div class="st-event-box">
                        <div class="st-event-desc">${icon} ${ev.player || 'حدث'}</div>
                        ${ev.assist ? `<div class="st-event-sub">مساعدة: ${ev.assist}</div>` : ''}
                    </div>
                </div>`;
            });
            evHtml += '</div>';
            eventsTab.innerHTML = evHtml;
        } else if (eventsTab) {
            eventsTab.innerHTML = "<p style='text-align:center;'>لم يتم تسجيل أحداث بعد.</p>";
        }

        // 5. بناء التشكيل (3D Pitch Mapping)
        const lineupTab = document.getElementById('st-tab-lineup');
        if (lineupTab && m.lineups && m.lineups.team1 && m.lineups.team2) {
            // سنقوم برسم التشكيل الأساسي للفريقين بشكل متقابل (Top / Bottom)
            const t1Start = m.lineups.team1.starting || [];
            const t2Start = m.lineups.team2.starting || [];

            // دالة مساعدة لتوزيع اللاعبين في صفوف (حارس، دفاع، وسط، هجوم)
            const renderRows = (players) => {
                if(players.length === 0) return '';
                // توزيع افتراضي مبسط: 1 حارس، 4 دفاع، 3 وسط، 3 هجوم (إذا كان العدد 11)
                const rows = players.length >= 11 
                    ? [ players.slice(0,1), players.slice(1,5), players.slice(5,8), players.slice(8,11) ] 
                    : [players]; // في حال الداتا ناقصة
                
                let rHtml = '';
                rows.forEach(r => {
                    rHtml += `<div class="st-formation-row">`;
                    r.forEach(p => {
                        rHtml += `
                        <div class="st-player">
                            <img src="${p.image}" class="st-player-img" onerror="this.src='https://dummyimage.com/40/1e293b/fff&text=${p.number}'">
                            <div class="st-player-info"><span class="st-player-num">${p.number}</span> ${p.name.split(' ').pop()}</div>
                        </div>`;
                    });
                    rHtml += `</div>`;
                });
                return rHtml;
            };

            lineupTab.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:15px; font-weight:bold;">
                    <span style="color:var(--st-primary);">${m.team1}</span>
                    <span style="color:var(--st-red);">${m.team2}</span>
                </div>
                <div class="st-pitch">
                    <div class="st-pitch-lines"></div>
                    <div style="height:50%; display:flex; flex-direction:column; justify-content:space-between; padding-bottom:20px;">
                        ${renderRows(t1Start)}
                    </div>
                    <div style="height:50%; display:flex; flex-direction:column-reverse; justify-content:space-between; padding-top:20px;">
                        ${renderRows(t2Start)}
                    </div>
                </div>
            `;
        } else if (lineupTab) {
            lineupTab.innerHTML = "<p style='text-align:center;'>التشكيلات لم تصدر بعد.</p>";
        }
    }

    // ==========================================
    // مشغل المحرك (نقطة الدخول)
    // ==========================================
    if (document.getElementById('st-matches-widget')) {
        initSchedule();
    } else if (document.getElementById('st-match-details-app')) {
        initMatchDetails();
    }

})();
