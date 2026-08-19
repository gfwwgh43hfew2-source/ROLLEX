// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = 'https://ykkhkgajzyxsgoamtmnn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NOH7uJlEoPf6wcT87DNBug_izzR-4VF';

// ============================================================
// SUPABASE CLIENT
// ============================================================
var supabaseClientInstance = null;

function getSupabaseClient() {
    if (typeof supabase === 'undefined') {
        console.error('❌ supabase library not loaded!');
        return null;
    }
    
    if (!supabaseClientInstance) {
        supabaseClientInstance = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storageKey: 'rollex_session'
            }
        });
        console.log('✅ تم إنشاء Supabase Client');
    }
    return supabaseClientInstance;
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

function setSession(sessionData) {
    if (sessionData) {
        localStorage.setItem('rollex_session', JSON.stringify(sessionData));
    } else {
        localStorage.removeItem('rollex_session');
    }
}

// ✅ دالة مسح الجلسة بالكامل
function clearSession() {
    console.log('🗑️ [clearSession] جاري مسح الجلسة بالكامل...');
    localStorage.removeItem('rollex_session');
    sessionStorage.removeItem('rollex_session');
    sessionStorage.clear();
    console.log('✅ [clearSession] تم مسح الجلسة بالكامل');
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
            setSession(newSession);
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
    clearSession();
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
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            console.error('❌ Supabase Client not available');
            return null;
        }
        
        var { data: userData, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !userData?.user) {
            console.warn('⚠️ فشل جلب المستخدم:', userError?.message);
            return null;
        }

        var { data: profileData, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userData.user.id)
            .single();

        if (profileError) {
            console.warn('⚠️ فشل جلب البروفايل:', profileError.message);
            return null;
        }

        console.log('✅ تم جلب البروفايل بنجاح');
        return profileData;

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
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            console.error('❌ Supabase Client not available');
            return null;
        }

        var { data: userData, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !userData?.user) {
            console.warn('⚠️ فشل جلب المستخدم:', userError?.message);
            return null;
        }

        var { data: profileData, error: profileError } = await supabaseClient
            .from('profiles')
            .select('company_id')
            .eq('id', userData.user.id)
            .single();

        if (profileError) {
            console.warn('⚠️ فشل جلب company_id:', profileError.message);
            return null;
        }

        console.log('✅ company_id:', profileData?.company_id);
        return profileData?.company_id || null;

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
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) {
            console.error('❌ Supabase Client not available');
            return [];
        }
        
        var query = supabaseClient
            .from(tableName)
            .select('*')
            .eq('company_id', companyId);

        if (orderBy) {
            var parts = orderBy.split('.');
            var orderField = parts[0] || 'created_at';
            var orderDirection = parts[1] === 'desc' ? 'desc' : 'asc';
            query = query.order(orderField, { ascending: orderDirection === 'asc' });
        }

        query = query.limit(100000);

        var { data, error } = await query;

        if (error) {
            console.error('❌ فشل جلب ' + tableName + ':', error.message);
            return [];
        }

        console.log('✅ تم جلب ' + (data?.length || 0) + ' سجل من ' + tableName);
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

    try {
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) throw new Error('Supabase Client not available');
        
        var { data, error } = await supabaseClient
            .from(tableName)
            .insert(payload)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;

    } catch (error) {
        console.error('❌ فشل الإدراج:', error);
        throw error;
    }
}

// ============================================================
// GENERIC UPSERT
// ============================================================
async function upsertRow(tableName, payload) {
    var token = getToken();
    if (!token) throw new Error('يرجى تسجيل الدخول أولاً');

    try {
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) throw new Error('Supabase Client not available');
        
        var { data, error } = await supabaseClient
            .from(tableName)
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;

    } catch (error) {
        console.error('❌ فشل التحديث:', error);
        throw error;
    }
}

// ============================================================
// GENERIC PATCH
// ============================================================
async function patchRow(tableName, id, payload) {
    var token = getToken();
    if (!token) return;

    try {
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) throw new Error('Supabase Client not available');
        
        var { error } = await supabaseClient
            .from(tableName)
            .update(payload)
            .eq('id', id);

        if (error) throw new Error(error.message);
        return true;

    } catch (error) {
        console.error('❌ فشل التحديث:', error);
        throw error;
    }
}

// ============================================================
// GENERIC DELETE
// ============================================================
async function deleteRows(tableName, column, value) {
    var token = getToken();
    if (!token) return;

    try {
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) throw new Error('Supabase Client not available');
        
        var { error } = await supabaseClient
            .from(tableName)
            .delete()
            .eq(column, value);

        if (error) throw new Error(error.message);
        return true;

    } catch (error) {
        console.error('❌ فشل الحذف:', error);
        throw error;
    }
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
// LOGOUT - النسخة النهائية مع مسح الجلسة
// ============================================================
async function logout() {
    console.log('🚪 [logout] جاري تسجيل الخروج...');
    
    try {
        var supabaseClient = getSupabaseClient();
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
            console.log('✅ [logout] تم تسجيل الخروج من Supabase');
        }
    } catch (error) {
        console.warn('⚠️ [logout] فشل تسجيل الخروج من Supabase:', error.message);
    }
    
    // ✅ مسح جميع البيانات المخزنة
    clearSession();
    
    // ✅ إعادة التوجيه لتسجيل الدخول
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

            if (response.status === 401 || response.status === 403) {
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
            if (response.status === 401 || response.status === 403) {
                console.log('⚠️ التوكن غير صالح، محاولة التجديد...');
                var refreshed = await refreshSession();
                if (!refreshed) {
                    console.log('⚠️ فشل تجديد الجلسة، سيتم طلب تسجيل الدخول...');
                    return false;
                }
                return true;
            }
            return false;
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
// PERMISSION FUNCTIONS
// ============================================================
async function hasPermission(module, permission, userId) {
    var token = getToken();
    if (!token) return false;

    var targetUserId = userId || (await getCurrentUserProfile())?.id;
    if (!targetUserId) return false;

    var profile = await getCurrentUserProfile();
    if (profile && profile.is_super_admin) return true;

    try {
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) return false;
        
        var companyId = await getCompanyId();
        if (!companyId) return false;

        var { data, error } = await supabaseClient
            .from('user_permissions')
            .select(permission)
            .eq('user_id', targetUserId)
            .eq('company_id', companyId)
            .eq('module', module);

        if (error) {
            console.error('❌ فشل التحقق من الصلاحية:', error.message);
            return false;
        }

        return data && data.length > 0 && data[0][permission] === true;

    } catch (error) {
        console.error('❌ خطأ في التحقق من الصلاحية:', error);
        return false;
    }
}

async function getUserPermissions(module, userId) {
    var token = getToken();
    if (!token) return {};

    var targetUserId = userId || (await getCurrentUserProfile())?.id;
    if (!targetUserId) return {};

    var profile = await getCurrentUserProfile();
    if (profile && profile.is_super_admin) {
        return { view: true, add: true, edit: true, delete: true, export: true };
    }

    try {
        var supabaseClient = getSupabaseClient();
        if (!supabaseClient) return {};
        
        var companyId = await getCompanyId();
        if (!companyId) return {};

        var { data, error } = await supabaseClient
            .from('user_permissions')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('company_id', companyId)
            .eq('module', module);

        if (error) {
            console.error('❌ فشل جلب الصلاحيات:', error.message);
            return {};
        }

        if (!data || data.length === 0) return {};

        return {
            view: data[0].can_view || false,
            add: data[0].can_add || false,
            edit: data[0].can_edit || false,
            delete: data[0].can_delete || false,
            export: data[0].can_export || false
        };

    } catch (error) {
        console.error('❌ خطأ في جلب الصلاحيات:', error);
        return {};
    }
}

async function checkPageAccess(module, permission) {
    permission = permission || 'view';
    var hasPerm = await hasPermission(module, permission);
    if (!hasPerm) {
        showToast('⚠️ غير مسموح', 'ليس لديك صلاحية للوصول إلى هذه الصفحة', 'error');
        setTimeout(function() {
            window.location.href = 'index.html';
        }, 2000);
        return false;
    }
    return true;
}

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================
window.clearSession = clearSession;
window.logout = logout;
window.getToken = getToken;
window.getSession = getSession;
window.getSupabaseClient = getSupabaseClient;
window.getCompanyId = getCompanyId;
window.getCurrentUserProfile = getCurrentUserProfile;
window.startSessionMonitor = startSessionMonitor;
window.redirectToLogin = redirectToLogin;
window.refreshSession = refreshSession;

// ============================================================
// FINAL LOG
// ============================================================
console.log('✅ تم تحميل supabase-client.js (النسخة النهائية مع clearSession)');
