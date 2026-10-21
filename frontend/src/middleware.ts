import { NextResponse, type NextRequest } from "next/server"

// Cheap guard: no cookie → login. Role checks happen client-side (useMe) and,
// authoritatively, in the backend.
export function middleware(req: NextRequest) {
  const hasToken = Boolean(req.cookies.get("zsp_token")?.value)
  if (!hasToken) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/app/:path*", "/portal/:path*"],
}
