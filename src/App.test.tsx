import React from 'react';
import { render, screen } from '@testing-library/react';
import Speaking from './Speaking';

test('renders learn react link', () => {
  render(<Speaking />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
