"""Version 1 API routes.

Having a versioned API namespace makes it easier to evolve
endpoints over time without breaking existing clients.
"""

from fastapi import APIRouter

from . import admin, auth, bookings, capacity, greetings, health, reference_data

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(greetings.router, tags=["greetings"])
api_router.include_router(bookings.router, tags=["bookings"])
api_router.include_router(capacity.router, tags=["capacity"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(reference_data.router, tags=["reference-data"])
api_router.include_router(admin.router, tags=["admin"])

__all__ = ["api_router"]
