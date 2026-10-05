-- ============================================================
-- CRM Migration v3: Complete Loan & Case Workspace Entities
-- Adds loan/financial details, updates case number format to CASE-000001
-- ============================================================

-- 1. Add financial and loan detail columns to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS loan_amount NUMERIC;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS loan_type TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS loan_tenure_months INT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS interest_rate NUMERIC;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS property_value NUMERIC;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS application_number TEXT;

-- 2. Update case number auto-generation trigger to CASE-000001 format (6 digits)
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(case_number, '\D', '', 'g'), '')::INT), 0) + 1
  INTO next_num
  FROM cases;
  NEW.case_number = 'CASE-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_case_number ON cases;
CREATE TRIGGER set_case_number
  BEFORE INSERT ON cases
  FOR EACH ROW
  WHEN (NEW.case_number IS NULL OR NEW.case_number = '')
  EXECUTE FUNCTION generate_case_number();

-- 3. Ensure permissions and refresh PostgREST schema cache
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
