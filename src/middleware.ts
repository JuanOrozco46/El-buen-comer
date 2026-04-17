import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (!token) {
        return NextResponse.redirect(new URL('/login', req.url));
    }

    const role = token.role as string;

    // --- RBAC RULES ---

    // 1. Admin-only areas (Inventory, Settings, Dashboard Root)
    // If a non-admin tries to access root '/', redirect them to their specific area
    if (path === '/' && role !== 'ADMIN') {
        if (role === 'WAITER' || role === 'CASHIER') {
            return NextResponse.redirect(new URL('/pos', req.url));
        }
        if (role === 'CHEF') {
            return NextResponse.redirect(new URL('/kitchen', req.url));
        }
    }

    if (path.startsWith('/admin') && role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/', req.url)); // Handled by previous rule
    }

    // 2. Kitchen Area
    // Only Chef and Admin can access Kitchen. Waiters and Cashiers shouldn't need it.
    if (path.startsWith('/kitchen') && !['ADMIN', 'CHEF'].includes(role)) {
        return NextResponse.redirect(new URL('/pos', req.url));
    }

    // 3. POS Area
    // Only Admin, Cashier, and Waiter can access POS. Chefs shouldn't.
    if (path.startsWith('/pos') && !['ADMIN', 'CASHIER', 'WAITER'].includes(role)) {
        return NextResponse.redirect(new URL('/kitchen', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
};
