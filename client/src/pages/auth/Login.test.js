import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

const mockLogin = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, isAdmin: false })
}));

describe('Login', () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it('renders the login form with email and password fields', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows a spinner on the submit button while the login request is in flight', () => {
    // A never-resolving promise is enough to assert the loading state — we don't
    // need the request to complete for this test.
    mockLogin.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('your@email.com'), {
      target: { value: 'jane@example.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.queryByText('Sign In')).not.toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledWith('jane@example.com', 'password123');
  });
});
