import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { full_name: 'Jane Doe', email: 'jane@example.com', role: { name: 'Manager' } },
    logout: jest.fn(),
    isAdmin: false
  })
}));

describe('Navbar', () => {
  it("displays the logged-in user's name", () => {
    render(
      <MemoryRouter>
        <Navbar onMenuToggle={() => {}} sidebarOpen={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });
});
