-- ============================================
-- SPREADSHEET GOVERNANCE PLATFORM
-- Migration 005 - Machine Downtime Tracking
-- ============================================
-- Run this manually against the Supabase database (SQL editor or psql), then
-- run `npx prisma generate` in /server so the Prisma client picks up the new
-- MachineDowntime model.
-- ============================================

CREATE TABLE machine_downtime (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    row_id UUID NOT NULL REFERENCES row_data(id) ON DELETE CASCADE,
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    downtime_date DATE NOT NULL,
    category VARCHAR(50) NOT NULL,
    reason VARCHAR(100) NOT NULL,
    custom_reason TEXT,
    duration_hours DECIMAL(4,2) NOT NULL,
    shift VARCHAR(20) DEFAULT 'day' CHECK (shift IN ('day', 'night')),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'resolved')),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_machine_downtime_employee ON machine_downtime(employee_id);
CREATE INDEX idx_machine_downtime_row ON machine_downtime(row_id);
CREATE INDEX idx_machine_downtime_date ON machine_downtime(downtime_date);

CREATE TRIGGER trigger_machine_downtime_updated_at BEFORE UPDATE ON machine_downtime FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE machine_downtime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can insert own downtime records" ON machine_downtime FOR INSERT WITH CHECK (employee_id = auth.uid());
CREATE POLICY "Employees can view own downtime records" ON machine_downtime FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY "Admins can view all downtime records" ON machine_downtime FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);
