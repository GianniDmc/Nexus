import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    // Only protect /admin and /api/admin routes
    if (!req.nextUrl.pathname.startsWith('/admin') && !req.nextUrl.pathname.startsWith('/api/admin')) {
        return NextResponse.next();
    }

    // Get Auth Header
    const basicAuth = req.headers.get('authorization');

    if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        const [user, pwd] = atob(authValue).split(':');

        // Verify credentials
        const validUser = process.env.ADMIN_USER || 'admin';
        const validPass = process.env.ADMIN_PASSWORD;

        if (user === validUser && pwd === validPass) {
            return NextResponse.next();
        }
    }

    // If missing or invalid, trigger browser login prompt
    return new NextResponse('Authentication Required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Secure Admin Area"',
        },
    });
}

export const config = {
    matcher: ['/admin/:path*', '/api/admin/:path*'],
};
