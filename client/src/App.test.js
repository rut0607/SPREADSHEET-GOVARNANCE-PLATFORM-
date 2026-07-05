import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the login page when the user is not authenticated', async () => {
  render(<App />);
  expect(await screen.findByText('Welcome Back')).toBeInTheDocument();
});
