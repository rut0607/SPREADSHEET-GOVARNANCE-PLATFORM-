-- ============================================
-- SPREADSHEET GOVERNANCE PLATFORM
-- Migration 003 - Push Subscriptions
-- ============================================
-- Run this manually against the Supabase database (SQL editor or psql) before
-- deploying the web-push feature, e.g.:
--   psql "$DATABASE_URL" -f database/migrations/003_push_subscriptions.sql
-- Then run `npx prisma generate` in /server so the Prisma client picks up
-- the new PushSubscription model.
-- ============================================

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(is_active);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions" ON push_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Admins can view all push subscriptions" ON push_subscriptions FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true)
);
