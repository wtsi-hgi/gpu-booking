"""Capacity calculations and booking validation rules."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import BookingValidation, CapacityWarning, DailyCapacity
from db.models import Booking, BookingStatus, GpuHostType

_CONFIRMED_STATUSES: tuple[BookingStatus, ...] = (
    BookingStatus.confirmed,
    BookingStatus.tentative,
    BookingStatus.spot,
)
_PENDING_STATUS = BookingStatus.unconfirmed
_USER_STATUSES: tuple[BookingStatus, ...] = (
    BookingStatus.confirmed,
    BookingStatus.tentative,
    BookingStatus.spot,
    BookingStatus.unconfirmed,
)


def _iter_days(start_date: date, end_date: date) -> list[date]:
    """Return all dates in the inclusive range [start_date, end_date]."""

    number_of_days = (end_date - start_date).days + 1
    return [start_date + timedelta(days=offset) for offset in range(number_of_days)]


def _booking_overlaps_day(booking: Booking, day: date) -> bool:
    """Return whether the booking overlaps the provided day."""

    return booking.start_date <= day <= booking.end_date


async def _load_gpu_host_types(
    session: AsyncSession,
    gpu_host_type_id: int | None = None,
) -> list[GpuHostType]:
    """Load GPU host type rows for either all types or one selected type."""

    statement = select(GpuHostType)
    if gpu_host_type_id is not None:
        statement = statement.where(GpuHostType.id == gpu_host_type_id)
    result = await session.execute(statement.order_by(GpuHostType.id))
    return list(result.scalars().all())


async def _load_overlapping_bookings(
    session: AsyncSession,
    start_date: date,
    end_date: date,
    exclude_booking_id: int | None = None,
) -> list[Booking]:
    """Load bookings that overlap the inclusive date range."""

    statement = select(Booking).where(
        Booking.start_date <= end_date,
        Booking.end_date >= start_date,
    )
    if exclude_booking_id is not None:
        statement = statement.where(Booking.id != exclude_booking_id)
    result = await session.execute(statement)
    return list(result.scalars().all())


async def get_daily_capacity(
    session: AsyncSession,
    start_date: date,
    end_date: date,
    gpu_host_type_id: int | None = None,
    user_email: str | None = None,
) -> list[DailyCapacity]:
    """Calculate daily capacity metrics for each requested day and GPU host type."""

    gpu_host_types = await _load_gpu_host_types(
        session, gpu_host_type_id=gpu_host_type_id
    )
    all_gpu_host_types = await _load_gpu_host_types(session)
    bookings = await _load_overlapping_bookings(session, start_date, end_date)

    total_capacity_all_types = sum(host.total_count for host in all_gpu_host_types)
    days = _iter_days(start_date, end_date)
    capacities: list[DailyCapacity] = []

    for day in days:
        user_used = 0
        if user_email is not None:
            user_used = sum(
                booking.host_count
                for booking in bookings
                if booking.user_email == user_email
                and booking.status in _USER_STATUSES
                and _booking_overlaps_day(booking, day)
            )

        user_percent = 0.0
        if total_capacity_all_types > 0:
            user_percent = (user_used / total_capacity_all_types) * 100

        for gpu_host_type in gpu_host_types:
            confirmed_used = sum(
                booking.host_count
                for booking in bookings
                if booking.gpu_host_type_id == gpu_host_type.id
                and booking.status in _CONFIRMED_STATUSES
                and _booking_overlaps_day(booking, day)
            )
            pending_used = sum(
                booking.host_count
                for booking in bookings
                if booking.gpu_host_type_id == gpu_host_type.id
                and booking.status == _PENDING_STATUS
                and _booking_overlaps_day(booking, day)
            )
            capacities.append(
                DailyCapacity(
                    date=day,
                    gpu_host_type_id=gpu_host_type.id,
                    gpu_type=gpu_host_type.gpu_type,
                    gpu_count=gpu_host_type.gpu_count,
                    total=gpu_host_type.total_count,
                    confirmed_used=confirmed_used,
                    pending_used=pending_used,
                    available=gpu_host_type.total_count - confirmed_used,
                    user_used=user_used,
                    user_percent=user_percent,
                    warnings=[],
                )
            )

    return capacities


async def validate_booking(
    session: AsyncSession,
    user_email: str,
    gpu_host_type_id: int,
    host_count: int,
    start_date: date,
    end_date: date,
    exclude_booking_id: int | None = None,
) -> BookingValidation:
    """Validate a proposed booking against capacity and warning rules."""

    warnings: list[CapacityWarning] = []
    blocked = False
    block_reason: str | None = None

    duration_days = (end_date - start_date).days + 1
    if duration_days > 14:
        warnings.append(
            CapacityWarning(
                rule="duration_max_14_days",
                message="Booking duration exceeds 14-day maximum",
                severity="warning",
            )
        )

    advance_notice_days = (start_date - date.today()).days
    if advance_notice_days < 14:
        warnings.append(
            CapacityWarning(
                rule="advance_notice_min_14_days",
                message="Less than 2 weeks advance notice",
                severity="warning",
            )
        )

    all_gpu_host_types = await _load_gpu_host_types(session)
    selected_gpu_host_type = next(
        (
            gpu_host_type
            for gpu_host_type in all_gpu_host_types
            if gpu_host_type.id == gpu_host_type_id
        ),
        None,
    )
    total_capacity_all_types = sum(host.total_count for host in all_gpu_host_types)

    bookings = await _load_overlapping_bookings(
        session,
        start_date,
        end_date,
        exclude_booking_id=exclude_booking_id,
    )

    if selected_gpu_host_type is None:
        return BookingValidation(
            valid=False,
            warnings=warnings,
            blocked=True,
            block_reason=f"GPU host type {gpu_host_type_id} not found",
        )

    forty_percent_warning_added = False
    for day in _iter_days(start_date, end_date):
        confirmed_used_for_host_type = sum(
            booking.host_count
            for booking in bookings
            if booking.gpu_host_type_id == gpu_host_type_id
            and booking.status in _CONFIRMED_STATUSES
            and _booking_overlaps_day(booking, day)
        )
        if (
            confirmed_used_for_host_type + host_count
            > selected_gpu_host_type.total_count
        ):
            blocked = True
            block_reason = f"100% host capacity exceeded for {day.isoformat()}"
            break

        user_used_existing = sum(
            booking.host_count
            for booking in bookings
            if booking.user_email == user_email
            and booking.status in _USER_STATUSES
            and _booking_overlaps_day(booking, day)
        )
        user_used_with_proposal = user_used_existing + host_count
        if (
            not forty_percent_warning_added
            and total_capacity_all_types > 0
            and user_used_with_proposal > total_capacity_all_types * 0.4
        ):
            warnings.append(
                CapacityWarning(
                    rule="user_capacity_40_percent",
                    message=(
                        "Proposed booking exceeds 40% per-user host capacity "
                        f"on {day.isoformat()}"
                    ),
                    severity="warning",
                )
            )
            forty_percent_warning_added = True

    return BookingValidation(
        valid=not blocked,
        warnings=warnings,
        blocked=blocked,
        block_reason=block_reason,
    )
