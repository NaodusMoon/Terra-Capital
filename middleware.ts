import { NextRequest, NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

function unauthorizedResponse() {
  return applySecurityHeaders(new NextResponse("Acceso restringido.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Terra Capital", charset="UTF-8"',
    },
  }));
}

function timingSafeStringEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export function middleware(request: NextRequest) {
  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return applySecurityHeaders(NextResponse.next());
  }

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  const encoded = authorization.slice(6).trim();
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorizedResponse();
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return unauthorizedResponse();
  }

  const receivedUser = decoded.slice(0, separator);
  const receivedPass = decoded.slice(separator + 1);

  if (!timingSafeStringEqual(receivedUser, username) || !timingSafeStringEqual(receivedPass, password)) {
    return unauthorizedResponse();
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/:path*"],
};
