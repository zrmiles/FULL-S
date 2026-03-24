import os
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Request, Response
from fastapi.responses import PlainTextResponse

router = APIRouter(tags=["core"])

INDEXABLE_ROUTES = (
    ("/", "weekly", "0.8"),
    ("/опросы", "daily", "1.0"),
    ("/результаты", "daily", "0.7"),
)
DISALLOWED_ROUTES = (
    "/админ",
    "/профиль",
    "/новый-опрос",
    "/голосование",
    "/успех",
)


def frontend_base_url() -> str:
    return os.getenv("PUBLIC_BASE_URL", "http://localhost:5173").rstrip("/")


@router.get("/")
def root():
    return {"name": "MTUCI Backend", "version": "0.1.0", "docs": "/docs"}


@router.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@router.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@router.get("/robots.txt", include_in_schema=False)
def robots(request: Request):
    backend_base = str(request.base_url).rstrip("/")
    lines = [
        "User-agent: *",
        "Allow: /",
        "Allow: /опросы",
        "Allow: /результаты",
    ]
    for path in DISALLOWED_ROUTES:
        lines.append(f"Disallow: {path}")
    lines.append("Disallow: /docs")
    lines.append("Disallow: /openapi.json")
    lines.append(f"Sitemap: {backend_base}/sitemap.xml")
    return PlainTextResponse("\n".join(lines) + "\n")


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    base = frontend_base_url()
    lastmod = datetime.now(timezone.utc).date().isoformat()
    urls = []
    for path, changefreq, priority in INDEXABLE_ROUTES:
        encoded_path = quote(path, safe="/")
        loc = f"{base}{encoded_path}" if path != "/" else f"{base}/"
        urls.append(
            "\n".join(
                [
                    "  <url>",
                    f"    <loc>{loc}</loc>",
                    f"    <lastmod>{lastmod}</lastmod>",
                    f"    <changefreq>{changefreq}</changefreq>",
                    f"    <priority>{priority}</priority>",
                    "  </url>",
                ]
            )
        )

    payload = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{"\n".join(urls)}\n'
        "</urlset>\n"
    )
    return Response(content=payload, media_type="application/xml")
