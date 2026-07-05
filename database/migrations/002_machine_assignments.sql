-- ============================================
-- SPREADSHEET GOVERNANCE PLATFORM
-- Migration 002 - Machine Assignment & Production Efficiency
-- ============================================

-- ============================================
-- MACHINE ASSIGNMENTS
-- ============================================

CREATE TABLE machine_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    row_id UUID NOT NULL REFERENCES row_data(id) ON DELETE CASCADE,
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_machine_assignments_employee ON machine_assignments(employee_id);
CREATE INDEX idx_machine_assignments_row ON machine_assignments(row_id);
CREATE INDEX idx_machine_assignments_worksheet ON machine_assignments(worksheet_id);
CREATE INDEX idx_machine_assignments_active ON machine_assignments(is_active);

-- ============================================
-- EFFICIENCY THRESHOLDS
-- ============================================

CREATE TABLE efficiency_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    process_type VARCHAR(100) NOT NULL,
    min_threshold DECIMAL(5,2) DEFAULT 85.00,
    alert_enabled BOOLEAN DEFAULT true,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(worksheet_id, process_type)
);

CREATE INDEX idx_efficiency_thresholds_worksheet ON efficiency_thresholds(worksheet_id);

-- ============================================
-- DAILY PRODUCTION ENTRIES
-- ============================================

CREATE TABLE daily_production_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    row_id UUID NOT NULL REFERENCES row_data(id) ON DELETE CASCADE,
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    actual_output DECIMAL(15,2),
    target_output DECIMAL(15,2),
    oe_percentage DECIMAL(5,4),
    shift VARCHAR(20) DEFAULT 'day' CHECK (shift IN ('day', 'night')),
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'edited')),
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'not_applicable', 'synced', 'failed')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, row_id, entry_date)
);

CREATE INDEX idx_daily_entries_employee ON daily_production_entries(employee_id);
CREATE INDEX idx_daily_entries_row ON daily_production_entries(row_id);
CREATE INDEX idx_daily_entries_worksheet ON daily_production_entries(worksheet_id);
CREATE INDEX idx_daily_entries_date ON daily_production_entries(entry_date);

-- ============================================
-- EFFICIENCY ALERTS
-- ============================================

CREATE TABLE efficiency_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID REFERENCES daily_production_entries(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    worksheet_id UUID REFERENCES worksheets(id) ON DELETE CASCADE,
    row_id UUID REFERENCES row_data(id) ON DELETE CASCADE,
    alert_type VARCHAR(50),
    threshold_value DECIMAL(5,2),
    actual_value DECIMAL(5,4),
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_efficiency_alerts_employee ON efficiency_alerts(employee_id);
CREATE INDEX idx_efficiency_alerts_resolved ON efficiency_alerts(is_resolved);
CREATE INDEX idx_efficiency_alerts_entry ON efficiency_alerts(entry_id);

-- ============================================
-- UPDATED AT TRIGGERS
-- ============================================

CREATE TRIGGER trigger_machine_assignments_updated_at BEFORE UPDATE ON machine_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_efficiency_thresholds_updated_at BEFORE UPDATE ON efficiency_thresholds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_daily_production_entries_updated_at BEFORE UPDATE ON daily_production_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE machine_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE efficiency_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE efficiency_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own machine assignments" ON machine_assignments FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY "Admins can manage machine assignments" ON machine_assignments FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);

CREATE POLICY "Authenticated users can view efficiency thresholds" ON efficiency_thresholds FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage efficiency thresholds" ON efficiency_thresholds FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);

CREATE POLICY "Employees can view own production entries" ON daily_production_entries FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY "Employees can manage own production entries" ON daily_production_entries FOR ALL USING (employee_id = auth.uid());
CREATE POLICY "Admins can view all production entries" ON daily_production_entries FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);

CREATE POLICY "Admins can manage efficiency alerts" ON efficiency_alerts FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);
