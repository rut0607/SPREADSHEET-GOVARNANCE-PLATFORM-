const supabaseAdmin = {
  auth: {
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    admin: {
      createUser: jest.fn()
    }
  },
  storage: {
    from: jest.fn(() => ({
      list: jest.fn(),
      upload: jest.fn()
    }))
  }
};

const supabasePublic = {
  auth: {}
};

module.exports = { supabaseAdmin, supabasePublic };
