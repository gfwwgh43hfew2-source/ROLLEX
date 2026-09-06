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
    try {
        var session = localStorage.getItem('rollex_session');
        if (!session) {
            session = sessionStorage.getItem('rollex_session');
        }
        if (!session) {
            console.warn('⚠️ لا توجد جلسة في localStorage');
            return null;
        }
        try {
            var parsed = JSON.parse(session);
            // التأكد من أن الجلسة تحتوي على access_token
            if (!parsed.access_token) {
                console.warn('⚠️ الجلسة لا تحتوي على access_token');
                return null;
            }
            return parsed;
        } catch (e) {
            console.error('❌ فشل تحليل الجلسة:', e);
            localStorage.removeItem('rollex_session');
            sessionStorage.removeItem('rollex_session');
            return null;
        }
    } catch (error) {
        console.error('❌ خطأ في getSession:', error);
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
        console.log('✅ تم حفظ الجلسة في localStorage');
    } else {
        localStorage.removeItem('rollex_session');
        sessionStorage.removeItem('rollex_session');
        console.log('🗑️ تم مسح الجلسة');
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

// ============================================================
// REFRESH SESSION
// ============================================================
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
var sessionRedirectInProgress = false;

function redirectToLogin() {
    if (sessionRedirectInProgress) return;
    sessionRedirectInProgress = true;

    console.log('🚪 انتهت الجلسة، جاري التوجيه لتسجيل الدخول...');
    clearSession();

    // محاولة عرض رسالة إذا كانت showToast متاحة
    try {
        if (typeof window.showToast === 'function') {
            window.showToast('⚠️ انتهت الجلسة', 'يرجى تسجيل الدخول مرة أخرى', 'warning');
        } else if (typeof showToast === 'function') {
            showToast('⚠️ انتهت الجلسة', 'يرجى تسجيل الدخول مرة أخرى', 'warning');
        }
    } catch (e) {}

    setTimeout(function() {
        window.location.href = 'login.html';
    }, 1200);
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

    // ✅ ملاحظة إصلاح: كنا بنستخدم supabaseClient.auth.getUser() هنا، لكنه
    // بيعتمد على أن مكتبة الـ SDK نفسها عندها جلسة داخلية مُهيّأة بشكلها
    // الصحيح. بما أن login.html بيبني الجلسة يدويًا (fetch مباشر) وبيحفظها
    // في localStorage بشكل مخصص، الـ SDK كان بيفشل يقرأها ("Auth session
    // missing")، فالدالة كانت بترجع null دايمًا حتى لو المستخدم مسجل دخول
    // فعليًا وصلاحياته سليمة. الحل: نستخدم fetch مباشر بالتوكن (بنفس الطريقة
    // الشغالة أصلاً في index.html) بدل الاعتماد على حالة الـ SDK الداخلية.
    var session = getSession();
    var userId = session && session.user && session.user.id;

    try {
        if (!userId) {
            var userResp = await fetch(SUPABASE_URL + '/auth/v1/user', {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + token
                }
            });
            if (!userResp.ok) {
                console.warn('⚠️ فشل جلب المستخدم من Auth:', userResp.status);
                return null;
            }
            var userData = await userResp.json();
            userId = userData && userData.id;
        }

        if (!userId) {
            console.warn('⚠️ لا يوجد معرف مستخدم');
            return null;
        }

        var profileResp = await fetch(
            SUPABASE_URL + '/rest/v1/profiles?select=*&id=eq.' + userId, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + token
                }
            }
        );

        if (!profileResp.ok) {
            console.warn('⚠️ فشل جلب البروفايل:', profileResp.status);
            return null;
        }

        var profiles = await profileResp.json();
        if (!profiles || profiles.length === 0) {
            console.warn('⚠️ لا يوجد بروفايل لهذا المستخدم');
            return null;
        }

        console.log('✅ تم جلب البروفايل بنجاح');
        return profiles[0];

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
    if (!token) {
        console.warn('⚠️ لا يوجد توكن');
        return null;
    }

    // ✅ نفس إصلاح getCurrentUserProfile(): بنعتمد على البروفايل اللي جبناه
    // بالـ fetch المباشر بدل auth.getUser() من الـ SDK.
    try {
        var profile = await getCurrentUserProfile();
        if (!profile) {
            console.warn('⚠️ لا يوجد بروفايل لجلب company_id منه');
            return null;
        }

        console.log('✅ company_id:', profile.company_id);
        return profile.company_id || null;

    } catch (error) {
        console.error('❌ خطأ في جلب company_id:', error);
        return null;
    }
}

// ============================================================
// GENERIC GET / INSERT / UPSERT / PATCH / DELETE
// ============================================================
// ✅ نفس إصلاح hasPermission/getUserPermissions فوق بالظبط: الدوال دي
// كانت بتستخدم supabaseClient.from(tableName)... (الـ SDK)، والـ SDK
// معندوش جلسة مستخدم حقيقية مُهيّأة (مفيش auth.setSession() في أي مكان
// في المشروع)، فأي طلب كان بيتبعت بمفتاح anon بس بدون Authorization:
// Bearer <توكن المستخدم>. النتيجة: أي صفحة بتستخدم getTable/insertRow/
// upsertRow/patchRow/deleteRows (زي treasuries.html والخزينة، المواد،
// المشتريات، إلخ) كانت بترجع دايمًا بيانات فاضية أو تفشل في الحفظ لأي
// مستخدم غير أدمن، لأن قاعدة البيانات (RLS) بتشوف auth.uid() = NULL
// وترفض الطلب — حتى لو صلاحيات المستخدم مضبوطة صح فعليًا.
// الحل: استخدام fetch() مباشر مع إرفاق Authorization: Bearer <توكن
// المستخدم الحالي> يدويًا لكل طلب (بنفس أسلوب getCurrentUserProfile
// وباقي الدوال الشغالة فوق) بدل الاعتماد على جلسة الـ SDK غير المُهيّأة.
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
        var url = SUPABASE_URL + '/rest/v1/' + tableName +
            '?select=*&company_id=eq.' + encodeURIComponent(companyId) + '&limit=100000';

        if (orderBy) {
            var parts = orderBy.split('.');
            var orderField = parts[0] || 'created_at';
            var orderDirection = parts[1] === 'desc' ? 'desc' : 'asc';
            url += '&order=' + encodeURIComponent(orderField) + '.' + orderDirection;
        }

        var response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            var errBody = await response.json().catch(function() { return {}; });
            console.error('❌ فشل جلب ' + tableName + ':', errBody.message || response.status);
            return [];
        }

        var data = await response.json();
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

        var result = await response.json().catch(function() { return null; });

        if (!response.ok) {
            throw new Error((result && result.message) || 'فشل الإدراج');
        }

        return Array.isArray(result) ? result[0] : result;

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
        var response = await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?on_conflict=id', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(payload)
        });

        var result = await response.json().catch(function() { return null; });

        if (!response.ok) {
            throw new Error((result && result.message) || 'فشل التحديث');
        }

        return Array.isArray(result) ? result[0] : result;

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
        var response = await fetch(SUPABASE_URL + '/rest/v1/' + tableName + '?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            var errBody = await response.json().catch(function() { return {}; });
            throw new Error(errBody.message || 'فشل التحديث');
        }

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
        var response = await fetch(
            SUPABASE_URL + '/rest/v1/' + tableName + '?' + encodeURIComponent(column) + '=eq.' + encodeURIComponent(value),
            {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + token,
                    'Prefer': 'return=minimal'
                }
            }
        );

        if (!response.ok) {
            var errBody = await response.json().catch(function() { return {}; });
            throw new Error(errBody.message || 'فشل الحذف');
        }

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
        console.log('ℹ️ لا توجد جلسة، جاري التوجيه لتسجيل الدخول...');
        redirectToLogin();
        return false;
    }

    var token = getToken();
    if (!token) {
        console.log('ℹ️ لا يوجد توكن، جاري التوجيه لتسجيل الدخول...');
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
            if (response.status === 401 || response.status === 403) {
                console.log('⚠️ التوكن غير صالح، محاولة التجديد...');
                var refreshed = await refreshSession();
                if (!refreshed) {
                    console.log('⚠️ فشل تجديد الجلسة، جاري التوجيه لتسجيل الدخول...');
                    redirectToLogin();
                    return false;
                }
                return true;
            }
            return false;
        }

        return true;

    } catch (error) {
        console.error('❌ خطأ في التحقق من الجلسة (قد تكون مشكلة اتصال):', error);
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
// ✅ ملاحظة إصلاح مهمة:
// كانت الدالتين دول بيستخدموا supabaseClient.from('user_permissions')...
// (يعني الـ SDK)، لكن الـ SDK هنا معندوش أي فكرة عن جلسة المستخدم
// الفعلية، لأن تسجيل الدخول (login.html) بيحفظ الجلسة يدويًا في
// localStorage عن طريق fetch مباشر، ومفيش أي مكان بيستدعي
// supabaseClient.auth.setSession(...) عشان "يعرّف" الـ SDK بيها.
// النتيجة: أي طلب عن طريق supabaseClient.from(...) كان بيتبعت بمفتاح
// anon بس (من غير Authorization: Bearer <توكن المستخدم الحقيقي>)،
// فقاعدة البيانات (RLS) كانت بتشوف auth.uid() = NULL، فترفض الطلب
// وترجّع نتيجة فاضية دايمًا - حتى لو الأدمن فعلاً حدد للمستخدم صلاحية
// "عرض" على موديول معيّن. وده اللي كان بيخلي أي موظف (غير أدمن) ياخد
// رسالة "ليس لديك صلاحية" على كل صفحة حتى بعد ضبط صلاحياته صح، ويترجع
// دايمًا لصفحته الرئيسية الافتراضية.
// الحل: استخدام fetch() مباشر مع إرفاق Authorization: Bearer <توكن
// المستخدم الحالي> يدويًا (بنفس الطريقة الشغالة أصلاً في
// getCurrentUserProfile/getCompanyId فوق) بدل الاعتماد على جلسة الـ SDK
// الداخلية غير المُهيّأة.
// ============================================================
async function hasPermission(module, permission, userId) {
    var token = getToken();
    if (!token) return false;

    var targetUserId = userId || (await getCurrentUserProfile())?.id;
    if (!targetUserId) return false;

    var profile = await getCurrentUserProfile();
    if (profile && profile.is_super_admin) return true;

    try {
        var companyId = await getCompanyId();
        if (!companyId) return false;

        // ✅ إصلاح: أعمدة الجدول اسمها can_view / can_add / can_edit /
        // can_delete / can_export (شوف users.html وقت الحفظ)، مش
        // view / add / edit... زي ما كانت الدالة بتفترض قبل كده. الفرق ده
        // كان بيخلي select= بيطلب عمود مش موجود، فالطلب كان بيفشل ويرجع
        // false دايمًا حتى لو الصلاحية متحددة صح فعلاً في قاعدة البيانات.
        var columnMap = {
            view: 'can_view',
            add: 'can_add',
            edit: 'can_edit',
            delete: 'can_delete',
            export: 'can_export'
        };
        var column = columnMap[permission] || permission;

        var url = SUPABASE_URL + '/rest/v1/user_permissions?select=' + encodeURIComponent(column) +
            '&user_id=eq.' + encodeURIComponent(targetUserId) +
            '&company_id=eq.' + encodeURIComponent(companyId) +
            '&module=eq.' + encodeURIComponent(module);

        var response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            console.error('❌ فشل التحقق من الصلاحية:', response.status);
            return false;
        }

        var data = await response.json();

        return data && data.length > 0 && data[0][column] === true;

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
        var companyId = await getCompanyId();
        if (!companyId) return {};

        var url = SUPABASE_URL + '/rest/v1/user_permissions?select=*' +
            '&user_id=eq.' + encodeURIComponent(targetUserId) +
            '&company_id=eq.' + encodeURIComponent(companyId) +
            '&module=eq.' + encodeURIComponent(module);

        var response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + token
            }
        });

        if (!response.ok) {
            console.error('❌ فشل جلب الصلاحيات:', response.status);
            return {};
        }

        var data = await response.json();

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
        // محاولة استخدام showToast
        try {
            if (typeof showToast === 'function') {
                showToast('⚠️ غير مسموح', 'ليس لديك صلاحية للوصول إلى هذه الصفحة', 'error');
            } else if (typeof window.showToast === 'function') {
                window.showToast('⚠️ غير مسموح', 'ليس لديك صلاحية للوصول إلى هذه الصفحة', 'error');
            } else {
                alert('⚠️ غير مسموح: ليس لديك صلاحية للوصول إلى هذه الصفحة');
            }
        } catch (e) {
            alert('⚠️ غير مسموح: ليس لديك صلاحية للوصول إلى هذه الصفحة');
        }

        // ✅ بدل ما نرجّع الجميع لـ index.html دايماً، نرجّع كل مستخدم
        // للصفحة الرئيسية المحددة له تحديداً (home_page)، ولو مش محددة
        // أو غير موجودة نرجع لـ index.html كافتراضي آمن.
        var target = 'index.html';
        try {
            var profile = await getCurrentUserProfile();
            if (profile && profile.home_page && typeof profile.home_page === 'string') {
                target = profile.home_page.trim() || 'index.html';
            }
        } catch (e) {
            console.warn('⚠️ فشل جلب home_page، سيتم التوجيه لـ index.html:', e);
        }

        // حماية من الحلقة اللانهائية: لو المستخدم أصلاً واقف على صفحته
        // الرئيسية ومحظور عليه فتحها (مثلاً لو صلاحياته اتغيرت لاحقاً)،
        // نوجهه لـ index.html بدل ما يعيد تحميل نفس الصفحة تاني وتاني.
        var currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        if (currentPage === target.toLowerCase()) {
            target = 'index.html';
        }

        setTimeout(function() {
            window.location.href = target;
        }, 2000);
        return false;
    }
    return true;
}

// ============================================================
// PERMISSION FUNCTIONS - دوال الصلاحيات البسيطة (المضافة حديثاً)
// ============================================================

// الحصول على صلاحيات المستخدم من الجلسة (بدون await)
function getUserPermissionsFromSession() {
    var session = getSession();
    if (!session || !session.user) {
        return null;
    }
    return {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role || 'employee',
        company_id: session.user.company_id || null,
        is_super_admin: session.user.is_super_admin || false
    };
}

// التحقق من أن المستخدم مدير عام
function isSuperAdmin() {
    try {
        var session = localStorage.getItem('rollex_session');
        if (session) {
            var parsed = JSON.parse(session);
            if (parsed && parsed.user && parsed.user.is_super_admin === true) {
                console.log('✅ [isSuperAdmin] true من localStorage');
                return true;
            }
        }
    } catch (e) {
        console.warn('⚠️ [isSuperAdmin] فشل قراءة الجلسة:', e);
    }
    
    console.log('❌ [isSuperAdmin] false');
    return false;
}

function isAdmin() {
    try {
        var session = localStorage.getItem('rollex_session');
        if (session) {
            var parsed = JSON.parse(session);
            if (parsed && parsed.user) {
                if (parsed.user.role === 'admin' || parsed.user.is_super_admin === true) {
                    console.log('✅ [isAdmin] true من localStorage');
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('⚠️ [isAdmin] فشل قراءة الجلسة:', e);
    }
    
    console.log('❌ [isAdmin] false');
    return false;
}

// التحقق من صلاحية معينة (view, add, edit, delete) - نسخة بسيطة من الجلسة
function hasPermissionSimple(module, action) {
    var user = getUserPermissionsFromSession();
    if (!user) return false;
    
    if (user.is_super_admin === true) return true;
    if (user.role === 'admin') return true;
    
    if (user.permissions && user.permissions[module]) {
        return user.permissions[module][action] === true;
    }
    
    return false;
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
window.getTable = getTable;
window.insertRow = insertRow;
window.upsertRow = upsertRow;
window.patchRow = patchRow;
window.deleteRows = deleteRows;
window.formatNumber = formatNumber;
window.formatNumberWithCommas = formatNumberWithCommas;
window.formatDate = formatDate;
window.cleanNumber = cleanNumber;
window.getStatusBadge = getStatusBadge;
window.hasPermission = hasPermission;
window.getUserPermissions = getUserPermissions;
window.checkPageAccess = checkPageAccess;

// دوال الصلاحيات البسيطة
window.getUserPermissionsFromSession = getUserPermissionsFromSession;
window.isSuperAdmin = isSuperAdmin;
window.isAdmin = isAdmin;
window.hasPermissionSimple = hasPermissionSimple;

// ============================================================
// AUTO SESSION GUARD
// ============================================================
(function() {
    // ✅ إصلاح: بعض الاستضافات بتشيل امتداد .html من الرابط (register بدل
    // register.html)، فالمقارنة بالاسم الكامل القديمة كانت بتفشل وتعتبر
    // register.html/login.html صفحات "محمية" غلط، فتطرد أي حد يفتحها فورًا
    // لصفحة تسجيل الدخول حتى لو مسجّلش دخول ولا فتح الفورم أصلاً.
    // الحل: نتحقق بمرونة (مع/من غير .html، مع/من غير / في الآخر).
    var pathname = window.location.pathname.toLowerCase();
    var currentPage = (pathname.split('/').pop() || '').replace(/\.html$/, '');
    var publicPages = ['login', 'register', '', 'index'];

    if (publicPages.indexOf(currentPage) !== -1) {
        console.log('ℹ️ [AutoGuard] صفحة عامة، تخطي فحص الجلسة:', currentPage || '(root)');
        return;
    }

    // ننتظر تحميل الصفحة ثم نفحص الجلسة
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            checkSessionAndRedirect().then(function(isValid) {
                if (isValid) {
                    startSessionMonitor();
                }
            });
        }, 500);
    });
})();

// ============================================================
// FINAL LOG
// ============================================================
console.log('✅ تم تحميل supabase-client.js (النسخة النهائية مع clearSession ودوال الصلاحيات)');
