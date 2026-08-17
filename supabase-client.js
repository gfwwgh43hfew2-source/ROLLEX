// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://ykkhkgajzyxsgoamtmnn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NOH7uJlEoPf6wcT87DNBug_izzR-4VF';

// ============================================================
// TOAST SYSTEM
// ============================================================
function showToast(title, message, type = 'success') {
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

    toast.innerHTML = `
        <span class="icon ${t.cls}"><i class="fas ${t.icon}"></i></span>
        <div class="content">
            <div class="title">${title}</div>
            <div class="message">${message}</div>
        </div>
        <button class="close"><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(function() {
        toast.classList.add('show');
    });

    var timeout = setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { if (toast.parentElement) toast.remove(); }, 400);
    }, 5000);

    toast.querySelector('.close').addEventListener('click', function() {
        clearTimeout(timeout);
        toast.classList.remove('show');
        setTimeout(function() { if (toast.parentElement) toast.remove(); }, 400);
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

function redirectToLogin() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    sessionMonitorStarted = false;
    localStorage.removeItem('rollex_session');
    sessionStorage.removeItem('rollex_session');
    showToast('⚠️ انتهت الجلسة', 'يرجى تسجيل الدخول مجدداً', 'warning');
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
        showToast('⚠️ تنبيه', 'يرجى تسجيل الدخول أولاً', 'warning');
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
            localStorage.removeItem('rollex_session');
            window.location.href = 'login.html';
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
                    redirectToLogin();
                    throw new Error('لا توجد جلسة صالحة');
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
                    redirectToLogin();
                    throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
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
// LOGOUT
// ============================================================
async function logout() {
    console.log('🚪 جاري تسجيل الخروج...');

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
// SESSION MONITOR
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
        if (session && session.expires_at) {
            var timeLeft = session.expires_at - Date.now();
            if (timeLeft < 60000 && timeLeft > 0) {
                showToast('⏳ تنبيه', 'جلسة العمل ستنتهي خلال دقيقة', 'warning');
            }
            if (timeLeft <= 0) {
                redirectToLogin();
            }
        }
    }, 30000);

    console.log('✅ بدأ مراقبة الجلسة');
}

// ============================================================
// CHECK SESSION ON LOAD
// ============================================================
async function checkSessionAndRedirect() {
    var session = getSession();
    if (!session) {
        redirectToLogin();
        return false;
    }

    var token = getToken();
    if (!token) {
        redirectToLogin();
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
            var refreshed = await refreshSession();
            if (!refreshed) {
                redirectToLogin();
                return false;
            }
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
