-- ============================================
-- SPREADSHEET GOVERNANCE PLATFORM
-- Migration 001 - Initial Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & ROLES
-- ============================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SPREADSHEET SOURCES
-- ============================================

CREATE TABLE spreadsheet_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('excel', 'google_sheets')),
    file_path TEXT,
    google_sheet_id TEXT,
    google_sheet_url TEXT,
    is_active BOOLEAN DEFAULT true,
    sync_mode VARCHAR(20) DEFAULT 'manual' CHECK (sync_mode IN ('manual', 'scheduled', 'realtime')),
    source_of_truth VARCHAR(20) DEFAULT 'database' CHECK (source_of_truth IN ('database', 'google_sheets', 'excel')),
    conflict_resolution VARCHAR(30) DEFAULT 'keep_existing' CHECK (conflict_resolution IN ('overwrite', 'keep_existing', 'new_version', 'manual')),
    last_synced_at TIMESTAMPTZ,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SPREADSHEET VERSIONS
-- ============================================

CREATE TABLE spreadsheet_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES spreadsheet_sources(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_path TEXT,
    uploaded_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WORKSHEETS
-- ============================================

CREATE TABLE worksheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES spreadsheet_sources(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    sheet_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    row_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DYNAMIC COLUMN METADATA
-- ============================================

CREATE TABLE column_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    column_key VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    column_index INTEGER NOT NULL,
    data_type VARCHAR(50) DEFAULT 'text' CHECK (data_type IN ('text', 'number', 'date', 'currency', 'boolean', 'dropdown', 'email')),
    is_required BOOLEAN DEFAULT false,
    is_unique BOOLEAN DEFAULT false,
    is_identifier BOOLEAN DEFAULT false,
    dropdown_options JSONB,
    validation_rules JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(worksheet_id, column_key)
);

-- ============================================
-- DYNAMIC ROW DATA
-- ============================================

CREATE TABLE row_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    row_identifier TEXT,
    data JSONB NOT NULL DEFAULT '{}',
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_row_data_worksheet ON row_data(worksheet_id);
CREATE INDEX idx_row_data_identifier ON row_data(row_identifier);
CREATE INDEX idx_row_data_data ON row_data USING GIN(data);

-- ============================================
-- RBAC - ROLE PERMISSIONS
-- ============================================

CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES column_definitions(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, worksheet_id, column_id)
);

-- ============================================
-- RBAC - USER SPECIFIC OVERRIDES
-- ============================================

CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES column_definitions(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, worksheet_id, column_id)
);

-- ============================================
-- APPROVAL WORKFLOW
-- ============================================

CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requested_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    reviewed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
    row_id UUID NOT NULL REFERENCES row_data(id) ON DELETE CASCADE,
    column_id UUID NOT NULL REFERENCES column_definitions(id) ON DELETE CASCADE,
    previous_value TEXT,
    requested_value TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_status ON approval_requests(status);
CREATE INDEX idx_approval_requested_by ON approval_requests(requested_by);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    worksheet_id UUID REFERENCES worksheets(id) ON DELETE SET NULL,
    row_id UUID REFERENCES row_data(id) ON DELETE SET NULL,
    column_id UUID REFERENCES column_definitions(id) ON DELETE SET NULL,
    previous_value TEXT,
    new_value TEXT,
    metadata JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_action ON audit_logs(action_type);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'approval_request', 'approval_result')),
    is_read BOOLEAN DEFAULT false,
    related_approval_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- ============================================
-- UPDATED AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_spreadsheet_sources_updated_at BEFORE UPDATE ON spreadsheet_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_worksheets_updated_at BEFORE UPDATE ON worksheets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_column_definitions_updated_at BEFORE UPDATE ON column_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_row_data_updated_at BEFORE UPDATE ON row_data FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_role_permissions_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_user_permissions_updated_at BEFORE UPDATE ON user_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_approval_requests_updated_at BEFORE UPDATE ON approval_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spreadsheet_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE row_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON user_profiles FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Notifications policy
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- All authenticated users can view spreadsheet data
CREATE POLICY "Authenticated users can view row data" ON row_data FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view worksheets" ON worksheets FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view columns" ON column_definitions FOR SELECT USING (auth.role() = 'authenticated');