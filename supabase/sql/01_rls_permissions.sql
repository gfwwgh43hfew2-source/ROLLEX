-- ============================================================
-- تفعيل حقيقي لنظام الصلاحيات على مستوى قاعدة البيانات (RLS)
-- ============================================================
-- ⚠️ اقرأ هذا أولاً:
-- التطبيق الحالي يستخدم مفتاح anon من المتصفح مباشرة في كل الصفحات
-- (سواء عبر SDK أو fetch مباشر لـ /rest/v1/...). هذا يعني أن أي فحص
-- صلاحيات يتم فقط في الجافاسكريبت (hasPermission, checkPageAccess)
-- هو فحص "شكلي" يمكن لأي مستخدم تجاوزه بسهولة عبر Console المتصفح
-- أو باستدعاء REST API مباشرة بنفس التوكن الخاص به.
--
-- الحماية الحقيقية الوحيدة تكون من خلال Row Level Security (RLS) في
-- Postgres، بحيث تفرض قاعدة البيانات نفسها من يقدر يشوف/يضيف/يعدل/
-- يحذف أي صف، بغض النظر عمّا يفعله الكود في المتصفح.
--
-- ⚠️ هذا الملف "قالب" مبني على قراءة الكود الفعلي لجميع صفحات المشروع
-- (أسماء الجداول وأعمدة company_id تم استخراجها من الاستخدام الفعلي في
-- الكود). راجعه وقارنه بمخطط قاعدتك الفعلي في Supabase Studio > Table
-- Editor قبل التنفيذ، ويُفضّل تجربته أولاً على مشروع تجريبي (staging)
-- قبل تطبيقه على قاعدة الإنتاج لأنه يتضمن جداول مالية (فواتير/خزينة).
-- ============================================================


-- ------------------------------------------------------------
-- 1) دوال مساعدة (Security Definer لتفادي recursion في RLS)
-- ------------------------------------------------------------

create or replace function public.my_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_admin_or_super()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select (is_super_admin = true or role = 'admin')
       and is_active = true
       and deleted_at is null
     from public.profiles
     where id = auth.uid()),
    false
  )
$$;

-- has_perm: الأدمن/السوبر أدمن يعدّون دائماً "مسموح لهم" في كل شيء.
-- غير ذلك، يتم الرجوع لجدول user_permissions.
create or replace function public.has_perm(p_module text, p_action text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result boolean;
begin
  if public.is_admin_or_super() then
    return true;
  end if;

  select case p_action
           when 'view'   then can_view
           when 'add'    then can_add
           when 'edit'   then can_edit
           when 'delete' then can_delete
           when 'export' then can_export
           else false
         end
  into v_result
  from public.user_permissions
  where user_id = auth.uid()
    and module = p_module
    and company_id = public.my_company_id()
  limit 1;

  return coalesce(v_result, false);
end;
$$;


-- ------------------------------------------------------------
-- 2) profiles و user_permissions (جدول المستخدمين نفسه)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  using (
    id = auth.uid()                       -- كل مستخدم يشوف نفسه دائماً
    or (company_id = public.my_company_id() and public.has_perm('users','view'))
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert
  with check (false); -- الإضافة فقط عبر Edge Function (service role) وليس مباشرة

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  using (
    id = auth.uid()
    or (company_id = public.my_company_id() and public.is_admin_or_super())
  )
  with check (
    company_id = public.my_company_id()
  );

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete
  using (false); -- الحذف النهائي فقط عبر Edge Function (لازم يمسح Auth كمان)

alter table public.user_permissions enable row level security;

drop policy if exists user_permissions_select on public.user_permissions;
create policy user_permissions_select on public.user_permissions
  for select
  using (
    user_id = auth.uid()
    or (company_id = public.my_company_id() and public.is_admin_or_super())
  );

drop policy if exists user_permissions_write on public.user_permissions;
create policy user_permissions_write on public.user_permissions
  for all
  using (company_id = public.my_company_id() and public.is_admin_or_super())
  with check (company_id = public.my_company_id() and public.is_admin_or_super());


-- ------------------------------------------------------------
-- 3) دالة عامة لتوليد سياسات جدول "عادي" فيه عمود company_id
-- ------------------------------------------------------------
-- بدل تكرار نفس 4 أسطر CREATE POLICY لكل جدول، هذه الدالة تطبقهم
-- تلقائياً. استخدمها هكذا:
--   select public.apply_module_rls('clients', 'clients');
--   select public.apply_module_rls('client_payments', 'clients');
--   select public.apply_module_rls('suppliers', 'suppliers');
-- المعامل الأول = اسم الجدول، الثاني = اسم الموديول في user_permissions

create or replace function public.apply_module_rls(p_table text, p_module text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);

  execute format('drop policy if exists %I on public.%I', p_table || '_select', p_table);
  execute format($f$
    create policy %I on public.%I for select
      using (company_id = public.my_company_id() and public.has_perm(%L, 'view'))
  $f$, p_table || '_select', p_table, p_module);

  execute format('drop policy if exists %I on public.%I', p_table || '_insert', p_table);
  execute format($f$
    create policy %I on public.%I for insert
      with check (company_id = public.my_company_id() and public.has_perm(%L, 'add'))
  $f$, p_table || '_insert', p_table, p_module);

  execute format('drop policy if exists %I on public.%I', p_table || '_update', p_table);
  execute format($f$
    create policy %I on public.%I for update
      using (company_id = public.my_company_id() and public.has_perm(%L, 'edit'))
      with check (company_id = public.my_company_id())
  $f$, p_table || '_update', p_table, p_module);

  execute format('drop policy if exists %I on public.%I', p_table || '_delete', p_table);
  execute format($f$
    create policy %I on public.%I for delete
      using (company_id = public.my_company_id() and public.has_perm(%L, 'delete'))
  $f$, p_table || '_delete', p_table, p_module);
end;
$$;

-- تطبيق على الجداول التي تحتوي عمود company_id مباشرة
-- (تأكد من الأسماء والأعمدة في Table Editor قبل التشغيل)
select public.apply_module_rls('clients', 'clients');
select public.apply_module_rls('client_payments', 'clients');
select public.apply_module_rls('client_transactions', 'clients');
select public.apply_module_rls('suppliers', 'suppliers');
select public.apply_module_rls('materials', 'materials');
select public.apply_module_rls('raw_material_movements', 'materials');
select public.apply_module_rls('products', 'products');
select public.apply_module_rls('semi_finished_products', 'products');
select public.apply_module_rls('formulations', 'products');
select public.apply_module_rls('finished_goods_movements', 'products');
select public.apply_module_rls('warehouses', 'products');
select public.apply_module_rls('production_orders', 'production');
select public.apply_module_rls('sales_invoices', 'sales');
select public.apply_module_rls('invoices', 'sales');
select public.apply_module_rls('return_invoices', 'sales');
select public.apply_module_rls('purchase_invoices', 'purchases');
select public.apply_module_rls('treasuries', 'treasury');
select public.apply_module_rls('treasury', 'treasury');
select public.apply_module_rls('treasury_transactions', 'treasury');
select public.apply_module_rls('settings', 'settings');
select public.apply_module_rls('general_tabs', 'settings');
select public.apply_module_rls('admin_settings', 'settings');


-- ------------------------------------------------------------
-- 4) جداول "بنود فرعية" (items) بدون عمود company_id مباشر
-- ------------------------------------------------------------
-- هذه الجداول ترتبط بالجدول الأب عبر foreign key، وليس لديها
-- company_id خاص بها. الحل هنا: التحقق عبر EXISTS على الجدول الأب.
-- عدّل اسم عمود الـ FK إذا كان مختلفاً في قاعدتك.

create or replace function public.apply_child_rls(
  p_table text, p_module text, p_parent_table text, p_fk_column text
)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);

  execute format('drop policy if exists %I on public.%I', p_table || '_all', p_table);
  execute format($f$
    create policy %I on public.%I for all
      using (
        exists (
          select 1 from public.%I parent
          where parent.id = public.%I.%I
            and parent.company_id = public.my_company_id()
        )
        and public.has_perm(%L, 'view')
      )
      with check (
        exists (
          select 1 from public.%I parent
          where parent.id = public.%I.%I
            and parent.company_id = public.my_company_id()
        )
      )
  $f$, p_table || '_all', p_table, p_parent_table, p_table, p_fk_column,
       p_module, p_parent_table, p_table, p_fk_column);
end;
$$;

select public.apply_child_rls('sales_invoice_items', 'sales', 'sales_invoices', 'invoice_id');
select public.apply_child_rls('purchase_invoice_items', 'purchases', 'purchase_invoices', 'invoice_id');
select public.apply_child_rls('return_invoice_items', 'sales', 'return_invoices', 'return_invoice_id');
select public.apply_child_rls('production_order_items', 'production', 'production_orders', 'production_order_id');
select public.apply_child_rls('formulation_items', 'products', 'formulations', 'formulation_id');

-- ============================================================
-- ملاحظات مهمة قبل التنفيذ على قاعدة الإنتاج:
-- 1) شغّل الملف كاملاً في Supabase Studio > SQL Editor.
-- 2) بعد التنفيذ، جرّب تسجيل الدخول بمستخدم "موظف" بصلاحيات محدودة،
--    وتأكد أنه فعلاً لا يقدر يشوف/يعدل غير اللي مسموح له بيه.
-- 3) لو ظهر خطأ "column company_id does not exist" على أي جدول،
--    يعني الجدول ده اسمه أو أعمدته مختلفة عن الافتراض هنا — عدّل
--    السطر الخاص به أو احذفه من القائمة وأرسل لي اسم الجدول الصحيح.
-- 4) دالة apply_child_rls تفترض عمود الشركة على الجدول الأب اسمه
--    "company_id" وعمود المعرف "id" — عدّلها لو مختلف.
-- ============================================================
