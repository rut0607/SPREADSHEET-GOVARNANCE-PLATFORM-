-- ============================================
-- SPREADSHEET GOVERNANCE PLATFORM
-- Migration 004 - Weekly Reports
-- ============================================
-- Run this manually against the Supabase database (SQL editor or psql), then
-- run `npx prisma generate` in /server so the Prisma client picks up the new
-- WeeklyReport model.
-- ============================================

CREATE TABLE weekly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    report_data JSONB NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(week_start, week_end)
);

CREATE INDEX idx_weekly_reports_week_start ON weekly_reports(week_start);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view weekly reports" ON weekly_reports FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);
