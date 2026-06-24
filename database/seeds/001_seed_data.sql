-- ============================================
-- SPREADSHEET GOVERNANCE PLATFORM
-- Seed File 001 - Initial Data
-- ============================================

-- ============================================
-- DEFAULT ROLES
-- ============================================

INSERT INTO roles (id, name, description, is_active) VALUES
(uuid_generate_v4(), 'Admin', 'Full system access and configuration', true),
(uuid_generate_v4(), 'Production', 'Manages production data and status updates', true),
(uuid_generate_v4(), 'Inventory', 'Manages inventory and stock records', true),
(uuid_generate_v4(), 'Accounts', 'Manages financial and payment records', true),
(uuid_generate_v4(), 'Dispatch', 'Manages dispatch and delivery information', true),
(uuid_generate_v4(), 'Supervisor', 'Oversees multiple departments with elevated view access', true),
(uuid_generate_v4(), 'Manager', 'Department manager with approval capabilities', true);