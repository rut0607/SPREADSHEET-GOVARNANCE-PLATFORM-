#!/bin/bash
# ============================================
# SPREADSHEET GOVERNANCE PLATFORM
# Environment Setup Script
# ============================================

echo "Setting up environment files..."

# Server environment
cat > ./server/.env << 'EOF'
# ============================================
# SERVER ENVIRONMENT VARIABLES
# ============================================

# Server Config
PORT=5000
NODE_ENV=development

# Supabase Config
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT Config
JWT_SECRET=your_jwt_secret_key_minimum_32_characters

# Google Sheets Config
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key

# Storage Config
SUPABASE_STORAGE_BUCKET=spreadsheet-files

# Frontend URL (for CORS)
CLIENT_URL=http://localhost:3000
EOF

# Client environment
cat > ./client/.env << 'EOF'
# ============================================
# CLIENT ENVIRONMENT VARIABLES
# ============================================

REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=http://localhost:5000/api
EOF

# Root environment example
cat > ./.env.example << 'EOF'
# ============================================
# ENVIRONMENT VARIABLES REFERENCE
# Copy relevant variables to server/.env and client/.env
# Never commit actual .env files to git
# ============================================

# SUPABASE
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# SERVER
PORT=5000
NODE_ENV=development
JWT_SECRET=minimum_32_character_secret_key

# GOOGLE SHEETS
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nyour_key_here\n-----END RSA PRIVATE KEY-----"

# STORAGE
SUPABASE_STORAGE_BUCKET=spreadsheet-files

# CLIENT
REACT_APP_API_URL=http://localhost:5000/api
EOF

echo "Environment files created successfully."
echo "Remember to fill in your actual values before starting the server."