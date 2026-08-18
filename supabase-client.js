// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://ykkhkgajzyxsgoamtmnn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NOH7uJlEoPf6wcT87DNBug_izzR-4VF';

// ============================================================
// TOAST SYSTEM
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
// REDIRECT TO LOGIN
// ============================================================
function redirectToLogin() {
    console.log('🚪 جاري التوجيه لتسجيل الدخول...');
    localStorage.removeItem('rollex_session');
    sessionStorage.removeItem('rollex_session');
    window.location.href = 'login.html';
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
    if (!token) {
        console.warn('⚠️ لا يوجد توكن، جاري التوجيه لتسجيل الدخول...');
        redirectToLogin();
        return [];
    }

    var companyId = await getCompanyId();
    if (!companyId) {
        console.warn('⚠️ لم يتم العثور على company_id');
        return [];
    }

    try {
        var url = SUPABASE_URL + '/rest/v1/' + tableName + '?select=*&company_id=eq.' + companyId;
        if (orderBy) url += '&order=' + orderBy;

        console.log('📤 محاولة جلب من:', tableName, 'بـ company_id:', companyId);

        var response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            console.warn('⚠️ فشل جلب ' + tableName + ' بسبب خطأ ' + response.status);
            console.warn('🔍 عنوان الطلب:', url);
            return [];
        }

        var data = await response.json();
        console.log('✅ تم جلب ' + data.length + ' سجل من ' + tableName);
        return data || [];

    } catch (error) {
        console.error('❌ خطأ في جلب ' + tableName + ':', error);
        return [];
    }
}

// ============================================================
// GENERIC INSERT
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

// ============================================================
// LOGOUT
// ============================================================
async function logout() {
    console.log('🚪 جاري تسجيل الخروج...');
    localStorage.removeItem('rollex_session');
    sessionStorage.removeItem('rollex_session');
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
        if (!session) {
            console.log('ℹ️ لا توجد جلسة، ننتظر...');
            return;
        }

        var token = session.access_token;
        if (!token) {
            console.log('ℹ️ لا يوجد توكن، ننتظر...');
            return;
        }

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
                        console.log('⚠️ فشل تجديد الجلسة، سيتم طلب تسجيل الدخول...');
                        redirectToLogin();
                    }
                });
            }
        })
        .catch(function(error) {
            console.warn('⚠️ خطأ في التحقق من الجلسة:', error.message);
        });

    }, 30000);

    console.log('✅ بدأ مراقبة الجلسة');
}

// ============================================================
// CHECK SESSION ON LOAD
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

console.log('✅ تم تحميل supabase-client.js (النسخة النهائية المُبسطة)');
