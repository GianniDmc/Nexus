import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
    const pathname = req.nextUrl.pathname;

    // Protect admin plus sensitive pipeline endpoints.
    const requiresAuth =
        pathname.startsWith('/admin') ||
        pathname.startsWith('/api/admin') ||
        pathname === '/api/process' ||
        pathname === '/api/ingest';

    if (!requiresAuth) {
        return NextResponse.next();
    }

    // Get Auth Header
    const basicAuth = req.headers.get('authorization');

    if (basicAuth?.startsWith('Basic ')) {
        try {
            const authValue = basicAuth.split(' ')[1];
            const [user, pwd] = atob(authValue).split(':');

            // Verify credentials
            const validUser = process.env.ADMIN_USER || 'admin';
            const validPass = process.env.ADMIN_PASSWORD;

            if (user === validUser && pwd === validPass) {
                return NextResponse.next();
            }
        } catch {
            // Ignore malformed headers and fall through to 401
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
    matcher: ['/admin/:path*', '/api/admin/:path*', '/api/process', '/api/ingest'],
};
