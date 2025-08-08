import React from 'react';
import { render, screen } from '@testing-library/react';
import UserOrderDetails from '../UserOrderDetails';

test('renders UserOrderDetails component', () => {
    render(<UserOrderDetails />);
    const linkElement = screen.getByText(/order details/i);
    expect(linkElement).toBeInTheDocument();
});