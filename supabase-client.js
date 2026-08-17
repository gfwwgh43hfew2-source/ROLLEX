// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://ykkhkgajzyxsgoamtmnn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NOH7uJlEoPf6wcT87DNBug_izzR-4VF';

// ============================================================
// TOAST SYSTEM - نسخة متقدمة مع أزرار
// ============================================================
function showToast(title, message, type = 'success', buttons = null) {
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');

    var iconMap = {
        'success': { icon: 'fa-check-circle', cls: 'success' },
        'error': { icon: 'fa-times-circle', cls: 'error' },
        'warning': { icon: 'fa-exclamation-triangle', cls: 'warning' }
    };
    var t = iconMap[type] || iconMap['warning'];

    var buttonsHtml = '';
    if (buttons && buttons.length > 0) {
        buttonsHtml = '<div class="toast-actions">';
        buttons.forEach(function(btn) {
            buttonsHtml += '<button class="' + btn.class + '" data-value="' + btn.value + '">' + btn.label + '</button>';
        });
        buttonsHtml += '</div>';
    }

    toast.innerHTML = `
        <span class="icon ${t.cls}"><i class="fas ${t.icon}"></i></span>
        <div class="content">
            <div class="title">${title}</div>
            <div class="message">${message}</div>
            ${buttonsHtml}
        </div>
        <button class="close"><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(function() {
        toast.classList.add('show');
    });

    return new Promise(function(resolve) {
        var timeout = setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { if (toast.parentElement) toast.remove(); }, 400);
            resolve(null);
        }, 5000);

        toast.querySelector('.close').addEventListener('click', function() {
            clearTimeout(timeout);
            toast.classList.remove('show');
            setTimeout(function() { if (toast.parentElement) toast.remove(); }, 400);
            resolve(null);
        });

        if (buttons && buttons.length > 0) {
            toast.querySelectorAll('.toast-actions button').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var val = this.dataset.value;
                    clearTimeout(timeout);
                    toast.classList.remove('show');
                    setTimeout(function() { if (toast.parentElement) toast.remove(); }, 400);
                    resolve(val);
                });
            });
        }
    });
}

// ============================================================
// SESSION FUNCTIONS
// ============================================================
function getSession() {
    var session = localStorage.getItem('rollex_session');
    if (!session) {
        console.warn('⚠️ لا توجد جلسة في localStorage');
        return null;
    }
    try {
        return JSON.parse(session);
    } catch (e) {
        console.error('❌ فشل تحليل الجلسة:', e);
        localStorage.removeItem('rollex_session');
        return null;
    }
}

function getToken() {
    var session = getSession();
    return session ? session.access_token : null;
}

async function refreshSession() {
    var session = getSession();
    if (!session || !session.refresh_token) {
        console.warn('⚠️ لا يوجد refresh_token لتجديد الجلسة');
        return false;
    }

    try {
        var response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        });

        if (!response.ok) {
            console.warn('⚠️ فشل تجديد الجلسة:', response.status);
            return false;
        }

        var data = await response.json();
        if (data.access_token) {
            var newSession = {
                access_token: data.access_token,
                refresh_token: data.refresh_token || session.refresh_token,
                expires_at: Date.now() + ((data.expires_in || 3600) * 1000)
            };
            localStorage.setItem('rollex_session', JSON.stringify(newSession));
            console.log('✅ تم تجديد الجلسة بنجاح');
            return true;
        }
        return false;

    } catch (error) {
        console.error('❌ خطأ في تجديد الجلسة:', error);
        return false;
    }
}

// ============================================================
// REDIRECT TO LOGIN - معدل (بدون إنهاء فوري)
// ============================================================
function redirectToLogin() {
    console.log('🚪 جاري التوجيه لتسجيل الدخول...');
    
    // حفظ سبب التوجيه
    sessionStorage.setItem('logout_reason', 'session_expired');
    
    // تنظيف البيانات
    localStorage.removeItem('rollex_session');
    sessionStorage.removeItem('rollex_session');
    localStorage.removeItem('user');
    localStorage.removeItem('rollex_treasury_entries');
    
    // إيقاف مراقبة الجلسة
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    sessionMonitorStarted = false;
    
    // عرض رسالة
    showToast('⚠️ انتهت الجلسة', 'يرجى تسجيل الدخول مجدداً', 'warning');
    
    // تأخير بسيط قبل التوجيه
    setTimeout(function() {
        window.location.href = 'login.html';
    }, 1500);
}

// ============================================================
// GET CURRENT USER PROFILE
// ============================================================
async function getCurrentUserProfile() {
    var token = getToken();
    if (!token) {
        console.warn('⚠️ لا يوجد توكن');
        return null;
    }

    try {
        var userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!userResponse.ok) {
            console.warn('⚠️ فشل جلب المستخدم:', userResponse.status);
            return null;
        }

        var user = await userResponse.json();

        var profileResponse = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=*&id=eq.' + user.id, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!profileResponse.ok) {
            console.warn('⚠️ فشل جلب البروفايل:', profileResponse.status);
            return null;
        }

        var data = await profileResponse.json();
        return data && data.length > 0 ? data[0] : null;

    } catch (error) {
        console.error('❌ خطأ في جلب البروفايل:', error);
        return null;
    }
}

// ============================================================
// GET COMPANY ID
// ============================================================
async function getCompanyId() {
    var token = getToken();
    if (!token) return null;

    try {
        var userResponse = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!userResponse.ok) return null;
        var user = await userResponse.json();

        var profileResponse = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=company_id&id=eq.' + user.id, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!profileResponse.ok) return null;
        var data = await profileResponse.json();
        return data && data.length > 0 ? data[0].company_id : null;

    } catch (error) {
        console.error('❌ خطأ في جلب company_id:', error);
        return null;
    }
}

// ============================================================
// GENERIC GET
// ============================================================
async function getTable(tableName, orderBy) {
    var token = getToken();
    if (!token) return [];

    var companyId = await getCompanyId();
    if (!companyId) return [];

    try {
        var url = SUPABASE_URL + '/rest/v1/' + tableName + '?select=*&company_id=eq.' + companyId;
        if (orderBy) url += '&order=' + orderBy;

        var response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) return [];
        return (await response.json()) || [];

    } catch (error) {
        console.error('❌ خطأ في جلب ' + tableName + ':', error);
        return [];
    }
}

// ============================================================
// GENERIC INSERT (returns inserted row)
// ============================================================
async function insertRow(tableName, payload) {
    var token = getToken();
    if (!token) throw new Error('يرجى تسجيل الدخول أولاً');

    var response = await fetch(SUPABASE_URL + '/rest/v1/' + tableName, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        var errorData = await response.text();
        throw new Error(errorData);
    }

    var result = await response.json();
    return Array.isArray(result) ? result[0] : result;
}

// ============================================================
// GENERIC PATCH
// ============================================================
async function patchRow(tableName, id, payload) {
    var token = getToken();
    if (!token) return;

    await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?id=eq.' + id, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
    });
}

// ============================================================
// GENERIC DELETE
// ============================================================
async function deleteRows(tableName, column, value) {
    var token = getToken();
    if (!token) return;

    await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?' + column + '=eq.' + value, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + token
        }
    });
}

// ============================================================
// FORMAT NUMBER
// ============================================================
function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatNumberWithCommas(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return Number(num).toLocaleString('ar-EG');
}

function cleanNumber(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    var cleaned = String(value).replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
}

// ============================================================
// FORMAT DATE
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        var date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        return day + '/' + month + '/' + year;
    } catch (e) {
        return '-';
    }
}

function getArabicDay(dateStr) {
    if (!dateStr) return '';
    try {
        var parts = dateStr.split('-');
        if (parts.length !== 3) return '';
        var year = parseInt(parts[0]);
        var month = parseInt(parts[1]) - 1;
        var day = parseInt(parts[2]);
        var date = new Date(year, month, day);
        if (isNaN(date.getTime())) return '';
        var days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        return days[date.getDay()];
    } catch (e) {
        return '';
    }
}

// ============================================================
// FETCH WITH RETRY
// ============================================================
async function fetchWithRetry(url, options, maxRetries = 3) {
    var lastError = null;

    for (var attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 محاولة ${attempt}/${maxRetries}...`);

            var token = getToken();
            if (!token && attempt === 1) {
                var refreshed = await refreshSession();
                if (refreshed) {
                    token = getToken();
                    if (token && options.headers) {
                        options.headers['Authorization'] = 'Bearer ' + token;
                    }
                } else {
                    // لا نطرد المستخدم فوراً، نتركه يحاول مرة أخرى
                    console.warn('⚠️ فشل تجديد الجلسة، محاولة مرة أخرى...');
                    continue;
                }
            }

            var response = await fetch(url, options);

            if (response.status === 401) {
                console.warn('⚠️ توكن غير صالح (401)، محاولة تجديد الجلسة...');
                var refreshed = await refreshSession();
                if (refreshed) {
                    var newToken = getToken();
                    if (options.headers) {
                        options.headers['Authorization'] = 'Bearer ' + newToken;
                    }
                    console.log('✅ تم تجديد الجلسة، إعادة المحاولة...');
                    continue;
                } else {
                    // لا نطرد المستخدم فوراً، نتركه يحاول مرة أخرى
                    console.warn('⚠️ فشل تجديد الجلسة، محاولة مرة أخرى...');
                    continue;
                }
            }

            if (response.ok) return response;

            if (response.status === 429 || response.status >= 500) {
                console.warn(`⚠️ محاولة ${attempt}/${maxRetries} فشلت (${response.status})، إعادة المحاولة...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 1500));
                continue;
            }

            return response;

        } catch (error) {
            lastError = error;
            console.warn(`⚠️ محاولة ${attempt}/${maxRetries} فشلت:`, error.message);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, attempt * 1500));
            }
        }
    }

    throw lastError || new Error('فشل بعد عدة محاولات');
}

// ============================================================
// LOGOUT - معدل (مع إيقاف المراقبة)
// ============================================================
async function logout() {
    console.log('🚪 جاري تسجيل الخروج...');

    // إيقاف مراقبة الجلسة
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    sessionMonitorStarted = false;

    try {
        localStorage.removeItem('rollex_session');
        sessionStorage.removeItem('rollex_session');
        localStorage.removeItem('user');
        localStorage.removeItem('rollex_treasury_entries');
        console.log('✅ تم تسجيل الخروج بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الخروج:', error);
    }

    window.location.href = 'login.html';
}

// ============================================================
// SESSION MONITOR - معدل (لا يطرد المستخدم فوراً)
// ============================================================
var monitorInterval = null;
var sessionMonitorStarted = false;

function startSessionMonitor() {
    if (sessionMonitorStarted) return;
    sessionMonitorStarted = true;

    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }

    monitorInterval = setInterval(function() {
        var session = getSession();
        if (!session) {
            console.log('ℹ️ لا توجد جلسة، ننتظر...');
            return;
        }

        // التحقق من صلاحية التوكن عن طريق Supabase
        var token = session.access_token;
        if (!token) {
            console.log('ℹ️ لا يوجد توكن، ننتظر...');
            return;
        }

        // محاولة التحقق من صلاحية التوكن
        fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        })
        .then(function(response) {
            if (response.ok) {
                console.log('✅ الجلسة لا تزال صالحة');
                return;
            }

            if (response.status === 401) {
                console.log('⚠️ التوكن منتهي، محاولة التجديد...');
                refreshSession().then(function(refreshed) {
                    if (!refreshed) {
                        console.log('⚠️ فشل تجديد الجلسة، سيتم طلب تسجيل الدخول بعد دقيقة...');
                        // نعطي المستخدم مهلة دقيقة قبل طرده
                        setTimeout(function() {
                            var newSession = getSession();
                            if (!newSession) {
                                redirectToLogin();
                            }
                        }, 60000); // دقيقة كاملة
                    }
                });
            }
        })
        .catch(function(error) {
            console.warn('⚠️ خطأ في التحقق من الجلسة:', error.message);
        });

    }, 30000); // كل 30 ثانية

    console.log('✅ بدأ مراقبة الجلسة');
}

// ============================================================
// CHECK SESSION ON LOAD - معدل (لا يطرد المستخدم فوراً)
// ============================================================
async function checkSessionAndRedirect() {
    var session = getSession();
    if (!session) {
        console.log('ℹ️ لا توجد جلسة، يرجى تسجيل الدخول');
        return false;
    }

    var token = getToken();
    if (!token) {
        console.log('ℹ️ لا يوجد توكن، يرجى تسجيل الدخول');
        return false;
    }

    try {
        var response = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            console.log('⚠️ التوكن غير صالح، محاولة التجديد...');
            var refreshed = await refreshSession();
            if (!refreshed) {
                console.log('⚠️ فشل تجديد الجلسة، سيتم طلب تسجيل الدخول...');
                // لا نطرد المستخدم فوراً، نعطيه فرصة
                return false;
            }
            return true;
        }

        return true;

    } catch (error) {
        console.error('❌ خطأ في التحقق من الجلسة:', error);
        return false;
    }
}

// ============================================================
// GENERIC STATUS BADGE
// ============================================================
function getStatusBadge(status) {
    var statusText = status || '-';
    var statusClass = '';

    if (statusText.includes('نشط') || statusText.includes('active')) {
        statusClass = 'active';
        statusText = 'نشط';
    } else if (statusText.includes('غير نشط') || statusText.includes('inactive')) {
        statusClass = 'inactive';
        statusText = 'غير نشط';
    } else if (statusText.includes('موقوف') || statusText.includes('suspended')) {
        statusClass = 'suspended';
        statusText = 'موقوف';
    } else {
        return '<span class="badge-status">' + statusText + '</span>';
    }

    return '<span class="badge-status ' + statusClass + '">' + statusText + '</span>';
}

// ============================================================
// GET URL PARAMETER
// ============================================================
function getUrlParam(param) {
    var params = new URLSearchParams(window.location.search);
    return params.get(param);
}

// ============================================================
// FETCH FROM GOOGLE SHEETS
// ============================================================
async function fetchSheetData(sheetId, sheetName) {
    var url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:csv&sheet=' + sheetName;
    var response = await fetch(url);
    if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
    var csvText = await response.text();
    var lines = csvText.split('\n').filter(function(line) { return line.trim() !== ''; });
    return lines.map(function(line) {
        var row = [];
        var current = '';
        var insideQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var char = line[i];
            if (char === '"') {
                insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
                row.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim());
        return row;
    });
}

// ============================================================
// PARSE CSV LINE
// ============================================================
function parseCSVLine(line) {
    var row = [];
    var current = '';
    var insideQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var char = line[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            row.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    row.push(current.trim());
    return row;
}

console.log('✅ تم تحميل supabase-client.js (النسخة المُصلَحة)');
