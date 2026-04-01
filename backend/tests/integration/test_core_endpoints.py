from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_root_health_and_favicon_endpoints(client):
    root_response = client.get("/")
    assert root_response.status_code == 200
    assert root_response.json()["name"] == "MTUCI Backend"

    health_response = client.get("/health")
    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"

    favicon_response = client.get("/favicon.ico")
    assert favicon_response.status_code == 204


def test_robots_and_sitemap_are_generated(client):
    robots_response = client.get("/robots.txt")
    assert robots_response.status_code == 200
    assert "Disallow: /админ" in robots_response.text

    sitemap_response = client.get("/sitemap.xml")
    assert sitemap_response.status_code == 200
    assert "<urlset" in sitemap_response.text
    assert "/%D0%BE%D0%BF%D1%80%D0%BE%D1%81%D1%8B" in sitemap_response.text
