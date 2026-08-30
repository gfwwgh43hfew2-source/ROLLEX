// ============================================================
// manage-users  —  Supabase Edge Function
// ------------------------------------------------------------
// السبب الحقيقي لعدم عمل "إضافة مستخدم" بشكل صحيح:
//
//   الكود القديم في users.html كان يستدعي:
//       supabaseClient.auth.signUp({ email, password })
//   من المتصفح مباشرة. في Supabase، استدعاء signUp من طرف العميل
//   (client-side) يقوم تلقائياً بتسجيل دخول المتصفح بحساب المستخدم
//   الجديد ويستبدل جلسة الأدمن الحالية بجلسة الموظف الجديد.
//   بمعنى آخر: الأدمن كان "يطلع من حسابه" فعلياً كل مرة يضيف موظف.
//
//   بالإضافة لذلك، الحذف النهائي (hardDeleteUser) كان يحذف فقط
//   صف profiles، ولا يحذف حساب auth.users الحقيقي، فيظل المستخدم
//   المحذوف قادراً على تسجيل الدخول بنفس الإيميل وكلمة المرور!
//
// الحل: أي عملية تتطلب صلاحية Admin API (إنشاء مستخدم / حذف مستخدم
// نهائياً / إعادة تعيين كلمة مرور بدون معرفة القديمة) يجب أن تتم من
// خادم (Edge Function) باستخدام SERVICE_ROLE_KEY، وليس من المتصفح
// أبداً — لأن هذا المفتاح يعطي صلاحيات كاملة ولا يجب أن يظهر في أي
// كود جافاسكريبت يعمل على المتصفح.
//
// هذا الملف يتحقق أولاً أن من يستدعيه هو فعلاً Admin (أو Super Admin)
// تابع لنفس الشركة، ثم ينفذ العملية المطلوبة بأمان دون المساس بجلسة
// الأدمن نفسه.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MODULES = [
  'dashboard', 'sales', 'purchases', 'clients', 'suppliers',
  'materials', 'products', 'production', 'treasury', 'reports',
  'settings', 'users',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // --------------------------------------------------------
    // 0) قراءة متغيرات البيئة (يتم توفيرها تلقائياً من Supabase)
    // --------------------------------------------------------
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // عميل بصلاحيات كاملة (service role) — يستخدم فقط داخل السيرفر
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --------------------------------------------------------
    // 1) التحقق من هوية المستخدم الذي يستدعي الدالة (الأدمن)
    // --------------------------------------------------------
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();

    if (!callerToken) {
      return json({ error: 'لا يوجد توكن مصادقة' }, 401);
    }

    const { data: callerAuth, error: callerAuthError } =
      await supabaseAdmin.auth.getUser(callerToken);

    if (callerAuthError || !callerAuth?.user) {
      return json({ error: 'جلسة غير صالحة، يرجى تسجيل الدخول من جديد' }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_super_admin, is_active, deleted_at, company_id, company_name')
      .eq('id', callerAuth.user.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return json({ error: 'تعذر العثور على بروفايل المستخدم' }, 403);
    }

    const callerIsAdmin =
      callerProfile.is_super_admin === true || callerProfile.role === 'admin';

    if (!callerIsAdmin || callerProfile.is_active === false || callerProfile.deleted_at) {
      return json({ error: 'هذا الإجراء متاح فقط لمدير الشركة (Admin)' }, 403);
    }

    // --------------------------------------------------------
    // 2) قراءة الطلب
    // --------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // company_id المستهدف: نفس شركة الأدمن دائماً، إلا إذا كان
    // Super Admin ومرّر company_id صراحة (حالة إدارة عدة شركات)
    const targetCompanyId =
      callerProfile.is_super_admin && body.company_id
        ? body.company_id
        : callerProfile.company_id;

    if (!targetCompanyId) {
      return json({ error: 'تعذر تحديد الشركة' }, 400);
    }

    // ==========================================================
    // ACTION: create  — إضافة مستخدم جديد فعلياً بدون تسجيل خروج الأدمن
    // ==========================================================
    if (action === 'create') {
      const { name, email, password, role, is_active, permissions } = body;

      if (!name || !String(name).trim()) {
        return json({ error: 'يرجى إدخال الاسم' }, 400);
      }
      if (!email || !String(email).trim()) {
        return json({ error: 'يرجى إدخال البريد الإلكتروني' }, 400);
      }
      if (!password || String(password).length < 6) {
        return json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
      }

      // إنشاء المستخدم في نظام Auth باستخدام صلاحية الأدمن الكاملة
      // (email_confirm: true حتى لا يحتاج الموظف الجديد لتأكيد بريده)
      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: String(email).trim(),
          password: String(password),
          email_confirm: true,
          user_metadata: {
            name: String(name).trim(),
            role: role || 'employee',
            company_id: targetCompanyId,
          },
        });

      if (createError || !created?.user) {
        let msg = createError?.message || 'فشل إنشاء المستخدم';
        if (/already been registered|already exists/i.test(msg)) {
          msg = 'هذا البريد الإلكتروني مسجل بالفعل';
        }
        return json({ error: msg }, 400);
      }

      const newUserId = created.user.id;

      // إنشاء صف profiles المرتبط بالمستخدم الجديد
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: newUserId,
        name: String(name).trim(),
        email: String(email).trim(),
        role: role || 'employee',
        is_active: is_active !== false,
        company_id: targetCompanyId,
        company_name: callerProfile.company_name || null,
        deleted_at: null,
      });

      if (profileError) {
        // تراجع (rollback) — لا نترك حساب Auth بدون بروفايل
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return json({ error: 'فشل إنشاء بروفايل المستخدم: ' + profileError.message }, 400);
      }

      // إضافة صلاحيات الوصول لكل موديول
      if (permissions && typeof permissions === 'object') {
        const rows = Object.keys(permissions)
          .filter((m) => MODULES.includes(m))
          .map((moduleName) => {
            const p = permissions[moduleName] || {};
            return {
              company_id: targetCompanyId,
              user_id: newUserId,
              module: moduleName,
              can_view: !!p.view,
              can_add: !!p.add,
              can_edit: !!p.edit,
              can_delete: !!p.delete,
              can_export: !!p.export,
            };
          });

        if (rows.length > 0) {
          const { error: permError } = await supabaseAdmin
            .from('user_permissions')
            .insert(rows);
          if (permError) {
            console.error('permission insert error:', permError.message);
          }
        }
      }

      return json({ success: true, user: { id: newUserId, email, name } });
    }

    // ==========================================================
    // ACTION: reset_password — تغيير كلمة مرور مستخدم بدون معرفة القديمة
    // ==========================================================
    if (action === 'reset_password') {
      const { user_id, new_password } = body;
      if (!user_id || !new_password || String(new_password).length < 6) {
        return json({ error: 'بيانات غير مكتملة أو كلمة المرور قصيرة' }, 400);
      }

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, company_id')
        .eq('id', user_id)
        .single();

      if (!targetProfile) return json({ error: 'المستخدم غير موجود' }, 404);
      if (!callerProfile.is_super_admin && targetProfile.company_id !== callerProfile.company_id) {
        return json({ error: 'لا يمكنك التعديل على مستخدم خارج شركتك' }, 403);
      }

      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: String(new_password),
      });

      if (pwError) return json({ error: pwError.message }, 400);

      return json({ success: true });
    }

    // ==========================================================
    // ACTION: delete — حذف نهائي حقيقي (auth + profile + permissions)
    // ==========================================================
    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id مطلوب' }, 400);

      if (user_id === callerProfile.id) {
        return json({ error: 'لا يمكنك حذف حسابك الخاص' }, 400);
      }

      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, company_id')
        .eq('id', user_id)
        .single();

      if (!targetProfile) return json({ error: 'المستخدم غير موجود' }, 404);
      if (!callerProfile.is_super_admin && targetProfile.company_id !== callerProfile.company_id) {
        return json({ error: 'لا يمكنك حذف مستخدم خارج شركتك' }, 403);
      }

      await supabaseAdmin.from('user_permissions').delete().eq('user_id', user_id);
      await supabaseAdmin.from('profiles').delete().eq('id', user_id);

      const { error: delAuthError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (delAuthError) {
        // البروفايل اتحذف بالفعل، لكن نبلغ بالمشكلة لو حساب auth فضل موجود
        return json({
          success: true,
          warning: 'تم حذف البروفايل لكن حدث خطأ أثناء حذف حساب الدخول: ' + delAuthError.message,
        });
      }

      return json({ success: true });
    }

    return json({ error: 'action غير معروف' }, 400);
  } catch (err) {
    console.error('manage-users error:', err);
    return json({ error: 'خطأ في الخادم: ' + (err?.message || String(err)) }, 500);
  }
});
