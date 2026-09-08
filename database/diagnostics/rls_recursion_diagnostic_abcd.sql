-- ============================================================================
-- MediKiosk: RLS Recursion Diagnostic - Sections A-D (READ-ONLY)
-- ============================================================================
-- Run this script in the Supabase SQL Editor to inspect RLS configuration
-- WITHOUT triggering the recursion error (Section E excluded).
-- Nothing here modifies any database object.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Which tables have RLS enabled?
-- ----------------------------------------------------------------------------
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_force
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('patients','users','interviews','user_hospitals','doctors')
ORDER BY c.relname;

-- ----------------------------------------------------------------------------
-- B. ALL policies on the five tables (full expressions)
-- ----------------------------------------------------------------------------
SELECT
    n.nspname AS schema,
    c.relname AS table_name,
    p.polname AS policy_name,
    p.polcmd AS command,          -- 'r'=SELECT,'a'=INSERT,'w'=UPDATE,'d'=DELETE
    p.polroles::regrole[] AS roles,
    p.polqual AS using_expression,
    p.polwithcheck AS with_check_expression
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('patients','users','interviews','user_hospitals','doctors')
ORDER BY c.relname, p.polcmd, p.polname;

-- ----------------------------------------------------------------------------
-- C. Helper / security-definer functions used by policies
--    (lists all security-definer functions in public schema)
-- ----------------------------------------------------------------------------
SELECT
    n.nspname AS schema,
    p.proname AS function_name,
    p.prokind AS kind,            -- 'f'=normal,'w'=window,'a'=aggregate
    p.prosecdef AS security_definer,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

-- ----------------------------------------------------------------------------
-- D. Cross-reference: which policy references which table
--    (scans USING/WITH CHECK text for table names)
--    Uses pg_policies view (qual / with_check are text) instead of pg_policy
--    columns (polqual / polwithcheck are pg_node_tree and cannot be cast to text).
-- ----------------------------------------------------------------------------
WITH policy_exprs AS (
    SELECT
        tablename AS table_name,
        policyname AS policy_name,
        cmd AS command,
        qual AS using_expr,
        with_check AS with_check_expr
    FROM pg_policies
    WHERE schemaname = 'public'
)
SELECT
    table_name,
    policy_name,
    command,
    string_agg(DISTINCT ref, ', ') AS tables_referenced_in_expression
FROM (
    SELECT
        table_name,
        policy_name,
        command,
        regexp_replace(
            COALESCE(using_expr,'') || ' ' || COALESCE(with_check_expr,''),
            '\y(users|patients|interviews|doctors|user_hospitals|hospitals|departments|auth\.users)\y',
            '\1',
            'g'
        ) AS expr
    FROM policy_exprs
), unnest(string_to_array(expr, ' ')) AS ref
WHERE ref IN ('users','patients','interviews','doctors','user_hospitals','hospitals','departments','auth.users')
GROUP BY table_name, policy_name, command
ORDER BY table_name, command, policy_name;